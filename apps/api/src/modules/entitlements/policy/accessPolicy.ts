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

  entitlements: {
    subscriptionActive: boolean;
    hasOneTimeForExam: boolean;
    dailyLimitAvailable: boolean;
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

  // 6. One-time exam access
  if (entitlements.hasOneTimeForExam) {
    return { decision: 'allow', entitlementType: 'oneTime' };
  }

  // 7. Daily free attempt
  if (entitlements.dailyLimitAvailable) {
    return { decision: 'allow', entitlementType: 'daily' };
  }

  // 8. No access
  return {
    decision: 'deny',
    reasonCode: 'ACCESS_DENIED',
  };
}
