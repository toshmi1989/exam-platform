## Exam Wizard State Machine

This document defines the exam wizard as a deterministic state machine.
The state machine is owned by domain logic, not UI components.

### Core States

- gateAccess: validates identity and entitlements.
- createAttempt: server creates attempt (atomic entitlement consumption).
- instructions: rules and timing shown; timer not started.
- inProgress: active exam session; answers are saved.
- paused: optional, only if exam allows pause.
- submitReview: review before final submission.
- submitFinal: submission is locked and sent.
- completed: results view.
- blocked: access denied.

### Events

- START
- SAVE_ANSWER
- SUBMIT
- TIME_EXPIRED

### Transitions (Conceptual)

```
gateAccess -> createAttempt (allowed)
gateAccess -> blocked (notAllowed)
createAttempt -> instructions
instructions -> inProgress (start)
inProgress -> inProgress (saveAnswer)
inProgress -> paused (pauseAllowed)
paused -> inProgress (resume)
inProgress -> submitReview (timeExpiredOrSubmit)
submitReview -> submitFinal
submitFinal -> completed
```

### Guardrails

- Transitions occur only via events.
- UI cannot bypass guards or access rules.
- Time limits are enforced by server time.
- Submission is idempotent and locks the attempt.

### Edge Case Handling (Summary)

- Attempt already active: resume existing attempt.
- Network loss: allow local caching; sync on reconnect.
- Submit failure: retry until idempotent success.
- Time expires in review: auto-submit.
