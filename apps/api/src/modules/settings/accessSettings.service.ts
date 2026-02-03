import { prisma } from '../../db/prisma';

export type AccessSettings = {
  subscriptionPrice: number;
  subscriptionDurationDays: number;
  allowFreeAttempts: boolean;
  freeDailyLimit: number;
  showAnswersWithoutSubscription: boolean;
  oneTimePrice: number;
  showAnswersForOneTime: boolean;
};

const SETTINGS_ID = 'default';

const DEFAULT_SETTINGS: AccessSettings = {
  subscriptionPrice: 99000,
  subscriptionDurationDays: 30,
  allowFreeAttempts: true,
  freeDailyLimit: 1,
  showAnswersWithoutSubscription: false,
  oneTimePrice: 15000,
  showAnswersForOneTime: false,
};

export async function getAccessSettings(): Promise<AccessSettings> {
  const existing = await prisma.accessSettings.findUnique({
    where: { id: SETTINGS_ID },
  });

  if (existing) {
    return {
      subscriptionPrice: existing.subscriptionPrice,
      subscriptionDurationDays: existing.subscriptionDurationDays,
      allowFreeAttempts: existing.allowFreeAttempts,
      freeDailyLimit: existing.freeDailyLimit,
      showAnswersWithoutSubscription: existing.showAnswersWithoutSubscription,
      oneTimePrice: existing.oneTimePrice,
      showAnswersForOneTime: existing.showAnswersForOneTime,
    };
  }

  const created = await prisma.accessSettings.create({
    data: {
      id: SETTINGS_ID,
      ...DEFAULT_SETTINGS,
    },
  });

  return {
    subscriptionPrice: created.subscriptionPrice,
    subscriptionDurationDays: created.subscriptionDurationDays,
    allowFreeAttempts: created.allowFreeAttempts,
    freeDailyLimit: created.freeDailyLimit,
    showAnswersWithoutSubscription: created.showAnswersWithoutSubscription,
    oneTimePrice: created.oneTimePrice,
    showAnswersForOneTime: created.showAnswersForOneTime,
  };
}

export async function updateAccessSettings(
  next: AccessSettings
): Promise<AccessSettings> {
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
    showAnswersWithoutSubscription: updated.showAnswersWithoutSubscription,
    oneTimePrice: updated.oneTimePrice,
    showAnswersForOneTime: updated.showAnswersForOneTime,
  };
}
