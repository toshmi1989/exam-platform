import { Router } from 'express';
import { prisma } from '../../db/prisma';
import { getEntitlementsForExam } from '../entitlements/entitlements.service';
import { evaluateAccess, type AccessContext } from '../entitlements/policy/accessPolicy';
const router = Router();

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

  // Лимит устного = число просмотренных ответов в день, а не число открытий экзамена.
  // Списывание происходит при запросе ответа (POST /oral/answer), здесь только проверка доступа.
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
