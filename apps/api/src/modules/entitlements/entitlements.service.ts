// src/modules/entitlements/entitlements.service.ts

import { prisma } from '../../db/prisma';
import { getAccessSettings } from '../settings/accessSettings.service';

export type ExamTypeForEntitlements = 'TEST' | 'ORAL';

export async function getEntitlementsForExam(
  userId: string,
  examId: string,
  examType: ExamTypeForEntitlements = 'TEST'
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
  const activeSubscription = await prisma.userSubscription.findFirst({
    where: {
      userId,
      status: 'ACTIVE',
      startsAt: { lte: now },
      endsAt: { gt: now },
    },
    select: { id: true },
  });
  const subscriptionActive = Boolean(activeSubscription);

  const oneTime = await prisma.oneTimeAccess.findFirst({
    where: {
      userId,
      examId,
      consumedAt: null,
    },
    select: { id: true },
  });
  const hasOneTimeForExam = Boolean(oneTime);

  // Дневной лимит тратится при запуске попытки (startAttempt), а не при завершении.
  // Считаем все запуски за сегодня: и «Сдать тест» (EXAM), и «Готовиться к тесту» (PRACTICE).
  const dailyCount = await prisma.examAttempt.count({
    where: {
      userId,
      startedAt: {
        not: null,
        gte: todayStart,
        lt: todayEnd,
      },
    },
  });

  const dailyLimitAvailable =
    examType === 'TEST' &&
    settings.allowFreeAttempts &&
    settings.freeDailyLimit > 0 &&
    dailyCount < settings.freeDailyLimit;

  // Устный режим: подписчики без лимита; без подписки — по freeOralDailyLimit (открытий в день).
  let oralDailyLimitAvailable = false;
  if (examType === 'ORAL') {
    if (subscriptionActive) {
      oralDailyLimitAvailable = true;
    } else if (settings.allowFreeAttempts && settings.freeOralDailyLimit > 0) {
      const oralOpensToday = await prisma.oralAccessLog.count({
        where: {
          userId,
          createdAt: { gte: todayStart, lt: todayEnd },
        },
      });
      oralDailyLimitAvailable = oralOpensToday < settings.freeOralDailyLimit;
    }
  }

  return {
    subscriptionActive,
    hasOneTimeForExam,
    dailyLimitAvailable,
    oralDailyLimitAvailable,
  };
}
  