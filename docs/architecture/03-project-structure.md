## Project Structure and Boundaries

This document defines the high-level structure and separation of concerns.
No business logic should exist inside UI components.

### Target Structure (Conceptual)

- apps/web: Next.js PWA (pages + flows + UI composition).
- apps/api: Node API (access enforcement, attempt lifecycle).
- packages/domain: pure domain logic (policies, state machines).
- packages/services: integrations (payments, email, proctoring).
- packages/state: client state adapters.
- packages/ui: presentational UI components.

### Boundary Rules

- UI pages call services; they do not implement business rules.
- AccessPolicy is the single source of truth for access decisions.
- Attempt creation is the single access gate.
- Domain modules are framework-agnostic and side-effect free.

### Extensibility Targets

- New entitlement types (credits, enterprise seats).
- Proctoring hooks via attempt transitions.
- New content types beyond exams.
