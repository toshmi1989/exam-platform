// apps/api/src/modules/attempts/attempts.repository.ts

import { AttemptMode, AttemptStatus } from '@prisma/client';
import { prisma } from '../../db/prisma';
import { ExamAttempt } from '../examAttempt/attempt.model';

function mapStatusToDb(status: ExamAttempt['status']): AttemptStatus {
  switch (status) {
    case 'created':
      return AttemptStatus.CREATED;
    case 'inProgress':
      return AttemptStatus.IN_PROGRESS;
    case 'submitted':
      return AttemptStatus.SUBMITTED;
    case 'completed':
      return AttemptStatus.COMPLETED;
    case 'expired':
      return AttemptStatus.EXPIRED;
    default:
      return AttemptStatus.CREATED;
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
    answers: (attempt.answers as Record<string, string>) ?? {},
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
    mode: attempt.mode === 'practice' ? AttemptMode.PRACTICE : AttemptMode.EXAM,
    questionIds: attempt.questionIds ?? [],
    answers: (attempt.answers ?? {}) as object,
    createdAt: new Date(attempt.createdAt),
    startedAt: attempt.startedAt != null ? new Date(attempt.startedAt) : null,
    expiresAt: attempt.expiresAt != null ? new Date(attempt.expiresAt) : null,
    submittedAt: attempt.submittedAt != null ? new Date(attempt.submittedAt) : null,
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
