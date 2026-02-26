import { prisma } from '../../db/prisma';
import { generateOralAnswer } from '../ai/oralAnswer.generator';
import {
  acquireLock,
  releaseLock,
  questionLockKey,
  waitForLockRelease,
  getExplanationCache,
  setExplanationCache,
  setSessionTimer,
  getSessionTtl,
  expireSession,
  checkAndConsumeRateLimit,
} from './oral.redis';
import { checkAndExpireSession } from './oral.timer';
import { evaluateAnswer, type EvaluationResult } from './oral.evaluator';
import { transcribeAudio } from './azure.stt';

const QUESTIONS_PER_SESSION = 5;
const PASS_THRESHOLD = 30;
const MAX_SCORE = 50;

export interface SessionQuestion {
  id: string;
  text: string;
  order: number;
}

export interface StartSessionResult {
  sessionId: string;
  questions: SessionQuestion[];
  expiresAt: Date;
}

export interface AnswerSubmitResult {
  transcript: string;
  score: number;
  maxScore: 10;
  feedback: EvaluationResult;
}

export interface FinishSessionResult {
  sessionId: string;
  score: number;
  maxScore: number;
  passed: boolean;
  passThreshold: number;
  status: string;
  answers: Array<{
    questionId: string;
    questionText: string;
    transcript: string | null;
    score: number;
    feedback: EvaluationResult | null;
  }>;
}

// ─── getOrGenerateExplanation (Redis-safe with distributed lock) ─────────────

export async function getOrGenerateExplanation(questionId: string): Promise<string> {
  // 1. Check Redis cache
  const cached = await getExplanationCache(questionId);
  if (cached) return cached;

  const lockKey = questionLockKey(questionId);

  // 2. Try to acquire lock
  const locked = await acquireLock(lockKey, 30);
  if (!locked) {
    // Another process is generating — wait and re-check cache
    await waitForLockRelease(lockKey);
    const afterWait = await getExplanationCache(questionId);
    if (afterWait) return afterWait;
  }

  try {
    // 3. Check DB
    const existing = await prisma.oralAnswer.findUnique({
      where: { questionId },
      select: { answerHtml: true },
    });
    if (existing?.answerHtml) {
      await setExplanationCache(questionId, existing.answerHtml);
      return existing.answerHtml;
    }

    // 4. Load question for generation
    const question = await prisma.question.findUnique({
      where: { id: questionId },
      select: { prompt: true, exam: { select: { language: true, direction: true } } },
    });
    if (!question) throw new Error(`Question ${questionId} not found`);

    const lang = question.exam.language === 'RU' ? 'ru' : 'uz';

    // 5. Generate via OpenAI
    const content = await generateOralAnswer({ lang, question: question.prompt });

    // 6. Upsert to DB and cache
    await prisma.oralAnswer.upsert({
      where: { questionId },
      update: { answerHtml: content },
      create: { questionId, answerHtml: content },
    });
    await setExplanationCache(questionId, content);

    return content;
  } finally {
    await releaseLock(lockKey);
  }
}

// ─── startSession ────────────────────────────────────────────────────────────

export async function startSession(
  userId: string,
  examId: string,
  isAdmin: boolean
): Promise<StartSessionResult | { error: string; reasonCode: string }> {
  // 1. Check subscription (only subscribers and admins can use timed exam)
  if (!isAdmin) {
    const now = new Date();
    const sub = await prisma.userSubscription.findFirst({
      where: {
        userId,
        status: 'ACTIVE',
        startsAt: { lte: now },
        endsAt: { gt: now },
      },
      select: { id: true },
    });
    if (!sub) {
      return {
        error: 'Устный экзамен доступен только для пользователей с активной подпиской.',
        reasonCode: 'SUBSCRIPTION_REQUIRED',
      };
    }
  }

  // 2. Check for existing active session.
  // Если есть ещё активная (не истёкшая) сессия, продолжаем её, а не создаём новую.
  const existing = await prisma.oralExamSession.findFirst({
    where: { userId, status: 'active' },
    select: { id: true, questionIds: true },
  });

  if (existing) {
    // Проверяем таймер: если уже истёк, помечаем как timeout и идём дальше к созданию новой сессии.
    const expired = await checkAndExpireSession(existing.id);
    if (!expired) {
      // Сессия ещё активна — продолжаем её и НЕ трогаем дневной лимит.
      const ttl = await getSessionTtl(existing.id);
      const questions = await prisma.question.findMany({
        where: { id: { in: existing.questionIds } },
        select: { id: true, prompt: true },
      });
      const qMap = new Map(questions.map((q) => [q.id, q.prompt]));

      const orderedQuestions: SessionQuestion[] = existing.questionIds.map((qid, index) => ({
        id: qid,
        text: qMap.get(qid) ?? '',
        order: index + 1,
      }));

      const expiresAt = new Date(Date.now() + Math.max(ttl, 0) * 1000);

      return {
        sessionId: existing.id,
        questions: orderedQuestions,
        expiresAt,
      };
    }
  }

  // 3. Rate limit (1x per day for subscribers).
  // Каждый раз, когда создаём НОВУЮ сессию в сутки, проверяем лимит.
  const rateCheck = await checkAndConsumeRateLimit(userId, isAdmin);
  if (!rateCheck.allowed) {
    return {
      error: rateCheck.message ?? 'Превышен суточный лимит.',
      reasonCode: 'RATE_LIMIT_EXCEEDED',
    };
  }

  // 4. Pick 5 random ORAL questions from the exam
  const allQuestions = await prisma.question.findMany({
    where: { examId, type: 'ORAL' },
    select: { id: true, prompt: true, order: true },
  });

  if (allQuestions.length < QUESTIONS_PER_SESSION) {
    return {
      error: `Недостаточно вопросов для экзамена (нужно минимум ${QUESTIONS_PER_SESSION}, доступно ${allQuestions.length}).`,
      reasonCode: 'NOT_ENOUGH_QUESTIONS',
    };
  }

  // Fisher-Yates shuffle, take first N
  const shuffled = [...allQuestions];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  const selected = shuffled.slice(0, QUESTIONS_PER_SESSION);

  // 5. Pre-warm explanations in parallel (fire-and-forget for speed, but await for correctness)
  await Promise.allSettled(selected.map((q) => getOrGenerateExplanation(q.id)));

  // 6. Create session in DB
  const session = await prisma.oralExamSession.create({
    data: {
      userId,
      examId,
      status: 'active',
      maxScore: MAX_SCORE,
      questionIds: selected.map((q) => q.id),
    },
  });

  // 7. Set Redis timer (15 minutes)
  await setSessionTimer(session.id, 900);

  const expiresAt = new Date(Date.now() + 900_000);

  return {
    sessionId: session.id,
    questions: selected.map((q, i) => ({
      id: q.id,
      text: q.prompt,
      order: i + 1,
    })),
    expiresAt,
  };
}

// ─── submitAnswer ────────────────────────────────────────────────────────────

export async function submitAnswer(
  sessionId: string,
  questionId: string,
  audioBuffer: Buffer,
  mimeType: string
): Promise<AnswerSubmitResult | { error: string; reasonCode: string }> {
  // 1. Check session
  const session = await prisma.oralExamSession.findUnique({
    where: { id: sessionId },
    select: {
      status: true,
      userId: true,
      questionIds: true,
      exam: { select: { language: true } },
      user: { select: { firstName: true, username: true } },
    },
  });

  if (!session) {
    return { error: 'Сессия не найдена.', reasonCode: 'SESSION_NOT_FOUND' };
  }
  if (session.status !== 'active') {
    return { error: `Сессия завершена (статус: ${session.status}).`, reasonCode: 'SESSION_ENDED' };
  }

  // 2. Check timer
  const expired = await checkAndExpireSession(sessionId);
  if (expired) {
    return { error: 'Время экзамена истекло.', reasonCode: 'SESSION_EXPIRED' };
  }

  // 3. Verify question belongs to session
  if (!session.questionIds.includes(questionId)) {
    return { error: 'Вопрос не принадлежит данной сессии.', reasonCode: 'QUESTION_NOT_IN_SESSION' };
  }

  const lang: 'ru' | 'uz' = session.exam.language === 'RU' ? 'ru' : 'uz';
  const userName = session.user?.firstName ?? session.user?.username ?? undefined;

  // 4. Transcribe audio via Azure STT
  let transcript = '';
  const userId = session.userId;
  if (audioBuffer.length > 100) {
    try {
      transcript = await transcribeAudio(audioBuffer, lang, mimeType);
      void prisma.sttUsageLog.create({ data: { userId, success: true } }).catch(() => {});
    } catch (err) {
      console.error('[oral.service] STT failed:', err);
      transcript = ''; // continue without transcript
      void prisma.sttUsageLog.create({ data: { userId, success: false } }).catch(() => {});
    }
  }

  // 5. Get reference answer
  const referenceAnswer = await getOrGenerateExplanation(questionId);

  // 6. Load question text
  const question = await prisma.question.findUnique({
    where: { id: questionId },
    select: { prompt: true },
  });

  // 7. Evaluate
  const feedback = await evaluateAnswer(
    question?.prompt ?? '',
    referenceAnswer,
    transcript,
    lang,
    userName
  );

  // 8. Save answer in DB (update if already submitted for this question, else create)
  const existing = await prisma.oralExamAnswer.findFirst({
    where: { sessionId, questionId },
    select: { id: true },
  });

  if (existing) {
    await prisma.oralExamAnswer.update({
      where: { id: existing.id },
      data: {
        transcript,
        score: feedback.score,
        detailedFeedback: feedback as object,
      },
    });
  } else {
    await prisma.oralExamAnswer.create({
      data: {
        sessionId,
        questionId,
        transcript,
        score: feedback.score,
        detailedFeedback: feedback as object,
      },
    });
  }

  return {
    transcript,
    score: feedback.score,
    maxScore: 10,
    feedback,
  };
}

// ─── finishSession ────────────────────────────────────────────────────────────

export async function finishSession(
  sessionId: string,
  userId: string
): Promise<FinishSessionResult | { error: string; reasonCode: string }> {
  const session = await prisma.oralExamSession.findUnique({
    where: { id: sessionId },
    select: {
      status: true,
      userId: true,
      questionIds: true,
      maxScore: true,
      answers: {
        select: {
          questionId: true,
          transcript: true,
          score: true,
          detailedFeedback: true,
        },
      },
    },
  });

  if (!session) {
    return { error: 'Сессия не найдена.', reasonCode: 'SESSION_NOT_FOUND' };
  }
  if (session.userId !== userId) {
    return { error: 'Доступ запрещён.', reasonCode: 'ACCESS_FORBIDDEN' };
  }
  if (session.status === 'finished') {
    // Already finished — return existing result
    return buildResult(sessionId, session.status, session.questionIds, session.answers, session.maxScore);
  }
  if (session.status === 'timeout') {
    return buildResult(sessionId, session.status, session.questionIds, session.answers, session.maxScore);
  }

  // Sum scores
  const totalScore = session.answers.reduce((sum, a) => sum + (a.score ?? 0), 0);

  await prisma.oralExamSession.update({
    where: { id: sessionId },
    data: {
      status: 'finished',
      finishedAt: new Date(),
      score: totalScore,
    },
  });

  await expireSession(sessionId);

  return buildResult(sessionId, 'finished', session.questionIds, session.answers, session.maxScore, totalScore);
}

async function buildResult(
  sessionId: string,
  status: string,
  questionIds: string[],
  answers: Array<{ questionId: string; transcript: string | null; score: number | null; detailedFeedback: unknown }>,
  maxScore: number | null,
  totalScore?: number
): Promise<FinishSessionResult> {
  // Load question texts
  const questions = await prisma.question.findMany({
    where: { id: { in: questionIds } },
    select: { id: true, prompt: true },
  });
  const qMap = new Map(questions.map((q) => [q.id, q.prompt]));

  const computedTotal = totalScore ?? answers.reduce((sum, a) => sum + (a.score ?? 0), 0);
  const max = maxScore ?? MAX_SCORE;

  return {
    sessionId,
    score: computedTotal,
    maxScore: max,
    passed: computedTotal >= PASS_THRESHOLD,
    passThreshold: PASS_THRESHOLD,
    status,
    answers: questionIds.map((qId) => {
      const ans = answers.find((a) => a.questionId === qId);
      return {
        questionId: qId,
        questionText: qMap.get(qId) ?? '',
        transcript: ans?.transcript ?? null,
        score: ans?.score ?? 0,
        feedback: (ans?.detailedFeedback as EvaluationResult | null) ?? null,
      };
    }),
  };
}

// ─── getSessionStatus ─────────────────────────────────────────────────────────

export async function getSessionStatus(sessionId: string, userId: string) {
  const session = await prisma.oralExamSession.findUnique({
    where: { id: sessionId },
    select: {
      status: true,
      userId: true,
      questionIds: true,
      answers: { select: { questionId: true, score: true } },
    },
  });

  if (!session || session.userId !== userId) {
    return null;
  }

  // Check expiry
  if (session.status === 'active') {
    const expired = await checkAndExpireSession(sessionId);
    if (expired) {
      return { status: 'timeout', ttl: 0, answeredCount: session.answers.length };
    }
  }

  const ttl = session.status === 'active' ? await getSessionTtl(sessionId) : 0;

  return {
    status: session.status,
    ttl: Math.max(0, ttl),
    answeredCount: session.answers.length,
    totalQuestions: session.questionIds.length,
  };
}
