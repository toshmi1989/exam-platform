import { Router, Request, Response } from 'express';
import multer from 'multer';
import {
  startSession,
  submitAnswer,
  finishSession,
  getSessionStatus,
} from './oral.service';

const router = Router();

// Use memory storage — audio blobs are processed in-memory and not persisted to disk
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB max audio
});

// Auth guard
function requireUser(req: Request, res: Response): boolean {
  if (!req.user?.id) {
    res.status(401).json({ ok: false, reasonCode: 'AUTH_REQUIRED' });
    return false;
  }
  return true;
}

/**
 * POST /oral-session/start
 * Body: { examId: string }
 * Returns: { sessionId, questions, expiresAt }
 */
router.post('/start', async (req: Request, res: Response): Promise<void> => {
  if (!requireUser(req, res)) return;

  const examId = typeof req.body?.examId === 'string' ? req.body.examId.trim() : '';
  if (!examId) {
    res.status(400).json({ ok: false, reasonCode: 'INVALID_EXAM_ID' });
    return;
  }

  const isAdmin = req.user!.role === 'admin';
  const result = await startSession(req.user!.id, examId, isAdmin).catch((err) => {
    console.error('[oral-session/start]', err);
    return { error: 'Внутренняя ошибка сервера.', reasonCode: 'INTERNAL_ERROR' };
  });

  if ('error' in result) {
    const status =
      result.reasonCode === 'SUBSCRIPTION_REQUIRED' ? 403
        : result.reasonCode === 'RATE_LIMIT_EXCEEDED' ? 429
        : result.reasonCode === 'SESSION_ALREADY_ACTIVE' ? 409
        : result.reasonCode === 'NOT_ENOUGH_QUESTIONS' ? 422
        : 500;
    res.status(status).json({ ok: false, ...result });
    return;
  }

  res.json({ ok: true, ...result });
});

/**
 * POST /oral-session/answer
 * Multipart form: sessionId, questionId, audio (file)
 * Returns: { transcript, score, maxScore, feedback }
 */
router.post(
  '/answer',
  upload.single('audio'),
  async (req: Request, res: Response): Promise<void> => {
    if (!requireUser(req, res)) return;

    const sessionId = typeof req.body?.sessionId === 'string' ? req.body.sessionId.trim() : '';
    const questionId = typeof req.body?.questionId === 'string' ? req.body.questionId.trim() : '';

    if (!sessionId || !questionId) {
      res.status(400).json({ ok: false, reasonCode: 'MISSING_FIELDS' });
      return;
    }

    const audioBuffer: Buffer = req.file?.buffer ?? Buffer.alloc(0);
    const mimeType = req.file?.mimetype ?? 'audio/wav';

    const result = await submitAnswer(sessionId, questionId, audioBuffer, mimeType).catch((err) => {
      console.error('[oral-session/answer]', err);
      return { error: 'Внутренняя ошибка при обработке ответа.', reasonCode: 'INTERNAL_ERROR' };
    });

    if ('error' in result) {
      const status =
        result.reasonCode === 'SESSION_NOT_FOUND' ? 404
          : result.reasonCode === 'SESSION_EXPIRED' || result.reasonCode === 'SESSION_ENDED' ? 410
          : result.reasonCode === 'ACCESS_FORBIDDEN' ? 403
          : 400;
      res.status(status).json({ ok: false, ...result });
      return;
    }

    res.json({ ok: true, ...result });
  }
);

/**
 * POST /oral-session/finish
 * Body: { sessionId: string }
 * Returns: full session result with scores
 */
router.post('/finish', async (req: Request, res: Response): Promise<void> => {
  if (!requireUser(req, res)) return;

  const sessionId = typeof req.body?.sessionId === 'string' ? req.body.sessionId.trim() : '';
  if (!sessionId) {
    res.status(400).json({ ok: false, reasonCode: 'MISSING_SESSION_ID' });
    return;
  }

  const result = await finishSession(sessionId, req.user!.id).catch((err) => {
    console.error('[oral-session/finish]', err);
    return { error: 'Внутренняя ошибка при завершении сессии.', reasonCode: 'INTERNAL_ERROR' };
  });

  if ('error' in result) {
    const status =
      result.reasonCode === 'SESSION_NOT_FOUND' ? 404
        : result.reasonCode === 'ACCESS_FORBIDDEN' ? 403
        : 500;
    res.status(status).json({ ok: false, ...result });
    return;
  }

  res.json({ ok: true, ...result });
});

/**
 * GET /oral-session/:sessionId/status
 * Returns: { status, ttl, answeredCount, totalQuestions }
 */
router.get('/:sessionId/status', async (req: Request, res: Response): Promise<void> => {
  if (!requireUser(req, res)) return;

  const sessionId = req.params['sessionId'] as string;
  const status = await getSessionStatus(sessionId, req.user!.id).catch((err) => {
    console.error('[oral-session/status]', err);
    return null;
  });

  if (!status) {
    res.status(404).json({ ok: false, reasonCode: 'SESSION_NOT_FOUND' });
    return;
  }

  res.json({ ok: true, ...status });
});

export default router;
