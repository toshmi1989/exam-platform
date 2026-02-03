// src/modules/entitlements/entitlementConsumption.ts

import { prisma } from '../../db/prisma';

export async function consumeEntitlement(
  userId: string,
  examId: string,
  entitlementType: 'subscription' | 'oneTime' | 'daily',
  idempotencyKey: string
): Promise<void> {
  if (entitlementType === 'oneTime') {
    const now = new Date();
    const existing = await prisma.oneTimeAccess.findFirst({
      where: {
        userId,
        examId,
        consumedAt: null,
      },
      select: { id: true },
    });
    if (!existing) return;
    await prisma.oneTimeAccess.update({
      where: { id: existing.id },
      data: { consumedAt: now },
    });
    return;
  }

  if (entitlementType === 'daily') {
    // Daily limit is enforced by counting attempts; no extra record needed.
    return;
  }

  // Subscription: no-op.
  return;
}
  