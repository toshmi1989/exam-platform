import { Router, Request, Response } from 'express';
import { prisma } from '../../db/prisma';
import { getOrCreateExplanation, type GetOrCreateError } from './ai.service';
import { checkAiRateLimit } from './rateLimit';

const router = Router();

router.post('/explain', async (req: Request, res: Response): Promise<void> => {
  const userId = req.user?.id;
  const telegramId = req.user?.telegramId;
  if (!userId) {
    res.status(401).json({ ok: false, reasonCode: 'AUTH_REQUIRED' });
    return;
  }

  if (!checkAiRateLimit()) {
    res.status(429).json({ ok: false, reasonCode: 'RATE_LIMIT', message: 'Слишком много запросов. Подождите секунду.' });
    return;
  }

  const questionId = typeof req.body?.questionId === 'string' ? req.body.questionId.trim() : '';
  if (!questionId) {
    res.status(400).json({ ok: false, reasonCode: 'INVALID_INPUT', message: 'Требуется questionId.' });
    return;
  }

  const questionWithExam = await prisma.question.findUnique({
    where: { id: questionId },
    select: { exam: { select: { language: true } } },
  });
  if (!questionWithExam) {
    res.status(404).json({ ok: false, reasonCode: 'QUESTION_NOT_FOUND', message: 'Вопрос не найден.' });
    return;
  }
  const lang = questionWithExam.exam.language === 'UZ' ? 'uz' : 'ru';

  let userName: string | undefined;
  if (telegramId) {
    const user = await prisma.user.findUnique({
      where: { telegramId },
      select: { firstName: true },
    });
    userName = user?.firstName ?? undefined;
  }

  const result = await getOrCreateExplanation(questionId, lang, userName);

  if (!result.success) {
    const err = result as GetOrCreateError;
    const status = err.reasonCode === 'QUESTION_NOT_FOUND' ? 404 : 500;
    res.status(status).json({ ok: false, reasonCode: err.reasonCode, message: err.message });
    return;
  }

  res.json({ content: result.content });
});

export default router;
