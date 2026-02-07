import { Router, Request, Response } from 'express';
import { prisma } from '../../db/prisma';
import { getOrCreateExplanation, getOrCreateExplanationStream, type GetOrCreateError } from './ai.service';
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

  let userName: string | undefined;
  if (telegramId) {
    const user = await prisma.user.findUnique({
      where: { telegramId },
      select: { firstName: true },
    });
    userName = user?.firstName ?? undefined;
  }

  const result = await getOrCreateExplanation(questionId, userName);

  if (!result.success) {
    const err = result as GetOrCreateError;
    const status = err.reasonCode === 'QUESTION_NOT_FOUND' ? 404 : 500;
    res.status(status).json({ ok: false, reasonCode: err.reasonCode, message: err.message });
    return;
  }

  res.json({ content: result.content });
});

/** Stream explanation (SSE). Reduces perceived latency by showing text as it arrives. */
router.post('/explain/stream', async (req: Request, res: Response): Promise<void> => {
  if (!req.user?.id) {
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

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  try {
    for await (const chunk of getOrCreateExplanationStream(questionId)) {
      res.write(`data: ${JSON.stringify({ content: chunk })}\n\n`);
      if (typeof (res as unknown as { flush?: () => void }).flush === 'function') {
        (res as unknown as { flush: () => void }).flush();
      }
    }
    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
  } catch {
    res.write(`data: ${JSON.stringify({ error: true })}\n\n`);
  } finally {
    res.end();
  }
});

export default router;
