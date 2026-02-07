import { prisma } from '../../db/prisma';

export type AccessSettings = {
  subscriptionPrice: number;
  subscriptionDurationDays: number;
  allowFreeAttempts: boolean;
  freeDailyLimit: number;
  freeOralDailyLimit: number;
  showAnswersWithoutSubscription: boolean;
  oneTimePrice: number;
  showAnswersForOneTime: boolean;
};

const SETTINGS_ID = 'default';
const CACHE_TTL_MS = 60_000; // 1 minute

const DEFAULT_SETTINGS: AccessSettings = {
  subscriptionPrice: 99000,
  subscriptionDurationDays: 30,
  allowFreeAttempts: true,
  freeDailyLimit: 1,
  freeOralDailyLimit: 5,
  showAnswersWithoutSubscription: false,
  oneTimePrice: 15000,
  showAnswersForOneTime: false,
};

let cache: { at: number; value: AccessSettings } | null = null;

export async function getAccessSettings(): Promise<AccessSettings> {
  const now = Date.now();
  if (cache && now - cache.at < CACHE_TTL_MS) {
    return cache.value;
  }

  const existing = await prisma.accessSettings.findUnique({
    where: { id: SETTINGS_ID },
  });

  if (existing) {
    const value: AccessSettings = {
      subscriptionPrice: existing.subscriptionPrice,
      subscriptionDurationDays: existing.subscriptionDurationDays,
      allowFreeAttempts: existing.allowFreeAttempts,
      freeDailyLimit: existing.freeDailyLimit,
      freeOralDailyLimit: existing.freeOralDailyLimit,
      showAnswersWithoutSubscription: existing.showAnswersWithoutSubscription,
      oneTimePrice: existing.oneTimePrice,
      showAnswersForOneTime: existing.showAnswersForOneTime,
    };
    cache = { at: now, value };
    return value;
  }

  const created = await prisma.accessSettings.create({
    data: {
      id: SETTINGS_ID,
      ...DEFAULT_SETTINGS,
    },
  });

  const value: AccessSettings = {
    subscriptionPrice: created.subscriptionPrice,
    subscriptionDurationDays: created.subscriptionDurationDays,
    allowFreeAttempts: created.allowFreeAttempts,
    freeDailyLimit: created.freeDailyLimit,
    freeOralDailyLimit: created.freeOralDailyLimit,
    showAnswersWithoutSubscription: created.showAnswersWithoutSubscription,
    oneTimePrice: created.oneTimePrice,
    showAnswersForOneTime: created.showAnswersForOneTime,
  };
  cache = { at: now, value };
  return value;
}

export async function updateAccessSettings(
  next: AccessSettings
): Promise<AccessSettings> {
  cache = null;
  const updated = await prisma.accessSettings.upsert({
    where: { id: SETTINGS_ID },
    update: next,
    create: { id: SETTINGS_ID, ...next },
  });

  return {
    subscriptionPrice: updated.subscriptionPrice,
    subscriptionDurationDays: updated.subscriptionDurationDays,
    allowFreeAttempts: updated.allowFreeAttempts,
    freeDailyLimit: updated.freeDailyLimit,
    freeOralDailyLimit: updated.freeOralDailyLimit,
    showAnswersWithoutSubscription: updated.showAnswersWithoutSubscription,
    oneTimePrice: updated.oneTimePrice,
    showAnswersForOneTime: updated.showAnswersForOneTime,
  };
}
