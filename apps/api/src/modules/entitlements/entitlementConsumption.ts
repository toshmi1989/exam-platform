// src/modules/entitlements/entitlementConsumption.ts

import { prisma } from '../../db/prisma';

export type ConsumableEntitlement = 'subscription' | 'oneTime' | 'daily';

export async function consumeEntitlement(
  userId: string | null,
  examId: string,
  entitlementType: ConsumableEntitlement | 'none',
  idempotencyKey: string,
  guestSessionId?: string | null
): Promise<void> {
  if (entitlementType === 'none') return;
  if (entitlementType === 'oneTime') {
    const now = new Date();
    const where: { examId: string; consumedAt: null; userId?: string; guestSessionId?: string } = {
      examId,
      consumedAt: null,
    };
    if (userId) {
      where.userId = userId;
    } else if (guestSessionId) {
      where.guestSessionId = guestSessionId;
    } else {
      return;
    }
    const existing = await prisma.oneTimeAccess.findFirst({
      where,
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
  