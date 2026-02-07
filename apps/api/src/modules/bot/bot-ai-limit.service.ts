/**
 * Daily AI request limit for users without subscription.
 */

import { prisma } from '../../db/prisma';
import { getAccessSettings } from '../settings/accessSettings.service';

function startOfTodayUtc(): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

export async function checkBotAiLimit(telegramId: string): Promise<{
  allowed: boolean;
  count: number;
  limit: number;
  hasSubscription: boolean;
}> {
  const settings = await getAccessSettings();
  const limit = Math.max(0, settings.botAiDailyLimitFree);
  const userId = `tg-${telegramId}`;

  const [user, sub, countResult] = await Promise.all([
    prisma.user.findUnique({ where: { telegramId }, select: { id: true } }),
    prisma.userSubscription.findFirst({
      where: { userId: `tg-${telegramId}`, endsAt: { gte: new Date() } },
      orderBy: { endsAt: 'desc' },
    }),
    prisma.botAiRequestLog.count({
      where: {
        userId,
        createdAt: { gte: startOfTodayUtc() },
      },
    }),
  ]);

  const hasSubscription = Boolean(sub);
  if (hasSubscription) {
    return { allowed: true, count: countResult, limit, hasSubscription: true };
  }
  if (limit === 0) {
    return { allowed: false, count: countResult, limit: 0, hasSubscription: false };
  }
  const allowed = countResult < limit;
  return { allowed, count: countResult, limit, hasSubscription: false };
}

export async function recordBotAiRequest(telegramId: string): Promise<void> {
  const userId = `tg-${telegramId}`;
  await prisma.botAiRequestLog.create({
    data: { userId },
  });
}
