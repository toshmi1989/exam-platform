import { Router, Request, Response } from 'express';
import { askZiyoda } from '../ai/ziyoda-rag.service';

const router = Router();

router.post('/ask', async (req: Request, res: Response): Promise<void> => {
  const telegramId =
    typeof req.body?.telegramId === 'string' ? req.body.telegramId.trim() : '';
  const firstName =
    typeof req.body?.firstName === 'string' ? req.body.firstName.trim() : undefined;
  const message =
    typeof req.body?.message === 'string' ? req.body.message.trim() : '';

  if (!message) {
    res.status(400).json({ ok: false, error: 'message is required' });
    return;
  }

  try {
    const answer = await askZiyoda(message, {
      firstName: firstName ?? (telegramId ? undefined : 'User'),
    });
    res.json({ answer });
  } catch (err) {
    console.error('[bot/ask]', err);
    res.status(500).json({
      ok: false,
      error: 'Ziyoda is temporarily unavailable.',
    });
  }
});

export default router;
