import { ExamAttempt } from './attempt.model';

export function isExpired(attempt: ExamAttempt): boolean {
  if (!attempt.expiresAt) return false;
  return Date.now() > attempt.expiresAt;
}
