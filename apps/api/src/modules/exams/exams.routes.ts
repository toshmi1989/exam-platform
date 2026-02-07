import { Router } from 'express';
import { prisma } from '../../db/prisma';
import { getEntitlementsForExam } from '../entitlements/entitlements.service';
import { evaluateAccess, type AccessContext } from '../entitlements/policy/accessPolicy';
import { getAccessSettings } from '../settings/accessSettings.service';

const router = Router();

function getTodayBounds(): { gte: Date; lt: Date } {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date(todayStart);
  todayEnd.setDate(todayEnd.getDate() + 1);
  return { gte: todayStart, lt: todayEnd };
}

router.get('/directions', async (req, res) => {
  const profession = String(req.query.profession ?? '').toUpperCase();
  const language = String(req.query.language ?? '').toUpperCase();
  const type = String(req.query.type ?? '').toUpperCase();

  if (!profession || !language || !type) {
    return res.status(400).json({ ok: false });
  }

  const isOral = type === 'ORAL';
  const exams = await prisma.exam.findMany({
    where: {
      profession: profession as 'DOCTOR' | 'NURSE',
      language: language as 'UZ' | 'RU',
      type: type as 'TEST' | 'ORAL',
    },
    select: {
      id: true,
      direction: true,
      title: true,
      ...(isOral ? { category: { select: { id: true, name: true } } } : {}),
    },
    orderBy: { direction: 'asc' },
  });

  if (isOral) {
    const byDirection = new Map<string, { direction: string; exams: { id: string; categoryLabel: string }[] }>();
    for (const exam of exams) {
      const direction = exam.direction || exam.title;
      const categoryLabel = exam.category?.name ?? exam.title;
      if (!byDirection.has(direction)) {
        byDirection.set(direction, { direction, exams: [] });
      }
      byDirection.get(direction)!.exams.push({
        id: exam.id,
        categoryLabel,
      });
    }
    return res.json({
      directions: Array.from(byDirection.values()).map(({ direction, exams: list }) => ({
        direction,
        exams: list,
      })),
    });
  }

  res.json({
    directions: exams.map((exam) => ({
      id: exam.id,
      label: exam.direction || exam.title,
    })),
  });
});

router.get('/:examId/oral-questions', async (req, res) => {
  const userId = req.user?.id;
  if (!userId) {
    return res.status(401).json({ ok: false, reasonCode: 'AUTH_REQUIRED' });
  }
  const examId = String(req.params.examId ?? '').trim();
  if (!examId) {
    return res.status(400).json({ ok: false, reasonCode: 'INVALID_INPUT' });
  }
  const exam = await prisma.exam.findUnique({
    where: { id: examId, type: 'ORAL' },
    select: { id: true },
  });
  if (!exam) {
    return res.status(404).json({ ok: false, reasonCode: 'EXAM_NOT_FOUND' });
  }

  const entitlements = await getEntitlementsForExam(userId, examId, 'ORAL');
  const ctx: AccessContext = {
    user: {
      id: userId,
      role: 'authorized',
      status: 'active',
      hasActiveAttempt: false,
    },
    exam: { id: examId, isActive: true },
    examType: 'ORAL',
    entitlements,
  };
  const decision = evaluateAccess(ctx);
  if (decision.decision === 'deny') {
    return res.status(403).json({ ok: false, reasonCode: decision.reasonCode });
  }

  // Для доступа по дневному лимиту: атомарно проверить счётчик и записать одно потребление.
  // Иначе при гонках или кэше можно превысить лимит.
  if (decision.entitlementType === 'daily') {
    const settings = await getAccessSettings();
    if (!settings.allowFreeAttempts || settings.freeOralDailyLimit <= 0) {
      return res.status(403).json({ ok: false, reasonCode: 'ACCESS_DENIED' });
    }
    const { gte, lt } = getTodayBounds();
    const consumed = await prisma.$transaction(async (tx) => {
      const oralLog = (tx as unknown as { oralAccessLog: { count: (args: { where: { userId: string; createdAt: { gte: Date; lt: Date } } }) => Promise<number>; create: (args: { data: { userId: string } }) => Promise<unknown> } }).oralAccessLog;
      const count = await oralLog.count({
        where: { userId, createdAt: { gte, lt } },
      });
      if (count >= settings.freeOralDailyLimit) {
        return false;
      }
      await oralLog.create({
        data: { userId },
      });
      return true;
    });
    if (!consumed) {
      return res.status(403).json({ ok: false, reasonCode: 'ACCESS_DENIED' });
    }
  }

  const questions = await prisma.question.findMany({
    where: { examId, type: 'ORAL' },
    select: { id: true, prompt: true, order: true },
    orderBy: { order: 'asc' },
  });
  return res.json({
    questions: questions.map((q) => ({
      id: q.id,
      prompt: q.prompt,
      order: q.order ?? 0,
    })),
  });
});

export default router;
