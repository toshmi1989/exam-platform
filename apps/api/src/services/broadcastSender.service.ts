/**
 * Отправка рассылки пользователям через Telegram Bot API.
 * Вызывается после добавления broadcast в админке (fire-and-forget).
 */

import { prisma } from '../db/prisma';

const BOT_TOKEN = (process.env.TELEGRAM_BOT_TOKEN ?? '').trim();
const MAX_MESSAGE_LENGTH = 4096;

type Segment = 'all' | 'subscribed' | 'free' | 'active';

export interface BroadcastPayload {
  title: string;
  text: string;
  segment: string;
  imageData?: string;
}

async function getTelegramIdsBySegment(segment: Segment): Promise<string[]> {
  const now = new Date();
  const thirtyDaysAgo = new Date(now);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  if (segment === 'all') {
    const users = await prisma.user.findMany({
      select: { telegramId: true },
    });
    return users.map((u) => u.telegramId);
  }

  if (segment === 'subscribed') {
    const subs = await prisma.userSubscription.findMany({
      where: {
        status: 'ACTIVE',
        startsAt: { lte: now },
        endsAt: { gt: now },
      },
      select: { userId: true },
      distinct: ['userId'],
    });
    const userIds = subs.map((s) => s.userId);
    if (userIds.length === 0) return [];
    const users = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { telegramId: true },
    });
    return users.map((u) => u.telegramId);
  }

  if (segment === 'free') {
    const subs = await prisma.userSubscription.findMany({
      where: {
        status: 'ACTIVE',
        startsAt: { lte: now },
        endsAt: { gt: now },
      },
      select: { userId: true },
      distinct: ['userId'],
    });
    const subscribedIds = new Set(subs.map((s) => s.userId));
    const users = await prisma.user.findMany({
      select: { id: true, telegramId: true },
    });
    return users.filter((u) => !subscribedIds.has(u.id)).map((u) => u.telegramId);
  }

  if (segment === 'active') {
    const attempts = await prisma.examAttempt.findMany({
      where: {
        submittedAt: { not: null, gte: thirtyDaysAgo },
      },
      select: { userId: true },
      distinct: ['userId'],
    });
    const userIds = attempts.map((a) => a.userId);
    if (userIds.length === 0) return [];
    const users = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { telegramId: true },
    });
    return users.map((u) => u.telegramId);
  }

  return [];
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

async function sendTelegramMessage(telegramId: string, text: string, imageUrl?: string): Promise<boolean> {
  if (!BOT_TOKEN) {
    console.warn('[broadcast-sender] TELEGRAM_BOT_TOKEN not set, skip send');
    return false;
  }
  const safeText = text.slice(0, MAX_MESSAGE_LENGTH);
  const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
  try {
    const payload = {
      chat_id: telegramId,
      text: safeText,
      parse_mode: 'HTML' as const,
      disable_web_page_preview: true,
    };
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const body = await res.text();
    if (!res.ok) {
      console.warn('[broadcast-sender] sendMessage failed', telegramId, res.status, body.slice(0, 200));
      return false;
    }
    const data = JSON.parse(body) as { ok?: boolean };
    if (!data.ok) {
      console.warn('[broadcast-sender] sendMessage not ok', telegramId, body.slice(0, 200));
      return false;
    }
    return true;
  } catch (err) {
    console.warn('[broadcast-sender] sendMessage error', telegramId, err);
    return false;
  }
}

/**
 * Отправить рассылку всем пользователям выбранного сегмента (запускать в фоне).
 * Текст отправляется в Telegram; при наличии imageData в сообщение добавляется пометка.
 */
export function sendBroadcastToUsers(payload: BroadcastPayload): void {
  const segment = (['all', 'subscribed', 'free', 'active'].includes(payload.segment)
    ? payload.segment
    : 'all') as Segment;

  void (async () => {
    try {
      const telegramIds = await getTelegramIdsBySegment(segment);
      const title = escapeHtml(payload.title.trim());
      const text = escapeHtml(payload.text.trim());
      let message = `${title}\n\n${text}`;
      if (payload.imageData) {
        message += '\n\n📎 [Изображение приложено в рассылке]';
      }

      let sent = 0;
      let failed = 0;
      for (const telegramId of telegramIds) {
        const ok = await sendTelegramMessage(telegramId, message);
        if (ok) sent++;
        else failed++;
        await new Promise((r) => setImmediate(r));
      }
      console.log('[broadcast-sender] Done:', { segment, total: telegramIds.length, sent, failed });
    } catch (err) {
      console.error('[broadcast-sender] Error:', err);
    }
  })();
}
