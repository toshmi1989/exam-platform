// modules/examAttempt/attemptStateMachine.ts

import type { ExamAttempt } from './attempt.model';

export type AttemptStatus = ExamAttempt['status'];

export type AttemptEvent =
  | 'START'
  | 'SAVE_ANSWER'
  | 'SUBMIT'
  | 'TIME_EXPIRED';

// ===== State machine =====

export function transitionAttempt(
  attempt: ExamAttempt,
  event: AttemptEvent
): ExamAttempt {
  switch (attempt.status) {
    case 'created':
      if (event === 'START') {
        return {
          ...attempt,
          status: 'inProgress',
          startedAt: Date.now(),
        };
      }
      break;

    case 'inProgress':
      if (event === 'SAVE_ANSWER') {
        return attempt; // answers handled separately
      }
      if (event === 'SUBMIT') {
        return {
          ...attempt,
          status: 'submitted',
          submittedAt: Date.now(),
        };
      }
      if (event === 'TIME_EXPIRED') {
        return {
          ...attempt,
          status: 'expired',
        };
      }
      break;

    case 'submitted':
      return {
        ...attempt,
        status: 'completed',
      };
  }

  throw new Error(
    `Invalid transition: ${attempt.status} -> ${event}`
  );
}
