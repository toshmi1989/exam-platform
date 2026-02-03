// apps/api/src/modules/attempts/attempts.repository.ts

import { prisma } from '../../db/prisma';
import { ExamAttempt } from '../examAttempt/attempt.model';

function mapStatusToDb(status: ExamAttempt['status']) {
  switch (status) {
    case 'created':
      return 'CREATED';
    case 'inProgress':
      return 'IN_PROGRESS';
    case 'submitted':
      return 'SUBMITTED';
    case 'completed':
      return 'COMPLETED';
    case 'expired':
      return 'EXPIRED';
    default:
      return 'CREATED';
  }
}

function mapStatusFromDb(status: string): ExamAttempt['status'] {
  switch (status) {
    case 'IN_PROGRESS':
      return 'inProgress';
    case 'SUBMITTED':
      return 'submitted';
    case 'COMPLETED':
      return 'completed';
    case 'EXPIRED':
      return 'expired';
    default:
      return 'created';
  }
}

function mapAttemptFromDb(attempt: {
  id: string;
  userId: string;
  examId: string;
  status: string;
  mode: string;
  questionIds: string[];
  answers: unknown;
  createdAt: Date;
  startedAt: Date | null;
  expiresAt: Date | null;
  submittedAt: Date | null;
  score: number | null;
  maxScore: number | null;
}): ExamAttempt {
  return {
    id: attempt.id,
    userId: attempt.userId,
    examId: attempt.examId,
    status: mapStatusFromDb(attempt.status),
    mode: attempt.mode === 'PRACTICE' ? 'practice' : 'exam',
    questionIds: attempt.questionIds ?? [],
    answers: (attempt.answers as Record<string, unknown>) ?? {},
    createdAt: attempt.createdAt.getTime(),
    startedAt: attempt.startedAt?.getTime(),
    expiresAt: attempt.expiresAt?.getTime(),
    submittedAt: attempt.submittedAt?.getTime(),
    score: attempt.score ?? undefined,
    maxScore: attempt.maxScore ?? undefined,
  };
}

function mapAttemptToDb(attempt: ExamAttempt) {
  return {
    id: attempt.id,
    userId: attempt.userId,
    examId: attempt.examId,
    status: mapStatusToDb(attempt.status),
    mode: attempt.mode === 'practice' ? 'PRACTICE' : 'EXAM',
    questionIds: attempt.questionIds ?? [],
    answers: attempt.answers ?? {},
    createdAt: new Date(attempt.createdAt),
    startedAt: attempt.startedAt ? new Date(attempt.startedAt) : null,
    expiresAt: attempt.expiresAt ? new Date(attempt.expiresAt) : null,
    submittedAt: attempt.submittedAt ? new Date(attempt.submittedAt) : null,
    score: attempt.score ?? null,
    maxScore: attempt.maxScore ?? null,
  };
}

export async function getAttemptById(
  attemptId: string
): Promise<ExamAttempt | null> {
  const attempt = await prisma.examAttempt.findUnique({
    where: { id: attemptId },
  });
  return attempt ? mapAttemptFromDb(attempt) : null;
}

export async function createAttemptRecord(
  attempt: ExamAttempt
): Promise<ExamAttempt> {
  const created = await prisma.examAttempt.create({
    data: mapAttemptToDb(attempt),
  });
  return mapAttemptFromDb(created);
}

export async function saveAttemptRecord(
  attempt: ExamAttempt
): Promise<ExamAttempt> {
  const saved = await prisma.examAttempt.upsert({
    where: { id: attempt.id },
    create: mapAttemptToDb(attempt),
    update: mapAttemptToDb(attempt),
  });
  return mapAttemptFromDb(saved);
}
