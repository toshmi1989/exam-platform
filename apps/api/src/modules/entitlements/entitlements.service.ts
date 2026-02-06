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

  const dailyCount = await prisma.examAttempt.count({
    where: {
      userId,
      // Free daily limit should be consumed on actual attempt start (launch),
      // not merely on attempt record creation.
      startedAt: {
        not: null,
        gte: todayStart,
        lt: todayEnd,
      },
      mode: 'EXAM',
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
  