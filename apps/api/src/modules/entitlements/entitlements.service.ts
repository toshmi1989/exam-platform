// src/modules/entitlements/entitlements.service.ts

import { prisma } from '../../db/prisma';
import { getAccessSettings } from '../settings/accessSettings.service';

export type ExamTypeForEntitlements = 'TEST' | 'ORAL';

export async function getEntitlementsForExam(
  userId: string | null,
  examId: string,
  examType: ExamTypeForEntitlements = 'TEST',
  guestSessionId?: string | null
): Promise<{
  subscriptionActive: boolean;
  hasOneTimeForExam: boolean;
  dailyLimitAvailable: boolean;
  oralDailyLimitAvailable: boolean;
}> {
  const settings = await getAccessSettings();
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date(todayStart);
  todayEnd.setDate(todayEnd.getDate() + 1);

  const now = new Date();
  // Subscriptions only for authenticated users (not guests)
  const activeSubscription = userId
    ? await prisma.userSubscription.findFirst({
        where: {
          userId,
          status: 'ACTIVE',
          startsAt: { lte: now },
          endsAt: { gt: now },
        },
        select: { id: true },
      })
    : null;
  const subscriptionActive = Boolean(activeSubscription);

  // Check one-time access for either userId or guestSessionId
  const oneTimeWhere: { examId: string; consumedAt: null; userId?: string; guestSessionId?: string } = {
    examId,
    consumedAt: null,
  };
  if (userId) {
    oneTimeWhere.userId = userId;
  } else if (guestSessionId) {
    oneTimeWhere.guestSessionId = guestSessionId;
  }
  const oneTime = await prisma.oneTimeAccess.findFirst({
    where: oneTimeWhere,
    select: { id: true },
  });
  const hasOneTimeForExam = Boolean(oneTime);

  // Дневной лимит тратится при запуске попытки (startAttempt), а не при завершении.
  // Считаем все запуски за сегодня: и «Сдать тест» (EXAM), и «Готовиться к тесту» (PRACTICE).
  // Daily limit only for authenticated users (not guests)
  const dailyCount = userId
    ? await prisma.examAttempt.count({
        where: {
          userId,
          startedAt: {
            not: null,
            gte: todayStart,
            lt: todayEnd,
          },
        },
      })
    : 0;

  const dailyLimitAvailable =
    userId !== null &&
    examType === 'TEST' &&
    settings.allowFreeAttempts &&
    settings.freeDailyLimit > 0 &&
    dailyCount < settings.freeDailyLimit;

  // Устный режим: подписчики без лимита; без подписки — freeOralDailyLimit = число разных вопросов, ответы на которые просмотрены сегодня.
  // Oral mode only for authenticated users (not guests)
  let oralDailyLimitAvailable = false;
  if (examType === 'ORAL' && userId) {
    if (subscriptionActive) {
      oralDailyLimitAvailable = true;
    } else if (settings.allowFreeAttempts && settings.freeOralDailyLimit > 0) {
      const rows = await (prisma as unknown as { oralAccessLog: { findMany: (args: { where: { userId: string; createdAt: { gte: Date; lt: Date } }; select: { questionId: true } }) => Promise<{ questionId: string | null }[]> } }).oralAccessLog.findMany({
        where: { userId, createdAt: { gte: todayStart, lt: todayEnd } },
        select: { questionId: true },
      });
      const distinctQuestions = new Set(rows.map((r) => r.questionId).filter(Boolean)).size;
      oralDailyLimitAvailable = distinctQuestions < settings.freeOralDailyLimit;
    }
  }

  return {
    subscriptionActive,
    hasOneTimeForExam,
    dailyLimitAvailable,
    oralDailyLimitAvailable,
  };
}

/** Границы «сегодня» для подсчёта устных ответов (локальное время сервера). */
function getTodayBounds(): { gte: Date; lt: Date } {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date(todayStart);
  todayEnd.setDate(todayEnd.getDate() + 1);
  return { gte: todayStart, lt: todayEnd };
}

/**
 * Списывает один «вопрос» устного лимита при просмотре ответа (по разным questionId).
 * Подписчики не ограничены. Повторный просмотр того же вопроса в тот же день не списывается.
 */
export async function consumeOralQuestionSlot(
  userId: string,
  examId: string,
  questionId: string
): Promise<{ allowed: boolean }> {
  const entitlements = await getEntitlementsForExam(userId, examId, 'ORAL');
  if (entitlements.subscriptionActive) {
    return { allowed: true };
  }
  const settings = await getAccessSettings();
  if (!settings.allowFreeAttempts || settings.freeOralDailyLimit <= 0) {
    return { allowed: false };
  }
  const { gte, lt } = getTodayBounds();
  const oralLog = prisma as unknown as {
    oralAccessLog: {
      findMany: (args: { where: { userId: string; createdAt: { gte: Date; lt: Date } }; select: { questionId: true } }) => Promise<{ questionId: string | null }[]>;
      create: (args: { data: { userId: string; questionId: string } }) => Promise<unknown>;
      count: (args: { where: { userId: string; questionId: string; createdAt: { gte: Date; lt: Date } } }) => Promise<number>;
    };
  };
  const consumed = await prisma.$transaction(async (tx) => {
    const txOral = (tx as unknown as typeof oralLog).oralAccessLog;
    const rows = await txOral.findMany({
      where: { userId, createdAt: { gte, lt } },
      select: { questionId: true },
    });
    const distinctCount = new Set(rows.map((r) => r.questionId).filter(Boolean)).size;
    const alreadyViewed = rows.some((r) => r.questionId === questionId);
    if (alreadyViewed) {
      return true;
    }
    if (distinctCount >= settings.freeOralDailyLimit) {
      return false;
    }
    await txOral.create({
      data: { userId, questionId },
    });
    return true;
  });
  return { allowed: consumed };
}
  