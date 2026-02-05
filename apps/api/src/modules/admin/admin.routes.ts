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
} from './import.service';

const router = Router();

router.use(express.json({ limit: '10mb' }));
router.use(requireAdmin);

router.get('/stats', async (_req, res) => {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfToday = new Date(startOfToday);
  endOfToday.setDate(endOfToday.getDate() + 1);

  const [totalUsers, activeSubscriptions, attemptsToday, totalAttempts] =
    await Promise.all([
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

  const byExam: Record<string, number> = {};
  for (const a of attempts) {
    byExam[a.examId] = (byExam[a.examId] ?? 0) + 1;
  }
  const examIds = Object.entries(byExam)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10)
    .map(([id]) => id);
  const exams = await prisma.exam.findMany({
    where: { id: { in: examIds } },
    select: { id: true, title: true },
  });
  const examMap = Object.fromEntries(exams.map((e) => [e.id, e.title]));
  const topExams = Object.entries(byExam)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10)
    .map(([examId, attemptCount]) => ({
      examId,
      title: examMap[examId] ?? examId,
      attemptCount,
    }));

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
  const where: Prisma.ExamWhereInput | undefined = search
    ? {
        OR: [
          { title: { contains: search, mode: Prisma.QueryMode.insensitive } },
          { direction: { contains: search, mode: Prisma.QueryMode.insensitive } },
          { category: { name: { contains: search, mode: Prisma.QueryMode.insensitive } } },
        ],
      }
    : undefined;
  const exams = await prisma.exam.findMany({
    where,
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
      category: exam.category?.name ?? '',
      profession: exam.profession,
      language: exam.language,
      type: exam.type,
      questionCount: exam._count?.questions ?? 0,
    })),
  });
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
  if (!title || !text) {
    return res.status(400).json({ ok: false });
  }
  const broadcast = addBroadcast({ title, text, segment, imageData });
  res.json({ ok: true, broadcast });
});

router.get('/settings/access', async (_req, res) => {
  const settings = await getAccessSettings();
  res.json({ settings });
});

router.post('/settings/access', async (req, res) => {
  const body = req.body ?? {};
  const settings = await updateAccessSettings({
    subscriptionPrice: Number(body.subscriptionPrice ?? 0),
    subscriptionDurationDays: Number(body.subscriptionDurationDays ?? 0),
    allowFreeAttempts: Boolean(body.allowFreeAttempts),
    freeDailyLimit: Number(body.freeDailyLimit ?? 0),
    showAnswersWithoutSubscription: Boolean(body.showAnswersWithoutSubscription),
    oneTimePrice: Number(body.oneTimePrice ?? 0),
    showAnswersForOneTime: Boolean(body.showAnswersForOneTime),
  });
  res.json({ ok: true, settings });
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
  if (!profession || !fileBase64) {
    return res.status(400).json({ ok: false });
  }
  try {
    const result = await importQuestionBank({
      profession: profession as 'DOCTOR' | 'NURSE',
      fileBase64,
    });
    res.json({ ok: true, result });
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ ok: false, error: errMsg });
  }
});

export default router;
