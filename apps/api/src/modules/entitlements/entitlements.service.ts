// src/modules/entitlements/entitlements.service.ts

import { prisma } from '../../db/prisma';
import { getAccessSettings } from '../settings/accessSettings.service';

export async function getEntitlementsForExam(
  userId: string,
  examId: string
): Promise<{
  subscriptionActive: boolean;
  hasOneTimeForExam: boolean;
  dailyLimitAvailable: boolean;
}> {
  const settings = await getAccessSettings();
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date(todayStart);
  todayEnd.setDate(todayEnd.getDate() + 1);

  // Дневной лимит тратится при запуске попытки (startAttempt), а не при завершении.
  // Считаем все запуски за сегодня: и «Сдать тест» (EXAM), и «Готовиться к тесту» (PRACTICE).
  // Без этого в режиме практики можно было бы многократно нажимать «начать заново» и не тратить лимит.
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
    settings.allowFreeAttempts &&
    settings.freeDailyLimit > 0 &&
    dailyCount < settings.freeDailyLimit;
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
  const oneTime = await prisma.oneTimeAccess.findFirst({
    where: {
      userId,
      examId,
      consumedAt: null,
    },
    select: { id: true },
  });
  return {
    subscriptionActive: Boolean(activeSubscription),
    hasOneTimeForExam: Boolean(oneTime),
    dailyLimitAvailable,
  };
}
  