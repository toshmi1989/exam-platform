// apps/api/src/index.ts

import express from 'express';
import compression from 'compression';
import type { Request, Response, NextFunction } from 'express';
import attemptsRouter from './modules/attempts/attempts.routes';
import categoriesRouter from './modules/categories/categories.routes';
import adminRouter from './modules/admin/admin.routes';
import chatRouter from './modules/chat/chat.routes';
import broadcastsRouter from './modules/broadcasts/broadcasts.routes';
import examsRouter from './modules/exams/exams.routes';
import paymentsRouter from './modules/payments/payments.routes';
import aiRouter from './modules/ai/ai.routes';
import { attachUserFromHeader } from './middlewares/attachUser.middleware';
import { requireAcceptedTerms } from './middlewares/requireAcceptedTerms.middleware';
import {
  parseTelegramUser,
  parseTelegramUserFromWidget,
  verifyTelegramInitData,
  verifyTelegramWidgetAuth,
} from './auth/telegram';
import { prisma } from './db/prisma';
import { isBlacklisted } from './modules/admin/admin.store';
import { getAccessSettings } from './modules/settings/accessSettings.service';
import { AGREEMENT_VERSION } from './constants/agreement';

const app = express();

app.use(compression());
app.use(express.json({ limit: '25mb' })); // chat images + admin Excel import (base64 ~+33%)
app.use((req, res, next) => {
  res.setHeader(
    'Access-Control-Allow-Origin',
    process.env.CORS_ORIGIN ?? '*'
  );
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,x-telegram-id');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }
  return next();
});
app.use(attachUserFromHeader);
app.use((req, res, next) => {
  requireAcceptedTerms(req, res, next).catch(next);
});
app.use('/categories', categoriesRouter);
app.use('/exams', examsRouter);

// TODO: add auth middleware that populates req.user from Telegram.
app.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok' });
});

app.get('/api', (_req, res) => {
  res.status(200).json({ status: 'ok' });
});

app.get('/me', async (req, res, next) => {
  const userId = req.user?.id;
  const telegramId = req.user?.telegramId;
  if (!userId || !telegramId) {
    return res.status(401).json({ ok: false, reasonCode: 'AUTH_REQUIRED' });
  }
  try {
    const now = new Date();
    const [user, subscription, settings] = await Promise.all([
      prisma.user.findUnique({
        where: { telegramId },
        select: { acceptedTerms: true, acceptedAt: true, agreementVersion: true },
      }),
      prisma.userSubscription.findFirst({
        where: {
          userId,
          status: 'ACTIVE',
          startsAt: { lte: now },
          endsAt: { gt: now },
        },
        select: { endsAt: true },
      }),
      getAccessSettings(),
    ]);
    return res.json({
      telegramId,
      acceptedTerms: user?.acceptedTerms ?? false,
      acceptedAt: user?.acceptedAt?.toISOString() ?? null,
      agreementVersion: user?.agreementVersion ?? null,
      subscriptionActive: Boolean(subscription),
      subscriptionEndsAt: subscription?.endsAt?.toISOString(),
      oneTimePrice: settings.oneTimePrice,
      subscriptionPrice: settings.subscriptionPrice,
    });
  } catch (e) {
    next(e);
  }
});

app.post('/accept-agreement', async (req, res, next) => {
  const userId = req.user?.id;
  const telegramId = req.user?.telegramId;
  if (!userId || !telegramId) {
    return res.status(401).json({ ok: false, reasonCode: 'AUTH_REQUIRED' });
  }
  try {
    const now = new Date();
    // upsert: create user if missing (e.g. after widget login), avoid P2025
    await prisma.user.upsert({
      where: { telegramId },
      update: {
        acceptedTerms: true,
        acceptedAt: now,
        agreementVersion: AGREEMENT_VERSION,
      },
      create: {
        id: userId,
        telegramId,
        acceptedTerms: true,
        acceptedAt: now,
        agreementVersion: AGREEMENT_VERSION,
      },
    });
    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error('[accept-agreement]', e);
    return res.status(500).json({
      ok: false,
      reasonCode: 'INTERNAL_ERROR',
      message: 'Не удалось сохранить соглашение. Проверьте, что миграция БД применена (acceptedTerms, acceptedAt, agreementVersion).',
    });
  }
});

app.post('/payments/one-time', async (req, res, next) => {
  const userId = req.user?.id;
  if (!userId) {
    return res.status(401).json({ ok: false, reasonCode: 'AUTH_REQUIRED' });
  }
  const examId = typeof req.body?.examId === 'string' ? req.body.examId.trim() : '';
  if (!examId) {
    return res.status(400).json({ ok: false, reasonCode: 'INVALID_EXAM' });
  }
  try {
    const exam = await prisma.exam.findUnique({ where: { id: examId }, select: { id: true } });
    if (!exam) {
      return res.status(404).json({ ok: false, reasonCode: 'EXAM_NOT_FOUND' });
    }
    const existing = await prisma.oneTimeAccess.findFirst({
      where: { userId, examId, consumedAt: null },
      select: { id: true },
    });
    if (existing) {
      return res.json({ ok: true });
    }
    await prisma.oneTimeAccess.create({
      data: { userId, examId },
    });
    return res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

app.post('/auth/telegram', (req, res) => {
  const initData = req.body?.initData as string | undefined;
  if (!initData) {
    return res.status(401).json({ ok: false });
  }

  const adminAllowlist = (process.env.ADMIN_TELEGRAM_IDS ?? '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);

  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) {
    return res.status(500).json({ ok: false, error: 'Missing bot token' });
  }

  const isValid = verifyTelegramInitData(initData, botToken);
  if (!isValid) {
    return res.status(401).json({ ok: false });
  }

  const user = parseTelegramUser(initData);
  if (!user) {
    return res.status(401).json({ ok: false });
  }
  if (isBlacklisted(user.telegramId)) {
    return res.status(503).end();
  }

  const userId = `tg-${user.telegramId}`;
  const isAdmin = adminAllowlist.includes(user.telegramId);

  prisma.user
    .upsert({
      where: { telegramId: user.telegramId },
      update: {
        firstName: user.firstName,
        username: user.username,
      },
      create: {
        id: userId,
        telegramId: user.telegramId,
        firstName: user.firstName,
        username: user.username,
        role: 'USER',
      },
    })
    .then(() => {
      req.user = {
        id: userId,
        telegramId: user.telegramId,
        role: isAdmin ? 'admin' : 'authorized',
      };

      return res.status(200).json({
        ok: true,
        isTelegramUser: true,
        telegramId: user.telegramId,
        firstName: user.firstName,
        username: user.username,
        role: isAdmin ? 'admin' : 'authorized',
        isAdmin,
      });
    })
    .catch((err) => {
      console.error('[auth] user upsert failed', err);
      return res.status(500).json({ ok: false });
    });
});

app.post('/auth/telegram-widget', (req, res) => {
  const payload = req.body as {
    id?: number;
    first_name?: string;
    last_name?: string;
    username?: string;
    photo_url?: string;
    auth_date?: number;
    hash?: string;
  };

  if (
    typeof payload?.id !== 'number' ||
    typeof payload?.auth_date !== 'number' ||
    typeof payload?.hash !== 'string'
  ) {
    return res.status(401).json({ ok: false });
  }

  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) {
    return res.status(500).json({ ok: false, error: 'Missing bot token' });
  }

  const widgetPayload = {
    id: payload.id,
    first_name: payload.first_name,
    last_name: payload.last_name,
    username: payload.username,
    photo_url: payload.photo_url,
    auth_date: payload.auth_date,
    hash: payload.hash,
  };

  if (!verifyTelegramWidgetAuth(widgetPayload, botToken)) {
    return res.status(401).json({ ok: false });
  }

  const user = parseTelegramUserFromWidget(widgetPayload);
  if (isBlacklisted(user.telegramId)) {
    return res.status(503).end();
  }

  const adminAllowlist = (process.env.ADMIN_TELEGRAM_IDS ?? '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);
  const userId = `tg-${user.telegramId}`;
  const isAdmin = adminAllowlist.includes(user.telegramId);

  prisma.user
    .upsert({
      where: { telegramId: user.telegramId },
      update: {
        firstName: user.firstName,
        username: user.username,
      },
      create: {
        id: userId,
        telegramId: user.telegramId,
        firstName: user.firstName,
        username: user.username,
        role: 'USER',
      },
    })
    .then(() => {
      return res.status(200).json({
        ok: true,
        isTelegramUser: true,
        telegramId: user.telegramId,
        firstName: user.firstName,
        username: user.username,
        role: isAdmin ? 'admin' : 'authorized',
        isAdmin,
      });
    })
    .catch((err) => {
      console.error('[auth/telegram-widget] user upsert failed', err);
      return res.status(500).json({ ok: false });
    });
});

app.use('/attempts', attemptsRouter);
app.use('/ai', aiRouter);
app.use('/admin', adminRouter);
app.use('/chat', chatRouter);
app.use('/broadcasts', broadcastsRouter);
app.use('/payments', paymentsRouter);

app.use((_req, res) => {
  res.status(404).json({ status: 'not_found' });
});

// Global error handler: unhandled rejections in async routes end up here
app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
  if (err && typeof err === 'object' && 'type' in err && err.type === 'entity.too.large') {
    if (!res.headersSent) {
      return res.status(413).json({ ok: false, error: 'Request entity too large' });
    }
  }
  console.error('[API error]', err);
  if (res.headersSent) return;
  res.status(500).json({ ok: false, reasonCode: 'INTERNAL_ERROR' });
});

const port = process.env.PORT ? Number(process.env.PORT) : 3001;
app.listen(port, () => {
  console.log(`API listening on port ${port}`);
});
