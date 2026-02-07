import { Router, Request, Response } from 'express';
import { getOrCreateOralAnswer, getOrCreateOralAnswerStream, type GetOrCreateError } from './ai.service';

const router = Router();

router.post('/answer', async (req: Request, res: Response): Promise<void> => {
  if (!req.user?.id) {
    res.status(401).json({ ok: false, reasonCode: 'AUTH_REQUIRED' });
    return;
  }

  const questionId = typeof req.body?.questionId === 'string' ? req.body.questionId.trim() : '';
  if (!questionId) {
    res.status(400).json({ ok: false, reasonCode: 'INVALID_INPUT', message: 'Требуется questionId.' });
    return;
  }

  const result = await getOrCreateOralAnswer(questionId);

  if (!result.success) {
    const err = result as GetOrCreateError;
    const status = err.reasonCode === 'QUESTION_NOT_FOUND' ? 404 : 500;
    res.status(status).json({ ok: false, reasonCode: err.reasonCode, message: err.message });
    return;
  }

  res.json({ content: result.content });
});

/** Stream oral answer (SSE). Reduces perceived latency by showing text as it arrives. */
router.post('/answer/stream', async (req: Request, res: Response): Promise<void> => {
  if (!req.user?.id) {
    res.status(401).json({ ok: false, reasonCode: 'AUTH_REQUIRED' });
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
    for await (const chunk of getOrCreateOralAnswerStream(questionId)) {
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
