## Payments and Entitlements

This document defines payment flows and how entitlements are issued and consumed.

### Entitlement Sources

- Subscription entitlement: unlimited exam attempts while active.
- One-time exam entitlement: single-use, exam-scoped.
- Free daily attempt: max 1 per platform day (policy-controlled).

### Subscription Flow (Conceptual)

1. User selects a plan.
2. API creates payment session.
3. Payment provider completes checkout.
4. Webhook confirms payment.
5. Subscription entitlement becomes active.

### One-Time Exam Purchase Flow (Conceptual)

1. User selects a specific exam.
2. API creates payment session.
3. Payment provider completes checkout.
4. Webhook grants one-time exam entitlement.
5. Entitlement consumed when attempt is created.

### Webhook Rules

- Webhook is the single source of truth for entitlement issuance.
- Webhook handlers must be idempotent.
- Refunds revoke unused entitlements.

### Consumption Rules

- Entitlements are consumed at attempt creation, atomically.
- Subscription entitlements are not consumed (no-op).
- One-time entitlements are exam-scoped and single-use.
- Daily free attempts are consumed when used.
