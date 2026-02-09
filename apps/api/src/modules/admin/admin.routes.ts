import { Router } from 'express';
import express from 'express';
import { Prisma } from '@prisma/client';
import { requireAdmin } from '../../middlewares/adminGuard.middleware';
import { prisma } from '../../db/prisma';
import {
  addBlacklist,
  addBroadcast,
  cleanupStore,
  listBlacklist,
  listBroadcasts,
  listMessages,
  listThreads,
  markThreadReadByAdmin,
  removeBlacklist,
  updateThreadStatus,
  addMessage,
  getTotalUnreadAdmin,
} from './admin.store';
import {
  getAccessSettings,
  updateAccessSettings,
} from '../settings/accessSettings.service';
import {
  previewQuestionBank,
  importQuestionBank,
  previewOralQuestionBank,
  importOralQuestionBank,
} from './import.service';
import { prewarm, getAiStats, getOralStats, prewarmOral } from '../ai/ai.service';
import {
  uploadKnowledge,
  addTextToKnowledge,
  reindexKnowledge,
  getKnowledgeStats,
  listKnowledgeEntries,
  listKnowledgeFiles,
  deleteKnowledgeEntry,
  deleteKnowledgeBySource,
} from '../ai/knowledge.service';
import { getZiyodaPrompts, setZiyodaPrompts } from '../ai/ziyoda-prompts.service';
import { sendBroadcastToUsers } from '../../services/broadcastSender.service';

const router = Router();

router.use(express.json({ limit: '25mb' })); // Excel import with base64 can be large
router.use((err: unknown, req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (err && typeof err === 'object' && 'type' in err && err.type === 'entity.too.large') {
    return res.status(413).json({ ok: false, error: 'Request entity too large' });
  }
  next(err);
});
router.use(requireAdmin);

router.get('/stats', async (_req, res) => {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfToday = new Date(startOfToday);
  endOfToday.setDate(endOfToday.getDate() + 1);
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);

  const [
    totalUsers,
    activeSubscriptions,
    attemptsToday,
    totalAttempts,
    subscriptionsToday,
    subscriptionsThisMonth,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.userSubscription.count({
      where: {
        status: 'ACTIVE',
        startsAt: { lte: now },
        endsAt: { gt: now },
      },
    }),
    prisma.examAttempt.count({
      where: {
        status: { in: ['SUBMITTED', 'COMPLETED'] },
        submittedAt: { not: null, gte: startOfToday, lt: endOfToday },
      },
    }),
    prisma.examAttempt.count({
      where: { status: { in: ['SUBMITTED', 'COMPLETED'] } },
    }),
    prisma.userSubscription.count({
      where: { createdAt: { gte: startOfToday, lt: endOfToday } },
    }),
    prisma.userSubscription.count({
      where: { createdAt: { gte: startOfMonth, lt: endOfMonth } },
    }),
  ]);

  const conversion =
    totalAttempts > 0
      ? Math.round((activeSubscriptions / Math.max(totalUsers, 1)) * 100)
      : 0;

  res.json({
    totalUsers,
    activeSubscriptions,
    attemptsToday,
    conversion,
    subscriptionsToday,
    subscriptionsThisMonth,
  });
});

router.get('/analytics', async (_req, res) => {
  const now = new Date();
  const days = 30;
  const start = new Date(now);
  start.setDate(start.getDate() - days);
  start.setHours(0, 0, 0, 0);

  const attempts = await prisma.examAttempt.findMany({
    where: {
      status: { in: ['SUBMITTED', 'COMPLETED'] },
      submittedAt: { not: null, gte: start },
    },
    select: { submittedAt: true, examId: true },
  });

  const byDay: Record<string, number> = {};
  for (let i = 0; i < days; i++) {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    const key = d.toISOString().slice(0, 10);
    byDay[key] = 0;
  }
  for (const a of attempts) {
    if (a.submittedAt) {
      const key = a.submittedAt.toISOString().slice(0, 10);
      if (key in byDay) byDay[key]++;
    }
  }
  const attemptsByDay = Object.entries(byDay)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, count]) => ({ date, count }));

  const uniqueExamIds = [...new Set(attempts.map((a) => a.examId))];
  const examTypes =
    uniqueExamIds.length > 0
      ? await prisma.exam.findMany({
          where: { id: { in: uniqueExamIds } },
          select: { id: true, type: true },
        })
      : [];
  const examTypeMap = Object.fromEntries(examTypes.map((e) => [e.id, e.type]));

  const byExam: Record<string, number> = {};
  const byExamOral: Record<string, number> = {};
  for (const a of attempts) {
    const type = examTypeMap[a.examId];
    if (type === 'ORAL') {
      byExamOral[a.examId] = (byExamOral[a.examId] ?? 0) + 1;
    } else {
      byExam[a.examId] = (byExam[a.examId] ?? 0) + 1;
    }
  }
  const examIds = Object.entries(byExam)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10)
    .map(([id]) => id);
  const oralExamIds = Object.entries(byExamOral)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10)
    .map(([id]) => id);
  const [exams, oralExams] = await Promise.all([
    examIds.length
      ? prisma.exam.findMany({
          where: { id: { in: examIds } },
          select: { id: true, title: true },
        })
      : [],
    oralExamIds.length
      ? prisma.exam.findMany({
          where: { id: { in: oralExamIds } },
          select: { id: true, title: true, category: { select: { name: true } } },
        })
      : [],
  ]);
  const examMap = Object.fromEntries(exams.map((e) => [e.id, e.title]));
  const oralExamMap = Object.fromEntries(
    oralExams.map((e) => [
      e.id,
      { title: e.title, category: e.category?.name },
    ])
  );
  const topExams = Object.entries(byExam)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10)
    .map(([examId, attemptCount]) => ({
      examId,
      title: examMap[examId] ?? examId,
      attemptCount,
    }));
  const topOralExams = Object.entries(byExamOral)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10)
    .map(([examId, attemptCount]) => {
      const oral = oralExamMap[examId];
      const title =
        oral?.category != null
          ? `${oral.title} (${oral.category})`
          : oral?.title ?? examId;
      return { examId, title, attemptCount };
    });

  const [totalUsers, activeSubscriptions] = await Promise.all([
    prisma.user.count(),
    prisma.userSubscription.count({
      where: {
        status: 'ACTIVE',
        startsAt: { lte: now },
        endsAt: { gt: now },
      },
    }),
  ]);
  const conversion =
    totalUsers > 0
      ? { subscribed: activeSubscriptions, total: totalUsers }
      : { subscribed: 0, total: 0 };

  res.json({
    attemptsByDay,
    topExams,
    topOralExams,
    conversion,
  });
});

router.get('/users', async (req, res) => {
  const search = String(req.query.search ?? '').trim();
  const where: Prisma.UserWhereInput | undefined = search
    ? {
        OR: [
          { telegramId: { contains: search } },
          { firstName: { contains: search, mode: Prisma.QueryMode.insensitive } },
          { username: { contains: search, mode: Prisma.QueryMode.insensitive } },
        ],
      }
    : undefined;

  const users = await prisma.user.findMany({
    where,
    orderBy: { updatedAt: 'desc' },
    take: 50,
  });
  const userIds = users.map((user) => user.id);
  const now = new Date();
  const activeSubscriptions = await prisma.userSubscription.findMany({
    where: {
      userId: { in: userIds },
      status: 'ACTIVE',
      startsAt: { lte: now },
      endsAt: { gt: now },
    },
    select: { userId: true },
  });
  const activeSet = new Set(activeSubscriptions.map((sub) => sub.userId));

  res.json({
    items: users.map((user) => ({
      telegramId: user.telegramId,
      name: user.firstName ?? user.username ?? 'User',
      status: user.role === 'ADMIN' ? 'admin' : 'authorized',
      subscriptionActive: activeSet.has(user.id),
      lastSeen: user.updatedAt.toISOString(),
    })),
  });
});

/** Последние 10 направлений (тест/устный), по которым пользователь открывал экзамен. */
/** Avatar URL or image proxy. Telegram returns profile photos only for users who have contacted the bot. */
router.get('/users/:telegramId/avatar', async (req, res) => {
  const telegramId = String(req.params.telegramId ?? '').trim();
  if (!telegramId) {
    return res.status(400).json({ ok: false });
  }

  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) {
    return res.status(500).json({ ok: false, error: 'Bot token not configured' });
  }

  try {
    const userId = parseInt(telegramId, 10);
    if (!Number.isFinite(userId)) {
      return res.status(404).json({ ok: false, error: 'Invalid telegram id' });
    }

    const photosUrl = `https://api.telegram.org/bot${botToken}/getUserProfilePhotos`;
    const photosResponse = await fetch(photosUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: userId, limit: 1 }),
    });

    if (!photosResponse.ok) {
      return res.status(404).json({ ok: false, error: 'Avatar not found' });
    }

    const photosData = (await photosResponse.json()) as {
      ok?: boolean;
      result?: {
        total_count?: number;
        photos?: Array<Array<{ file_id: string; file_size?: number }>>;
      };
    };

    if (
      !photosData.ok ||
      !photosData.result?.photos?.length ||
      !photosData.result.photos[0]?.length
    ) {
      return res.status(404).json({ ok: false, error: 'No avatar found' });
    }

    const fileId = photosData.result.photos[0][photosData.result.photos[0].length - 1].file_id;
    const fileUrl = `https://api.telegram.org/bot${botToken}/getFile`;
    const fileResponse = await fetch(fileUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ file_id: fileId }),
    });

    if (!fileResponse.ok) {
      return res.status(404).json({ ok: false, error: 'File not found' });
    }

    const fileData = (await fileResponse.json()) as {
      ok?: boolean;
      result?: { file_path?: string };
    };

    if (!fileData.ok || !fileData.result?.file_path) {
      return res.status(404).json({ ok: false, error: 'File path not found' });
    }

    const avatarUrl = `https://api.telegram.org/file/bot${botToken}/${fileData.result.file_path}`;
    return res.json({ ok: true, avatarUrl });
  } catch (err) {
    console.error('[admin/users/avatar]', err);
    return res.status(500).json({ ok: false, error: 'Failed to get avatar' });
  }
});

router.get('/users/:telegramId/recent-directions', async (req, res) => {
  const telegramId = String(req.params.telegramId ?? '').trim();
  if (!telegramId) {
    return res.status(400).json({ ok: false, error: 'telegramId required' });
  }
  const user = await prisma.user.findUnique({ where: { telegramId }, select: { id: true } });
  if (!user) {
    return res.json({ items: [] });
  }
  const attempts = await prisma.examAttempt.findMany({
    where: { userId: user.id },
    orderBy: { startedAt: 'desc' },
    take: 10,
    select: { examId: true, startedAt: true, createdAt: true },
  });
  if (attempts.length === 0) {
    return res.json({ items: [] });
  }
  const examIds = [...new Set(attempts.map((a) => a.examId))];
  const exams = await prisma.exam.findMany({
    where: { id: { in: examIds } },
    select: { id: true, direction: true, type: true },
  });
  const examMap = new Map(exams.map((e) => [e.id, e]));
  res.json({
    items: attempts.map((a) => {
      const exam = examMap.get(a.examId);
      return {
        direction: exam?.direction ?? '—',
        examType: exam?.type ?? 'TEST',
        attemptedAt: a.startedAt?.toISOString() ?? a.createdAt.toISOString(),
      };
    }),
  });
});

router.post('/users/:telegramId/subscription/grant', async (req, res) => {
  const telegramId = String(req.params.telegramId ?? '').trim();
  if (!telegramId) {
    return res.status(400).json({ ok: false });
  }
  const user = await prisma.user.findUnique({ where: { telegramId } });
  if (!user) {
    return res.status(404).json({ ok: false, reasonCode: 'USER_NOT_FOUND' });
  }
  const settings = await getAccessSettings();
  const durationDays = Math.max(1, Number(settings.subscriptionDurationDays ?? 0));
  const now = new Date();
  const endsAt = new Date(now);
  endsAt.setDate(endsAt.getDate() + durationDays);

  await prisma.userSubscription.updateMany({
    where: { userId: user.id, status: 'ACTIVE' },
    data: { status: 'CANCELED' },
  });
  const subscription = await prisma.userSubscription.create({
    data: {
      userId: user.id,
      startsAt: now,
      endsAt,
      status: 'ACTIVE',
    },
  });
  return res.json({ ok: true, subscription });
});

router.post('/users/:telegramId/subscription/cancel', async (req, res) => {
  const telegramId = String(req.params.telegramId ?? '').trim();
  if (!telegramId) {
    return res.status(400).json({ ok: false });
  }
  const user = await prisma.user.findUnique({ where: { telegramId } });
  if (!user) {
    return res.status(404).json({ ok: false, reasonCode: 'USER_NOT_FOUND' });
  }
  const updated = await prisma.userSubscription.updateMany({
    where: { userId: user.id, status: 'ACTIVE' },
    data: { status: 'CANCELED' },
  });
  return res.json({ ok: true, updated: updated.count });
});

router.delete('/users/:telegramId', async (req, res) => {
  const telegramId = String(req.params.telegramId ?? '').trim();
  if (!telegramId) {
    return res.status(400).json({ ok: false });
  }
  const user = await prisma.user.findUnique({ where: { telegramId } });
  if (!user) {
    return res.status(404).json({ ok: false, reasonCode: 'USER_NOT_FOUND' });
  }
  await prisma.userSubscription.deleteMany({ where: { userId: user.id } });
  await prisma.oneTimeAccess.deleteMany({ where: { userId: user.id } });
  await prisma.examAttempt.deleteMany({ where: { userId: user.id } });
  await prisma.user.delete({ where: { id: user.id } });
  return res.json({ ok: true });
});

router.post('/users/:telegramId/one-time/grant', async (req, res) => {
  const telegramId = String(req.params.telegramId ?? '').trim();
  const examId = String(req.body?.examId ?? '').trim();
  if (!telegramId || !examId) {
    return res.status(400).json({ ok: false });
  }
  const user = await prisma.user.findUnique({ where: { telegramId } });
  if (!user) {
    return res.status(404).json({ ok: false, reasonCode: 'USER_NOT_FOUND' });
  }
  const existing = await prisma.oneTimeAccess.findFirst({
    where: { userId: user.id, examId, consumedAt: null },
  });
  if (existing) {
    return res.json({ ok: true, oneTime: existing });
  }
  const oneTime = await prisma.oneTimeAccess.create({
    data: { userId: user.id, examId },
  });
  return res.json({ ok: true, oneTime });
});

router.post('/users/:telegramId/one-time/revoke', async (req, res) => {
  const telegramId = String(req.params.telegramId ?? '').trim();
  const examId = String(req.body?.examId ?? '').trim();
  if (!telegramId || !examId) {
    return res.status(400).json({ ok: false });
  }
  const user = await prisma.user.findUnique({ where: { telegramId } });
  if (!user) {
    return res.status(404).json({ ok: false, reasonCode: 'USER_NOT_FOUND' });
  }
  const deleted = await prisma.oneTimeAccess.deleteMany({
    where: { userId: user.id, examId, consumedAt: null },
  });
  return res.json({ ok: true, deleted: deleted.count });
});

router.get('/exams', async (req, res) => {
  const search = String(req.query.search ?? '').trim();
  const typeFilter = req.query.type === 'ORAL' ? 'ORAL' : req.query.type === 'TEST' ? 'TEST' : undefined;
  const where: Prisma.ExamWhereInput = {};
  if (typeFilter) where.type = typeFilter;
  if (search) {
    where.OR = [
      { title: { contains: search, mode: Prisma.QueryMode.insensitive } },
      { direction: { contains: search, mode: Prisma.QueryMode.insensitive } },
      { category: { name: { contains: search, mode: Prisma.QueryMode.insensitive } } },
    ];
  }
  const exams = await prisma.exam.findMany({
    where: Object.keys(where).length > 0 ? where : undefined,
    include: {
      category: true,
      _count: { select: { questions: true } },
    },
    orderBy: { updatedAt: 'desc' },
    take: 100,
  });
  res.json({
    items: exams.map((exam) => ({
      id: exam.id,
      title: exam.title,
      direction: exam.direction,
      directionGroupId: exam.directionGroupId ?? undefined,
      category: exam.category?.name ?? '',
      profession: exam.profession,
      language: exam.language,
      type: exam.type,
      questionCount: exam._count?.questions ?? 0,
    })),
  });
});

/** Удалить направление целиком: по directionGroupId (пара из импорта — оба языка) или по profession+type+direction. */
router.delete('/exams/by-direction', async (req, res) => {
  const directionGroupId = String(req.body?.directionGroupId ?? req.query?.directionGroupId ?? '').trim();
  if (directionGroupId) {
    const result = await prisma.exam.deleteMany({
      where: { directionGroupId },
    });
    return res.json({ ok: true, deleted: result.count });
  }
  const profession = String(req.body?.profession ?? req.query?.profession ?? '').trim().toUpperCase();
  const type = String(req.body?.type ?? req.query?.type ?? '').trim().toUpperCase();
  const direction = String(req.body?.direction ?? req.query?.direction ?? '').trim();
  if (!profession || !type || !direction) {
    return res.status(400).json({ ok: false, reasonCode: 'MISSING_PARAMS' });
  }
  if (profession !== 'DOCTOR' && profession !== 'NURSE') {
    return res.status(400).json({ ok: false, reasonCode: 'INVALID_PROFESSION' });
  }
  if (type !== 'TEST' && type !== 'ORAL') {
    return res.status(400).json({ ok: false, reasonCode: 'INVALID_TYPE' });
  }
  const result = await prisma.exam.deleteMany({
    where: { profession: profession as 'DOCTOR' | 'NURSE', type: type as 'TEST' | 'ORAL', direction },
  });
  return res.json({ ok: true, deleted: result.count });
});

router.get('/exams/:examId', async (req, res) => {
  const examId = String(req.params.examId ?? '').trim();
  if (!examId) {
    return res.status(400).json({ ok: false });
  }
  const exam = await prisma.exam.findUnique({
    where: { id: examId },
    include: {
      category: true,
      questions: {
        orderBy: { order: 'asc' },
        include: { options: { orderBy: { order: 'asc' } } },
      },
    },
  });
  if (!exam) {
    return res.status(404).json({ ok: false, reasonCode: 'EXAM_NOT_FOUND' });
  }
  res.json({
    exam: {
      id: exam.id,
      title: exam.title,
      direction: exam.direction,
      directionGroupId: exam.directionGroupId ?? undefined,
      category: exam.category?.name ?? '',
      profession: exam.profession,
      language: exam.language,
      type: exam.type,
      questions: exam.questions.map((q) => ({
        id: q.id,
        prompt: q.prompt,
        options: q.options.map((opt) => ({
          id: opt.id,
          label: opt.label,
          isCorrect: opt.isCorrect,
        })),
      })),
    },
  });
});

router.patch('/exams/:examId/questions/:questionId', async (req, res) => {
  const examId = String(req.params.examId ?? '').trim();
  const questionId = String(req.params.questionId ?? '').trim();
  const prompt = typeof req.body?.prompt === 'string' ? req.body.prompt.trim() : undefined;
  const options = Array.isArray(req.body?.options) ? req.body.options : null;
  const correctOptionId =
    typeof req.body?.correctOptionId === 'string'
      ? req.body.correctOptionId
      : undefined;

  if (!examId || !questionId) {
    return res.status(400).json({ ok: false });
  }

  const question = await prisma.question.findFirst({
    where: { id: questionId, examId },
    include: { options: true },
  });
  if (!question) {
    return res.status(404).json({ ok: false, reasonCode: 'QUESTION_NOT_FOUND' });
  }

  await prisma.$transaction(async (tx) => {
    if (typeof prompt === 'string' && prompt.length > 0) {
      await tx.question.update({
        where: { id: questionId },
        data: { prompt },
      });
    }

    if (Array.isArray(options)) {
      for (const opt of options) {
        if (typeof opt?.id !== 'string' || typeof opt?.label !== 'string') {
          continue;
        }
        const belongs = question.options.some((existing) => existing.id === opt.id);
        if (!belongs) continue;
        await tx.questionOption.update({
          where: { id: opt.id },
          data: { label: opt.label.trim() },
        });
      }
    }

    if (correctOptionId) {
      const belongs = question.options.some((opt) => opt.id === correctOptionId);
      if (belongs) {
        await tx.questionOption.updateMany({
          where: { questionId },
          data: { isCorrect: false },
        });
        await tx.questionOption.update({
          where: { id: correctOptionId },
          data: { isCorrect: true },
        });
      }
    }
  });

  const updated = await prisma.question.findUnique({
    where: { id: questionId },
    include: { options: { orderBy: { order: 'asc' } } },
  });

  return res.json({
    ok: true,
    question: updated
      ? {
          id: updated.id,
          prompt: updated.prompt,
          options: updated.options.map((opt) => ({
            id: opt.id,
            label: opt.label,
            isCorrect: opt.isCorrect,
          })),
        }
      : null,
  });
});

router.get('/blacklist', (_req, res) => {
  cleanupStore();
  res.json({ items: listBlacklist() });
});

router.post('/blacklist', (req, res) => {
  cleanupStore();
  const telegramId = String(req.body?.telegramId ?? '').trim();
  const reason = String(req.body?.reason ?? '').trim();
  if (!telegramId) {
    return res.status(400).json({ ok: false });
  }
  addBlacklist({ telegramId, reason, createdAt: Date.now() });
  return res.json({ ok: true });
});

router.delete('/blacklist/:telegramId', (req, res) => {
  cleanupStore();
  removeBlacklist(req.params.telegramId);
  res.json({ ok: true });
});

router.get('/chats/unread-count', (_req, res) => {
  cleanupStore();
  const total = getTotalUnreadAdmin();
  res.json({ total });
});

router.get('/chats', (_req, res) => {
  cleanupStore();
  const threads = listThreads()
    .map((thread) => {
      const messages = listMessages(thread.telegramId);
      const lastMessage = messages[messages.length - 1];
      return {
        telegramId: thread.telegramId,
        status: thread.status,
        lastMessageAt: thread.lastMessageAt,
        unreadCount: thread.unreadAdmin,
        lastText: lastMessage?.text,
        hasImage: Boolean(lastMessage?.imageData),
      };
    })
    .sort((a, b) => {
      const unreadDiff = (b.unreadCount ?? 0) - (a.unreadCount ?? 0);
      if (unreadDiff !== 0) return unreadDiff;
      return b.lastMessageAt - a.lastMessageAt;
    });
  res.json({ threads });
});

router.get('/chats/:telegramId', (req, res) => {
  cleanupStore();
  const telegramId = req.params.telegramId;
  const messages = listMessages(telegramId);
  markThreadReadByAdmin(telegramId);
  res.json({ messages });
});

router.post('/chats/:telegramId/reply', (req, res) => {
  cleanupStore();
  const telegramId = req.params.telegramId;
  const text = String(req.body?.text ?? '').trim();
  const imageData = typeof req.body?.imageData === 'string' ? req.body.imageData : undefined;
  if (!text && !imageData) {
    return res.status(400).json({ ok: false });
  }
  const message = addMessage({ telegramId, author: 'admin', text, imageData });
  updateThreadStatus(telegramId, 'open');
  res.json({ ok: true, message });
});

router.post('/chats/:telegramId/status', (req, res) => {
  const status = req.body?.status as 'new' | 'open' | 'resolved';
  if (!status) {
    return res.status(400).json({ ok: false });
  }
  updateThreadStatus(req.params.telegramId, status);
  res.json({ ok: true });
});

router.get('/broadcasts', (_req, res) => {
  cleanupStore();
  res.json({ items: listBroadcasts() });
});

router.post('/broadcasts', (req, res) => {
  cleanupStore();
  const title = String(req.body?.title ?? '').trim();
  const text = String(req.body?.text ?? '').trim();
  const segment = String(req.body?.segment ?? 'all');
  const imageData = typeof req.body?.imageData === 'string' ? req.body.imageData : undefined;
  const channel = req.body?.channel === 'telegram' ? 'telegram' : req.body?.channel === 'platform' ? 'platform' : 'both';
  if (!title || !text) {
    return res.status(400).json({ ok: false });
  }
  const broadcast = addBroadcast({ title, text, segment, imageData });
  if (channel === 'telegram' || channel === 'both') {
    sendBroadcastToUsers({ title, text, segment, imageData });
  }
  res.json({ ok: true, broadcast });
});

router.get('/settings/access', async (_req, res) => {
  const settings = await getAccessSettings();
  res.json({ settings });
});

router.post('/settings/access', async (req, res) => {
  try {
    const body = req.body ?? {};
    const settings = await updateAccessSettings({
      subscriptionPrice: Number(body.subscriptionPrice ?? 0),
      subscriptionDurationDays: Number(body.subscriptionDurationDays ?? 0),
      allowFreeAttempts: Boolean(body.allowFreeAttempts),
      freeDailyLimit: Number(body.freeDailyLimit ?? 0),
      freeOralDailyLimit: Number(body.freeOralDailyLimit ?? 5),
      botAiDailyLimitFree: Number(body.botAiDailyLimitFree ?? 3),
      showAnswersWithoutSubscription: Boolean(body.showAnswersWithoutSubscription),
      oneTimePrice: Number(body.oneTimePrice ?? 0),
      showAnswersForOneTime: Boolean(body.showAnswersForOneTime),
    });
    res.json({ ok: true, settings });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[admin/settings/access POST]', err);
    res.status(500).json({ ok: false, reasonCode: 'INTERNAL_ERROR', error: msg });
  }
});

router.post('/import/preview', async (req, res) => {
  req.setTimeout(120000); // 2 min for large Excel preview
  const profession = String(req.body?.profession ?? '').toUpperCase();
  const fileBase64 = String(req.body?.fileBase64 ?? '');
  if (!profession || !fileBase64) {
    return res.status(400).json({ ok: false });
  }
  const preview = await previewQuestionBank({
    profession: profession as 'DOCTOR' | 'NURSE',
    fileBase64,
  });
  res.json({ ok: true, preview });
});

router.post('/import/execute', async (req, res) => {
  req.setTimeout(300000); // 5 min for large Excel (many directions)
  const profession = String(req.body?.profession ?? '').toUpperCase();
  const fileBase64 = String(req.body?.fileBase64 ?? '');
  const mode = req.body?.mode === 'add' ? 'add' : 'overwrite';
  if (!profession || !fileBase64) {
    return res.status(400).json({ ok: false });
  }
  try {
    const result = await importQuestionBank({
      profession: profession as 'DOCTOR' | 'NURSE',
      fileBase64,
      mode,
    });
    res.json({ ok: true, result });
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ ok: false, error: errMsg });
  }
});

router.post('/import/preview-oral', async (req, res) => {
  req.setTimeout(120000);
  const profession = String(req.body?.profession ?? '').toUpperCase();
  const fileBase64 = String(req.body?.fileBase64 ?? '');
  if (!profession || !fileBase64) {
    return res.status(400).json({ ok: false });
  }
  if (profession !== 'DOCTOR' && profession !== 'NURSE') {
    return res.status(400).json({ ok: false });
  }
  try {
    const preview = await previewOralQuestionBank({
      profession: profession as 'DOCTOR' | 'NURSE',
      fileBase64,
    });
    res.json({ ok: true, preview });
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ ok: false, error: errMsg });
  }
});

router.post('/import/execute-oral', async (req, res) => {
  req.setTimeout(300000);
  const profession = String(req.body?.profession ?? '').toUpperCase();
  const fileBase64 = String(req.body?.fileBase64 ?? '');
  const mode = req.body?.mode === 'add' ? 'add' : 'overwrite';
  if (!profession || !fileBase64) {
    return res.status(400).json({ ok: false });
  }
  if (profession !== 'DOCTOR' && profession !== 'NURSE') {
    return res.status(400).json({ ok: false });
  }
  try {
    const result = await importOralQuestionBank({
      profession: profession as 'DOCTOR' | 'NURSE',
      fileBase64,
      mode,
    });
    res.json({ ok: true, result });
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ ok: false, error: errMsg });
  }
});

router.get('/ai/stats', async (_req, res) => {
  try {
    const stats = await getAiStats();
    res.json(stats);
  } catch (err) {
    console.error('[admin/ai/stats]', err);
    res.status(500).json({ totalQuestions: 0, withExplanation: 0, missing: 0, byExam: [] });
  }
});

router.post('/ai/prewarm/stream', async (req, res) => {
  const examId = typeof req.body?.examId === 'string' ? req.body.examId.trim() : undefined;
  const lang = req.body?.lang === 'uz' ? 'uz' : req.body?.lang === 'ru' ? 'ru' : undefined;
  const mode = req.body?.mode === 'all' ? ('all' as const) : ('missing' as const);

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();

  try {
    for await (const progress of prewarm(examId, lang, { mode })) {
      res.write(`data: ${JSON.stringify(progress)}\n\n`);
      if (typeof (res as unknown as { flush?: () => void }).flush === 'function') {
        (res as unknown as { flush: () => void }).flush();
      }
    }
  } catch (err) {
    console.error('[admin/ai/prewarm/stream]', err);
    res.write(`data: ${JSON.stringify({ error: 'Prewarm failed' })}\n\n`);
  } finally {
    res.end();
  }
});

router.get('/ai/oral/stats', async (_req, res) => {
  try {
    const stats = await getOralStats();
    res.json(stats);
  } catch (err) {
    console.error('[admin/ai/oral/stats]', err);
    res.status(500).json({ totalOralQuestions: 0, withAnswer: 0, missing: 0, byExam: [] });
  }
});

router.post('/ai/oral/prewarm/stream', async (req, res) => {
  const examId = typeof req.body?.examId === 'string' ? req.body.examId.trim() : undefined;
  const mode = req.body?.mode === 'all' ? 'all' as const : 'missing' as const;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();

  try {
    for await (const progress of prewarmOral(examId, { mode })) {
      res.write(`data: ${JSON.stringify(progress)}\n\n`);
      if (typeof (res as unknown as { flush?: () => void }).flush === 'function') {
        (res as unknown as { flush: () => void }).flush();
      }
    }
  } catch (err) {
    console.error('[admin/ai/oral/prewarm/stream]', err);
    res.write(`data: ${JSON.stringify({ error: 'Oral prewarm failed' })}\n\n`);
  } finally {
    res.end();
  }
});

router.post('/knowledge/upload', async (req, res) => {
  try {
    const fileBase64 = typeof req.body?.file === 'string' ? req.body.file : '';
    const filename = typeof req.body?.filename === 'string' ? req.body.filename.trim() : 'document';
    if (!fileBase64) {
      res.status(400).json({ ok: false, error: 'file (base64) is required' });
      return;
    }
    const result = await uploadKnowledge({ fileBase64, filename });
    res.json({ ok: true, chunksCreated: result.chunksCreated });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[admin/knowledge/upload]', err);
    res.status(500).json({ ok: false, error: msg });
  }
});

router.post('/knowledge/add-text', async (req, res) => {
  try {
    const text = typeof req.body?.text === 'string' ? req.body.text : '';
    const title = typeof req.body?.title === 'string' ? req.body.title.trim() : undefined;
    const result = await addTextToKnowledge({ text, title });
    res.json({ ok: true, chunksCreated: result.chunksCreated });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[admin/knowledge/add-text]', err);
    res.status(500).json({ ok: false, error: msg });
  }
});

router.post('/knowledge/reindex/stream', async (_req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();

  try {
    await reindexKnowledge((p) => {
      res.write(`data: ${JSON.stringify(p)}\n\n`);
      if (typeof (res as unknown as { flush?: () => void }).flush === 'function') {
        (res as unknown as { flush: () => void }).flush();
      }
    });
  } catch (err) {
    console.error('[admin/knowledge/reindex/stream]', err);
    res.write(`data: ${JSON.stringify({ error: 'Reindex failed' })}\n\n`);
  } finally {
    res.end();
  }
});

router.post('/ai/clear-bot-cache', async (_req, res) => {
  try {
    const result = await prisma.botAnswerCache.deleteMany({});
    res.json({ ok: true, cleared: result.count });
  } catch (err) {
    console.error('[admin/ai/clear-bot-cache]', err);
    res.status(500).json({ ok: false, error: 'Failed to clear cache' });
  }
});

/** Список неотвеченных вопросов (бот не нашёл ответ). Группировка по темам в UI. */
router.get('/ai/unanswered-questions', async (req, res) => {
  try {
    const topic = typeof req.query?.topic === 'string' ? req.query.topic.trim() || undefined : undefined;
    const items = await prisma.botUnansweredQuestion.findMany({
      where: topic ? { topic } : undefined,
      orderBy: { createdAt: 'desc' },
      take: 500,
    });
    const topics = await prisma.botUnansweredQuestion.findMany({
      where: { topic: { not: null } },
      select: { topic: true },
      distinct: ['topic'],
    });
    res.json({
      items,
      topics: topics.map((r) => r.topic).filter(Boolean) as string[],
    });
  } catch (err) {
    console.error('[admin/ai/unanswered-questions]', err);
    res.status(500).json({ items: [], topics: [] });
  }
});

/** Назначить тему неотвеченному вопросу. */
router.patch('/ai/unanswered-questions/:id', async (req, res) => {
  try {
    const id = typeof req.params?.id === 'string' ? req.params.id.trim() : '';
    const topic = typeof req.body?.topic === 'string' ? req.body.topic.trim() || null : null;
    if (!id) {
      res.status(400).json({ ok: false, error: 'id required' });
      return;
    }
    await prisma.botUnansweredQuestion.update({
      where: { id },
      data: { topic },
    });
    res.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[admin/ai/unanswered-questions PATCH]', err);
    res.status(500).json({ ok: false, error: msg });
  }
});

/** Удалить запись (после добавления ответа в базу знаний). */
router.delete('/ai/unanswered-questions/:id', async (req, res) => {
  try {
    const id = typeof req.params?.id === 'string' ? req.params.id.trim() : '';
    if (!id) {
      res.status(400).json({ ok: false, error: 'id required' });
      return;
    }
    await prisma.botUnansweredQuestion.delete({ where: { id } });
    res.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[admin/ai/unanswered-questions DELETE]', err);
    res.status(500).json({ ok: false, error: msg });
  }
});

router.get('/knowledge/stats', async (_req, res) => {
  try {
    const stats = await getKnowledgeStats();
    res.json(stats);
  } catch (err) {
    console.error('[admin/knowledge/stats]', err);
    res.status(500).json({ totalEntries: 0, totalCacheEntries: 0 });
  }
});

router.get('/knowledge/entries', async (_req, res) => {
  try {
    const entries = await listKnowledgeEntries();
    res.json({ items: entries });
  } catch (err) {
    console.error('[admin/knowledge/entries]', err);
    res.status(500).json({ items: [] });
  }
});

router.get('/knowledge/files', async (_req, res) => {
  try {
    const files = await listKnowledgeFiles();
    res.json({ items: files });
  } catch (err) {
    console.error('[admin/knowledge/files]', err);
    res.status(500).json({ items: [] });
  }
});

router.post('/knowledge/delete-by-source', async (req, res) => {
  try {
    const source = typeof req.body?.source === 'string' ? req.body.source.trim() : '';
    if (!source) {
      res.status(400).json({ ok: false, error: 'source required' });
      return;
    }
    const result = await deleteKnowledgeBySource(source);
    res.json({ ok: true, deleted: result.deleted });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[admin/knowledge/delete-by-source]', err);
    res.status(500).json({ ok: false, error: msg });
  }
});

router.delete('/knowledge/entries/:id', async (req, res) => {
  try {
    const id = typeof req.params?.id === 'string' ? req.params.id.trim() : '';
    if (!id) {
      res.status(400).json({ ok: false, error: 'id required' });
      return;
    }
    await deleteKnowledgeEntry(id);
    res.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[admin/knowledge/entries delete]', err);
    res.status(500).json({ ok: false, error: msg });
  }
});

router.get('/ziyoda-prompts', async (_req, res) => {
  try {
    const prompts = await getZiyodaPrompts();
    res.json(prompts);
  } catch (err) {
    console.error('[admin/ziyoda-prompts]', err);
    res.status(500).json({});
  }
});

router.put('/ziyoda-prompts', async (req, res) => {
  try {
    const prompts = req.body && typeof req.body === 'object' ? req.body as Record<string, string> : {};
    await setZiyodaPrompts(prompts);
    const updated = await getZiyodaPrompts();
    res.json(updated);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[admin/ziyoda-prompts PUT]', err);
    res.status(500).json({ ok: false, error: msg });
  }
});

export default router;
