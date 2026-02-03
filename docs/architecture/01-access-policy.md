## Access Policy and User States

This document defines user states, roles, and the access rules enforced at
attempt creation. It is the canonical reference for server-side enforcement.

### User Roles and States

- Guest: unauthenticated. Can view categories and directions. Cannot start tests.
- Authorized (no subscription): authenticated via Telegram ID. Daily limit: 1 test.
- Authorized (active subscription): authenticated via Telegram ID. Unlimited attempts.
- Admin: access to admin panel only. Cannot start or take tests.

### Access Principles

- All access rules are enforced server-side.
- UI reflects permissions provided by the API only.
- Attempt creation is the single access gate.
- Telegram ID is the primary user identifier.
- Subscription status and daily limits are evaluated on every attempt start.

### Entitlements (Access Rights)

Access to exams is granted via entitlements resolved by AccessPolicy:

- Subscription entitlement (active subscription tier).
- One-time exam entitlement (pay-per-test).
- Free daily attempt entitlement (if applicable).

One-time exam entitlement:

- Granted after successful one-time payment.
- Allows exactly ONE exam attempt.
- Consumed at attempt creation.
- Does not change user role or identity state.
- Can be granted to guests (post-payment, temporary identity) or verified users.

### Entitlement Resolution Priority

When creating an exam attempt, AccessPolicy resolves access in the following order:

1. Active subscription entitlement.
2. One-time exam entitlement.
3. Free daily attempt entitlement.
4. No access (blocked).

### Unified Access Decision Rules (Attempt Creation Gate)

Inputs:
- subscriptionActive
- hasOneTimeEntitlement(examId)
- dailyLimitAvailable
- attemptAlreadyActive
- userSuspended
- isAdmin
- examIsActive

Rules (ordered):

1. Deny if isAdmin.
2. Deny if userSuspended.
3. Deny if examIsActive is false.
4. Deny if attemptAlreadyActive.
5. Allow if subscriptionActive.
6. Allow if hasOneTimeEntitlement(examId) and consume it.
7. Allow if dailyLimitAvailable and consume it.
8. Deny otherwise.

### Deny Reason Codes

Canonical deny reasons (non-exhaustive):
- ADMIN_ONLY
- ACCESS_FORBIDDEN
- EXAM_UNAVAILABLE
- ATTEMPT_ACTIVE_EXISTS
- ACCESS_DENIED

### Domain Invariants (Access)

- Attempt creation is the single access gate.
- Admins can never start exams.
- Suspended users can never start exams.
- One-time entitlements are exam-scoped and single-use.
- Entitlement consumption is atomic with attempt creation.
