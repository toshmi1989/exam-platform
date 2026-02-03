// apps/api/src/modules/attempts/attempts.routes.ts

import { Router } from 'express';
import {
  createAttemptHandler,
  startAttemptHandler,
  submitAttemptHandler,
  saveAnswerHandler,
  getQuestionsHandler,
  getResultHandler,
  getReviewHandler,
} from './attempts.controller';

const router = Router();

// TODO: attach auth middleware for Telegram-authenticated users.
router.post('/', createAttemptHandler);
router.post('/:id/start', startAttemptHandler);
router.post('/:id/submit', submitAttemptHandler);

router.post('/:attemptId/answer', saveAnswerHandler);
router.get('/:attemptId/questions', getQuestionsHandler);
router.get('/:attemptId/result', getResultHandler);
router.get('/:attemptId/review', getReviewHandler);

export default router;
