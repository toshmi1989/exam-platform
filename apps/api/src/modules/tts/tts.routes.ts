/**
 * TTS routes: audio generation endpoints.
 */

import { Router, Request, Response } from 'express';
import { getOrCreateAudio } from './tts.service';

const router = Router();

router.post('/speak', async (req: Request, res: Response) => {
  try {
    const questionId = String(req.body?.questionId ?? '').trim();
    const lang = req.body?.lang === 'uz' ? ('uz' as const) : req.body?.lang === 'ru' ? ('ru' as const) : null;

    if (!questionId || !lang) {
      return res.status(400).json({ ok: false, error: 'questionId and lang (ru|uz) required' });
    }

    const result = await getOrCreateAudio(questionId, lang);
    res.json({ ok: true, ...result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'TTS generation failed';
    console.error('[tts/speak]', err);
    res.status(500).json({ ok: false, error: msg });
  }
});

export default router;
