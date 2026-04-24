---
name: do-it-tdd
description: Use when implementing do-it work that changes behavior, fixes a bug, refactors code, adds tests, or needs regression coverage before code changes.
---

# Do-It TDD

## Purpose

Use this to make behavior changes test-led without turning every edit into a
large ceremony.

Core rule: one behavior at a time. For broad work, start with a vertical tracer
bullet that proves the thinnest end-to-end path, then deepen behavior slice by
slice.

## Tiers

### Light

Use for tiny mechanical edits, docs-only truth repairs, generated output, or
config where an executable RED test is not useful.

- Inspect the owning file and adjacent pattern.
- State the targeted check or why test-first is not applicable.
- Edit narrowly and verify by grep, typecheck, build, or local review.

### Standard

Use for normal behavior changes and subagent implementation work. Subagents
default to Standard unless the parent explicitly assigns Light or Heavy.

1. Map the owning files, call path, side effects, and first test to fail.
2. Write the smallest RED test for one behavior.
3. Run it and confirm it fails for the expected reason.
4. Implement the smallest GREEN change.
5. Rerun the narrow test and then the next relevant check.
6. Refactor only after green.
7. Repeat for the next behavior.

### Heavy

Use for unclear root cause, contract changes, persistence/security/concurrency,
or multi-slice behavior. Heavy is parent-only unless explicitly assigned.

- Lock the behavior contract before implementation.
- Consider separate RED and GREEN agents only when that reduces real risk.
- Use a vertical tracer bullet before filling edge cases.
- Add boundary, migration, failure-path, or e2e checks according to risk.
- Require review and fix-loop closure before closeout.

## Test Quality

- Test user-visible or contract behavior, not implementation trivia.
- Prefer real code paths over mocks; mock only unavoidable external seams.
- If the test name needs "and", split the behavior.
- A passing test that never failed is not regression evidence.
- If RED fails for the wrong reason, fix the test before touching production code.

## Bugfix Rule

For bugs, use `do-it-debugging` first enough to state the root cause. Then write
the regression test that would have caught that cause, not only the symptom.

## Handoff Return

When TDD is delegated, the subagent returns:

- tier used;
- RED command and failure reason;
- GREEN command and pass result;
- files changed;
- behaviors covered and not covered;
- assumptions or residual risk.
