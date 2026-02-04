// apps/api/src/modules/attempts/attempts.service.ts

import { randomUUID } from 'crypto';

// ===== Access policy =====
import {
  evaluateAccess,
  AccessContext,
  AccessDecision,
} from '../entitlements/policy/accessPolicy';


// ===== Domain =====
import { ExamAttempt } from '../examAttempt/attempt.model';
import {
  transitionAttempt,
  AttemptEvent,
} from '../examAttempt/attemptStateMachine';
import { isExpired } from '../examAttempt/time.guard';


// ===== Entitlements =====
import { consumeEntitlement } from '../entitlements/entitlementConsumption';
import { getEntitlementsForExam } from '../entitlements/entitlements.service';
import { getAccessSettings } from '../settings/accessSettings.service';

// ===== Persistence =====
import { prisma } from '../../db/prisma';
import {
  createAttemptRecord,
  getAttemptById,
  saveAttemptRecord,
} from './attempts.repository';

// ===== Exams =====
import { getExamById } from '../exams/exam.repository';
import { gradeExam } from '../exams/grading.service';
import { getQuestionsForExam } from '../exams/questions.service';
import { buildResult } from '../exams/result.service';

// =======================================================

export type AttemptActionResult =
  | { success: true; attempt: ExamAttempt }
  | { success: false; reasonCode: string };

export interface CreateAttemptParams {
  userId: string;
  examId: string;
  idempotencyKey: string;
  mode: 'exam' | 'practice';
}

// ================== Helpers ==================

async function buildAccessContext(
  userId: string,
  examId: string
): Promise<AccessContext> {
  const entitlements = await getEntitlementsForExam(userId, examId);

  return {
    user: {
      id: userId,
      role: 'authorized',
      status: 'active',
      hasActiveAttempt: false,
    },
    exam: {
      id: examId,
      isActive: true,
    },
    entitlements,
  };
}

async function finalizeAttempt(
  attempt: ExamAttempt
): Promise<AttemptActionResult> {
  const exam = await getExamById(attempt.examId);
  if (!exam) {
    return { success: false, reasonCode: 'EXAM_NOT_FOUND' };
  }

  const rawAnswers =
    typeof attempt.answers === 'object' && attempt.answers
      ? (attempt.answers as Record<string, unknown>)
      : {};
  const answers = Object.fromEntries(
    Object.entries(rawAnswers).map(([key, value]) => [key, String(value)])
  );
  const result = gradeExam(exam, answers, attempt.questionIds);

  attempt.score = result.score;
  attempt.maxScore = result.maxScore;

  const saved = await saveAttemptRecord(attempt);
  return { success: true, attempt: saved };
}

// ================== Public API ==================

export async function createAttempt(
  params: CreateAttemptParams
): Promise<AttemptActionResult> {
  const accessContext = await buildAccessContext(
    params.userId,
    params.examId
  );

  const decision: AccessDecision = evaluateAccess(accessContext);

  if (decision.decision === 'deny') {
    return { success: false, reasonCode: decision.reasonCode };
  }

  await consumeEntitlement(
    params.userId,
    params.examId,
    decision.entitlementType,
    params.idempotencyKey
  );

  const attempt: ExamAttempt = {
    id: randomUUID(),
    userId: params.userId,
    examId: params.examId,
    status: 'created',
    mode: params.mode,
    questionIds: [],
    answers: {},
    createdAt: Date.now(),
  };

  const saved = await createAttemptRecord(attempt);
  return { success: true, attempt: saved };
}

export async function startAttempt(
  attemptId: string
): Promise<AttemptActionResult> {
  const attempt = await getAttemptById(attemptId);
  if (!attempt) {
    return { success: false, reasonCode: 'ATTEMPT_NOT_FOUND' };
  }

  const exam = await getExamById(attempt.examId);
  if (!exam) {
    return { success: false, reasonCode: 'EXAM_NOT_FOUND' };
  }

  const started = transitionAttempt(attempt, 'START');

  const now = Date.now();
  started.startedAt = now;
  started.expiresAt = now + exam.timeLimitSeconds * 1000;

  const saved = await saveAttemptRecord(started);
  return { success: true, attempt: saved };
}

export async function saveAnswer(
  params: {
    attemptId: string;
    userId: string;
    questionId: string;
    answer: unknown;
  }
): Promise<AttemptActionResult> {
  const attempt = await getAttemptById(params.attemptId);
  if (!attempt) {
    return { success: false, reasonCode: 'ATTEMPT_NOT_FOUND' };
  }

  if (attempt.userId !== params.userId) {
    return { success: false, reasonCode: 'ACCESS_FORBIDDEN' };
  }

  if (isExpired(attempt)) {
    const expired = transitionAttempt(attempt, 'TIME_EXPIRED');
    await saveAttemptRecord(expired);
    return { success: false, reasonCode: 'ATTEMPT_EXPIRED' };
  }

  if (attempt.status !== 'inProgress') {
    return { success: false, reasonCode: 'ATTEMPT_NOT_EDITABLE' };
  }

  const exam = await getExamById(attempt.examId);
  if (!exam) {
    return { success: false, reasonCode: 'EXAM_NOT_FOUND' };
  }

  if (!exam.questions.some(q => q.id === params.questionId)) {
    return { success: false, reasonCode: 'QUESTION_NOT_FOUND' };
  }

  attempt.answers = {
    ...attempt.answers,
    [params.questionId]: params.answer != null ? String(params.answer) : '',
  };

  const saved = await saveAttemptRecord(attempt);
  return { success: true, attempt: saved };
}

export async function submitAttempt(
  attemptId: string
): Promise<AttemptActionResult> {
  const attempt = await getAttemptById(attemptId);
  if (!attempt) {
    return { success: false, reasonCode: 'ATTEMPT_NOT_FOUND' };
  }

  if (isExpired(attempt)) {
    const expired = transitionAttempt(attempt, 'TIME_EXPIRED');
    await saveAttemptRecord(expired);
    return finalizeAttempt(expired);
  }

  const submitted = transitionAttempt(attempt, 'SUBMIT');
  await saveAttemptRecord(submitted);

  return finalizeAttempt(submitted);
}

export async function getQuestionsForAttempt(
  attemptId: string,
  userId: string
) {
  const attempt = await getAttemptById(attemptId);

  if (!attempt) {
    return { success: false, reasonCode: 'ATTEMPT_NOT_FOUND' };
  }

  if (attempt.userId !== userId) {
    return { success: false, reasonCode: 'ACCESS_FORBIDDEN' };
  }

  // 🚫 Нельзя получать вопросы до старта
  if (attempt.status === 'created') {
    return { success: false, reasonCode: 'ATTEMPT_NOT_STARTED' };
  }

  // 🚫 Нельзя получать вопросы после завершения
  if (
    attempt.status === 'submitted' ||
    attempt.status === 'completed' ||
    attempt.status === 'expired'
  ) {
    return { success: false, reasonCode: 'ATTEMPT_FINISHED' };
  }

  // ⏱️ Доп. защита: если время вышло — истекаем
  if (isExpired(attempt)) {
    const expired = transitionAttempt(attempt, 'TIME_EXPIRED');
    await saveAttemptRecord(expired);
    return { success: false, reasonCode: 'ATTEMPT_EXPIRED' };
  }

  const exam = await getExamById(attempt.examId);
  if (!exam) {
    return { success: false, reasonCode: 'EXAM_NOT_FOUND' };
  }

  if (!attempt.questionIds || attempt.questionIds.length === 0) {
    const allIds = exam.questions.map((q) => q.id);
    const shuffled = [...allIds].sort(() => Math.random() - 0.5);
    const selected = shuffled.slice(0, Math.min(50, shuffled.length));
    attempt.questionIds = selected;
    await saveAttemptRecord(attempt);
  }

  const questions = await getQuestionsForExam(attempt.examId, {
    questionIds: attempt.questionIds,
    includeCorrect: attempt.mode === 'practice',
  });

  if (!questions) {
    return { success: false, reasonCode: 'EXAM_NOT_FOUND' };
  }

  return { success: true, questions, mode: attempt.mode };
}


export async function getAttemptResult(
  attemptId: string,
  userId: string
) {
  const attempt = await getAttemptById(attemptId);
  if (!attempt) {
    return { success: false, reasonCode: 'ATTEMPT_NOT_FOUND' };
  }

  if (attempt.userId !== userId) {
    return { success: false, reasonCode: 'ACCESS_FORBIDDEN' };
  }

  if (attempt.status !== 'submitted' && attempt.status !== 'completed') {
    return { success: false, reasonCode: 'ATTEMPT_NOT_FINISHED' };
  }

  const [entitlements, settings, oneTimeUsed] = await Promise.all([
    getEntitlementsForExam(userId, attempt.examId),
    getAccessSettings(),
    prisma.oneTimeAccess.findFirst({
      where: {
        userId,
        examId: attempt.examId,
        consumedAt: { not: null },
      },
      select: { id: true },
    }),
  ]);

  const hasOneTimeUsedForExam = Boolean(oneTimeUsed);
  const includeDetails =
    entitlements.subscriptionActive === true ||
    ((entitlements.hasOneTimeForExam || hasOneTimeUsedForExam) &&
      settings.showAnswersForOneTime) ||
    (!entitlements.subscriptionActive &&
      !entitlements.hasOneTimeForExam &&
      !hasOneTimeUsedForExam &&
      settings.showAnswersWithoutSubscription);

  const result = await buildResult(
    attempt.examId,
    attempt.answers,
    includeDetails,
    attempt.questionIds
  );

  if (!result) {
    return { success: false, reasonCode: 'EXAM_NOT_FOUND' };
  }

  return { success: true, result: { ...result, mode: attempt.mode } };
}

export async function getAttemptReview(
  attemptId: string,
  userId: string
) {
  const attempt = await getAttemptById(attemptId);
  if (!attempt) {
    return { success: false, reasonCode: 'ATTEMPT_NOT_FOUND' };
  }

  if (attempt.userId !== userId) {
    return { success: false, reasonCode: 'ACCESS_FORBIDDEN' };
  }

  if (attempt.status !== 'submitted' && attempt.status !== 'completed') {
    return { success: false, reasonCode: 'ATTEMPT_NOT_FINISHED' };
  }

  const [entitlements, settings, oneTimeUsed] = await Promise.all([
    getEntitlementsForExam(userId, attempt.examId),
    getAccessSettings(),
    prisma.oneTimeAccess.findFirst({
      where: {
        userId,
        examId: attempt.examId,
        consumedAt: { not: null },
      },
      select: { id: true },
    }),
  ]);

  const hasOneTimeUsedForExam = Boolean(oneTimeUsed);
  const includeDetails =
    entitlements.subscriptionActive === true ||
    ((entitlements.hasOneTimeForExam || hasOneTimeUsedForExam) &&
      settings.showAnswersForOneTime) ||
    (!entitlements.subscriptionActive &&
      !entitlements.hasOneTimeForExam &&
      !hasOneTimeUsedForExam &&
      settings.showAnswersWithoutSubscription);

  if (!includeDetails) {
    return { success: false, reasonCode: 'DETAILS_NOT_AVAILABLE' };
  }

  if (!attempt.questionIds || attempt.questionIds.length === 0) {
    return { success: false, reasonCode: 'QUESTIONS_NOT_AVAILABLE' };
  }

  const questions = await getQuestionsForExam(attempt.examId, {
    questionIds: attempt.questionIds,
    includeCorrect: true,
  });

  if (!questions) {
    return { success: false, reasonCode: 'EXAM_NOT_FOUND' };
  }

  const rawAnswers =
    typeof attempt.answers === 'object' && attempt.answers
      ? (attempt.answers as Record<string, unknown>)
      : {};
  const answers = Object.fromEntries(
    Object.entries(rawAnswers).map(([key, value]) => [key, String(value)])
  );

  return {
    success: true,
    questions,
    answers,
  };
}
