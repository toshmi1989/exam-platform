// modules/policy/accessPolicy.ts

// ===== Types =====

export type Role = 'guest' | 'authorized' | 'admin';
export type UserStatus = 'active' | 'suspended';

export type EntitlementType = 'subscription' | 'oneTime' | 'daily' | 'none';

export type AccessDecision =
  | {
      decision: 'allow';
      entitlementType: EntitlementType;
    }
  | {
      decision: 'deny';
      reasonCode: string;
    };

export interface AccessContext {
  user: {
    id: string;
    role: Role;
    status: UserStatus;
    hasActiveAttempt: boolean;
  };

  exam: {
    id: string;
    isActive: boolean;
  };

  /** For ORAL: one-time access does not apply; access is subscription or oralDailyLimitAvailable. */
  examType?: 'TEST' | 'ORAL';

  entitlements: {
    subscriptionActive: boolean;
    hasOneTimeForExam: boolean;
    dailyLimitAvailable: boolean;
    oralDailyLimitAvailable: boolean;
  };
}

// ===== Policy =====

export function evaluateAccess(
  ctx: AccessContext
): AccessDecision {
  const { user, exam, entitlements } = ctx;

  // 1. Admins cannot take exams
  if (user.role === 'admin') {
    return { decision: 'deny', reasonCode: 'ADMIN_ONLY' };
  }

  // 2. Suspended users
  if (user.status === 'suspended') {
    return { decision: 'deny', reasonCode: 'ACCESS_FORBIDDEN' };
  }

  // 3. Exam must be active
  if (!exam.isActive) {
    return { decision: 'deny', reasonCode: 'EXAM_UNAVAILABLE' };
  }

  // 4. Only one active attempt at a time
  if (user.hasActiveAttempt) {
    return { decision: 'deny', reasonCode: 'ATTEMPT_ACTIVE_EXISTS' };
  }

  // 5. Subscription
  if (entitlements.subscriptionActive) {
    return { decision: 'allow', entitlementType: 'subscription' };
  }

  const isOral = ctx.examType === 'ORAL';

  // 6. Oral: only subscription or daily oral limit (one-time does not allow oral)
  if (isOral) {
    if (entitlements.oralDailyLimitAvailable) {
      return { decision: 'allow', entitlementType: 'daily' };
    }
    return { decision: 'deny', reasonCode: 'ACCESS_DENIED' };
  }

  // 7. One-time exam access (TEST only)
  if (entitlements.hasOneTimeForExam) {
    return { decision: 'allow', entitlementType: 'oneTime' };
  }

  // 8. Daily free attempt (TEST only)
  if (entitlements.dailyLimitAvailable) {
    return { decision: 'allow', entitlementType: 'daily' };
  }

  // 9. No access
  return {
    decision: 'deny',
    reasonCode: 'ACCESS_DENIED',
  };
}
