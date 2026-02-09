// apps/api/src/modules/attempts/attempts.controller.ts

import { randomUUID } from 'crypto';
import { Request, Response } from 'express';
import {
  createAttempt,
  startAttempt,
  submitAttempt,
  saveAnswer,
  getQuestionsForAttempt,
  getAttemptResult,
  getAttemptReview,
} from './attempts.service';

function getIdempotencyKey(req: Request): string {
  return (
    req.header('Idempotency-Key') ??
    req.header('idempotency-key') ??
    randomUUID()
  );
}

export async function createAttemptHandler(
  req: Request,
  res: Response
): Promise<void> {
  const userId = req.user?.id;
  const examId = req.body.examId;
  const mode = req.body.mode === 'practice' ? 'practice' : 'exam';
  const guestSessionId = req.cookies?.['guest-session-id'] || req.header('x-guest-session-id') || null;

  if (!examId) {
    res.status(400).json({
      success: false,
      reasonCode: 'INVALID_INPUT',
    });
    return;
  }

  // Either userId or guestSessionId must be present
  if (!userId && !guestSessionId) {
    res.status(401).json({
      success: false,
      reasonCode: 'AUTH_REQUIRED',
    });
    return;
  }

  const result = await createAttempt({
    userId: userId ?? null,
    examId,
    idempotencyKey: getIdempotencyKey(req),
    mode,
    guestSessionId: guestSessionId ?? null,
  });

  if (!result.success) {
    res.status(403).json(result);
    return;
  }

  res.status(201).json(result);
}

export async function startAttemptHandler(
  req: Request,
  res: Response
): Promise<void> {
  const attemptId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id ?? '';

  const result = await startAttempt(attemptId);
  if (!result.success) {
    res.status(404).json(result);
    return;
  }

  res.status(200).json(result);
}

export async function submitAttemptHandler(
  req: Request,
  res: Response
): Promise<void> {
  const attemptId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id ?? '';

  const result = await submitAttempt(attemptId);
  if (!result.success) {
    res.status(404).json(result);
    return;
  }

  res.status(200).json(result);
}
export async function saveAnswerHandler(
  req: Request,
  res: Response
) {
  const attemptId = Array.isArray(req.params.attemptId) ? req.params.attemptId[0] : req.params.attemptId ?? '';
  const { questionId, answer } = req.body;

  const userId = req.user?.id; // позже из Telegram middleware
  if (!userId) {
    return res.status(401).json({
      success: false,
      reasonCode: 'AUTH_REQUIRED',
    });
  }

  const result = await saveAnswer({
    attemptId,
    userId,
    questionId,
    answer,
  });

  if (!result.success) {
    return res.status(400).json(result);
  }

  return res.json(result);
}
export async function getQuestionsHandler(
  req: Request,
  res: Response
) {
  const attemptId = Array.isArray(req.params.attemptId) ? req.params.attemptId[0] : req.params.attemptId ?? '';
  const userId = req.user?.id;
  if (!userId) {
    return res.status(401).json({
      success: false,
      reasonCode: 'AUTH_REQUIRED',
    });
  }

  const result = await getQuestionsForAttempt(
    attemptId,
    userId
  );

  if (!result.success) {
    return res.status(400).json(result);
  }

  return res.json(result);
}
export async function getResultHandler(
  req: Request,
  res: Response
) {
  const attemptId = Array.isArray(req.params.attemptId) ? req.params.attemptId[0] : req.params.attemptId ?? '';
  const userId = req.user?.id;
  if (!userId) {
    return res.status(401).json({
      success: false,
      reasonCode: 'AUTH_REQUIRED',
    });
  }

  const result = await getAttemptResult(attemptId, userId);

  if (!result.success) {
    return res.status(400).json(result);
  }

  return res.json(result);
}

export async function getReviewHandler(
  req: Request,
  res: Response
) {
  const attemptId = Array.isArray(req.params.attemptId) ? req.params.attemptId[0] : req.params.attemptId ?? '';
  const userId = req.user?.id;
  if (!userId) {
    return res.status(401).json({
      success: false,
      reasonCode: 'AUTH_REQUIRED',
    });
  }

  const result = await getAttemptReview(attemptId, userId);
  if (!result.success) {
    return res.status(400).json(result);
  }

  return res.json(result);
}
