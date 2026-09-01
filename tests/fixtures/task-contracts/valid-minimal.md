---
schema: do-it/task-contract/v1
task_id: valid-minimal
---

# Valid minimal contract

## Goal
The login helper rejects empty passwords.

## Decisions
- D1 [evidence] Empty passwords are already invalid in the domain type.

## Boundary
- In: `src/auth.ts`, `tests/auth.test.ts`
- Preserve: public login API
- Out: unrelated UI copy

## Acceptance
- A1 Empty password is rejected at the domain boundary
- A2 Existing valid-login test still passes
