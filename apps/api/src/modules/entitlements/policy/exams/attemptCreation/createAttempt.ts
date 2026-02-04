// modules/attempts/createAttempt.ts

import { evaluateAccess, AccessDecision } from '../../accessPolicy';

// ===== Types =====

export type AttemptStatus =
  | 'created'
  | 'inProgress'
  | 'submitted'
  | 'completed'
  | 'expired';

export interface ExamAttempt {
  id: string;
  userId: string;
  examId: string;
  status: AttemptStatus;
  entitlementType: 'subscription' | 'oneTime' | 'daily';
  createdAt: Date;
}

// ===== Input =====

export interface CreateAttemptInput {
  user: {
    id: string;
    role: 'guest' | 'authorized' | 'admin';
    status: 'active' | 'suspended';
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

// ===== Result =====

export type CreateAttemptResult =
  | { success: true; attempt: ExamAttempt }
  | { success: false; reasonCode: string };

// ===== Core Logic =====

export function createAttempt(
  input: CreateAttemptInput
): CreateAttemptResult {
  const decision: AccessDecision = evaluateAccess(input);

  if (decision.decision === 'deny') {
    return {
      success: false,
      reasonCode: decision.reasonCode,
    };
  }

  // 🔐 attempt creation (temporary in-memory style); evaluateAccess(allow) never returns entitlementType 'none'
  const attempt: ExamAttempt = {
    id: crypto.randomUUID(),
    userId: input.user.id,
    examId: input.exam.id,
    status: 'created',
    entitlementType: decision.entitlementType as 'subscription' | 'oneTime' | 'daily',
    createdAt: new Date(),
  };

  return {
    success: true,
    attempt,
  };
}
