import { Prisma } from '@prisma/client';
import { prisma } from '../../db/prisma';

export type SubscriptionPlanItem = {
  index: 1 | 2 | 3;
  name: string;
  price: number;
  durationDays: number;
  enabled: boolean;
};

export type AccessSettings = {
  subscriptionPrice: number;
  subscriptionDurationDays: number;
  allowFreeAttempts: boolean;
  freeDailyLimit: number;
  freeOralDailyLimit: number;
  botAiDailyLimitFree: number;
  showAnswersWithoutSubscription: boolean;
  oneTimePrice: number;
  showAnswersForOneTime: boolean;
  subscriptionPlans: SubscriptionPlanItem[];
};

type AccessSettingsRow = {
  subscriptionPrice: number;
  subscriptionDurationDays: number;
  allowFreeAttempts: boolean;
  freeDailyLimit: number;
  freeOralDailyLimit: number;
  botAiDailyLimitFree?: number;
  showAnswersWithoutSubscription: boolean;
  oneTimePrice: number;
  showAnswersForOneTime: boolean;
  plan1Name?: string | null;
  plan1Price?: number | null;
  plan1DurationDays?: number | null;
  plan1Enabled?: boolean | null;
  plan2Name?: string | null;
  plan2Price?: number | null;
  plan2DurationDays?: number | null;
  plan2Enabled?: boolean | null;
  plan3Name?: string | null;
  plan3Price?: number | null;
  plan3DurationDays?: number | null;
  plan3Enabled?: boolean | null;
};

const SETTINGS_ID = 'default';
const CACHE_TTL_MS = 60_000; // 1 minute

const DEFAULT_PLANS: SubscriptionPlanItem[] = [
  { index: 1, name: 'Подписка', price: 99000, durationDays: 30, enabled: true },
  { index: 2, name: '', price: 0, durationDays: 0, enabled: false },
  { index: 3, name: '', price: 0, durationDays: 0, enabled: false },
];

function rowToPlans(row: AccessSettingsRow): SubscriptionPlanItem[] {
  return [
    {
      index: 1,
      name: row.plan1Name?.trim() ?? 'Подписка',
      price: Math.max(0, row.plan1Price ?? 99000),
      durationDays: Math.max(1, row.plan1DurationDays ?? 30),
      enabled: row.plan1Enabled ?? true,
    },
    {
      index: 2,
      name: row.plan2Name?.trim() ?? '',
      price: Math.max(0, row.plan2Price ?? 0),
      durationDays: Math.max(0, row.plan2DurationDays ?? 0),
      enabled: row.plan2Enabled ?? false,
    },
    {
      index: 3,
      name: row.plan3Name?.trim() ?? '',
      price: Math.max(0, row.plan3Price ?? 0),
      durationDays: Math.max(0, row.plan3DurationDays ?? 0),
      enabled: row.plan3Enabled ?? false,
    },
  ];
}

function firstEnabledPlan(plans: SubscriptionPlanItem[]): { price: number; durationDays: number } {
  const p = plans.find((x) => x.enabled);
  if (p) return { price: p.price, durationDays: p.durationDays };
  return { price: 99000, durationDays: 30 };
}

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
    const row = existing as unknown as AccessSettingsRow;
    const subscriptionPlans = rowToPlans(row);
    const first = firstEnabledPlan(subscriptionPlans);
    const value: AccessSettings = {
      subscriptionPrice: first.price,
      subscriptionDurationDays: first.durationDays,
      allowFreeAttempts: existing.allowFreeAttempts,
      freeDailyLimit: existing.freeDailyLimit,
      freeOralDailyLimit: existing.freeOralDailyLimit,
      botAiDailyLimitFree: row.botAiDailyLimitFree ?? 3,
      showAnswersWithoutSubscription: existing.showAnswersWithoutSubscription,
      oneTimePrice: existing.oneTimePrice,
      showAnswersForOneTime: existing.showAnswersForOneTime,
      subscriptionPlans,
    };
    cache = { at: now, value };
    return value;
  }

  const created = await prisma.accessSettings.create({
    data: {
      id: SETTINGS_ID,
      subscriptionPrice: 99000,
      subscriptionDurationDays: 30,
      allowFreeAttempts: true,
      freeDailyLimit: 1,
      freeOralDailyLimit: 5,
      botAiDailyLimitFree: 3,
      showAnswersWithoutSubscription: false,
      oneTimePrice: 15000,
      showAnswersForOneTime: false,
    },
  });

  const row = created as unknown as AccessSettingsRow;
  const subscriptionPlans = rowToPlans(row);
  const first = firstEnabledPlan(subscriptionPlans);
  const value: AccessSettings = {
    subscriptionPrice: first.price,
    subscriptionDurationDays: first.durationDays,
    allowFreeAttempts: created.allowFreeAttempts,
    freeDailyLimit: created.freeDailyLimit,
    freeOralDailyLimit: created.freeOralDailyLimit,
    botAiDailyLimitFree: row.botAiDailyLimitFree ?? 3,
    showAnswersWithoutSubscription: created.showAnswersWithoutSubscription,
    oneTimePrice: created.oneTimePrice,
    showAnswersForOneTime: created.showAnswersForOneTime,
    subscriptionPlans,
  };
  cache = { at: now, value };
  return value;
}

export async function updateAccessSettings(
  next: Partial<AccessSettings> & {
    subscriptionPlans?: SubscriptionPlanItem[];
    plan1Name?: string;
    plan1Price?: number;
    plan1DurationDays?: number;
    plan1Enabled?: boolean;
    plan2Name?: string;
    plan2Price?: number;
    plan2DurationDays?: number;
    plan2Enabled?: boolean;
    plan3Name?: string;
    plan3Price?: number;
    plan3DurationDays?: number;
    plan3Enabled?: boolean;
  }
): Promise<AccessSettings> {
  cache = null;
  const plans = next.subscriptionPlans ?? [];
  const updatePayload: Prisma.AccessSettingsUncheckedUpdateInput = {
    ...(next.subscriptionPrice !== undefined && { subscriptionPrice: next.subscriptionPrice }),
    ...(next.subscriptionDurationDays !== undefined && { subscriptionDurationDays: next.subscriptionDurationDays }),
    ...(next.allowFreeAttempts !== undefined && { allowFreeAttempts: next.allowFreeAttempts }),
    ...(next.freeDailyLimit !== undefined && { freeDailyLimit: next.freeDailyLimit }),
    ...(next.freeOralDailyLimit !== undefined && { freeOralDailyLimit: next.freeOralDailyLimit }),
    ...(next.botAiDailyLimitFree !== undefined && { botAiDailyLimitFree: next.botAiDailyLimitFree }),
    ...(next.showAnswersWithoutSubscription !== undefined && { showAnswersWithoutSubscription: next.showAnswersWithoutSubscription }),
    ...(next.oneTimePrice !== undefined && { oneTimePrice: next.oneTimePrice }),
    ...(next.showAnswersForOneTime !== undefined && { showAnswersForOneTime: next.showAnswersForOneTime }),
  };
  if (plans.length >= 1) {
    updatePayload.plan1Name = plans[0].name;
    updatePayload.plan1Price = plans[0].price;
    updatePayload.plan1DurationDays = plans[0].durationDays;
    updatePayload.plan1Enabled = plans[0].enabled;
  }
  if (plans.length >= 2) {
    updatePayload.plan2Name = plans[1].name;
    updatePayload.plan2Price = plans[1].price;
    updatePayload.plan2DurationDays = plans[1].durationDays;
    updatePayload.plan2Enabled = plans[1].enabled;
  }
  if (plans.length >= 3) {
    updatePayload.plan3Name = plans[2].name;
    updatePayload.plan3Price = plans[2].price;
    updatePayload.plan3DurationDays = plans[2].durationDays;
    updatePayload.plan3Enabled = plans[2].enabled;
  }
  if (next.plan1Name !== undefined) updatePayload.plan1Name = next.plan1Name;
  if (next.plan1Price !== undefined) updatePayload.plan1Price = next.plan1Price;
  if (next.plan1DurationDays !== undefined) updatePayload.plan1DurationDays = next.plan1DurationDays;
  if (next.plan1Enabled !== undefined) updatePayload.plan1Enabled = next.plan1Enabled;
  if (next.plan2Name !== undefined) updatePayload.plan2Name = next.plan2Name;
  if (next.plan2Price !== undefined) updatePayload.plan2Price = next.plan2Price;
  if (next.plan2DurationDays !== undefined) updatePayload.plan2DurationDays = next.plan2DurationDays;
  if (next.plan2Enabled !== undefined) updatePayload.plan2Enabled = next.plan2Enabled;
  if (next.plan3Name !== undefined) updatePayload.plan3Name = next.plan3Name;
  if (next.plan3Price !== undefined) updatePayload.plan3Price = next.plan3Price;
  if (next.plan3DurationDays !== undefined) updatePayload.plan3DurationDays = next.plan3DurationDays;
  if (next.plan3Enabled !== undefined) updatePayload.plan3Enabled = next.plan3Enabled;

  const updated = await prisma.accessSettings.upsert({
    where: { id: SETTINGS_ID },
    update: updatePayload,
    create: {
      id: SETTINGS_ID,
      subscriptionPrice: next.subscriptionPrice ?? 99000,
      subscriptionDurationDays: next.subscriptionDurationDays ?? 30,
      allowFreeAttempts: next.allowFreeAttempts ?? true,
      freeDailyLimit: next.freeDailyLimit ?? 1,
      freeOralDailyLimit: next.freeOralDailyLimit ?? 5,
      botAiDailyLimitFree: next.botAiDailyLimitFree ?? 3,
      showAnswersWithoutSubscription: next.showAnswersWithoutSubscription ?? false,
      oneTimePrice: next.oneTimePrice ?? 15000,
      showAnswersForOneTime: next.showAnswersForOneTime ?? false,
    },
  });

  const row = updated as unknown as AccessSettingsRow;
  const subscriptionPlans = rowToPlans(row);
  const first = firstEnabledPlan(subscriptionPlans);
  return {
    subscriptionPrice: first.price,
    subscriptionDurationDays: first.durationDays,
    allowFreeAttempts: updated.allowFreeAttempts,
    freeDailyLimit: updated.freeDailyLimit,
    freeOralDailyLimit: updated.freeOralDailyLimit,
    botAiDailyLimitFree: row.botAiDailyLimitFree ?? 3,
    showAnswersWithoutSubscription: updated.showAnswersWithoutSubscription,
    oneTimePrice: updated.oneTimePrice,
    showAnswersForOneTime: updated.showAnswersForOneTime,
    subscriptionPlans,
  };
}
