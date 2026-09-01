---
schema: do-it/task-contract/v1
task_id: invalid-duplicate-aid
---

# Duplicate A-ID

## Goal
Ship the helper.

## Decisions
- D1 [choice] Patch the helper in place.

## Boundary
- In: `src/auth.ts`

## Acceptance
- A1 Helper rejects empty passwords
- A1 Tests stay green
