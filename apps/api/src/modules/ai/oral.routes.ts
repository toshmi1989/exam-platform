import { Router, Request, Response } from 'express';
import { getOrCreateOralAnswer, type GetOrCreateError } from './ai.service';

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

export default router;
