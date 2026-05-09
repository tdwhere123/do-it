---
name: do-it-tdd
description: "Use when a behavior change needs a failing regression or contract test before implementation."
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

1. Map the owning files, call path, side effects, failure-mode forecast, and first test to fail.
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

## Failure-Mode RED Matrix

Choose RED coverage from the forecast, not only from the happy path:

- live-path gap: exercise the real producer -> consumer chain or the closest
  integration seam that proves it is wired.
- state-machine gap: cover at least one deletion, stale completion, duplicate,
  rollback, retry, replay, idempotency, or concurrency branch.
- contract drift: assert schema/enum/event/route/client lists cannot diverge
  silently.
- synthetic proof: add one test that fails if the mocked collaborator is removed
  from the path being claimed.
- operator gap: cover the command, visible control, or user action that makes
  the capability discoverable and actionable.
- evidence drift: identify the final branch/worktree verification that must be
  rerun after integration.
## Test Quality

- Test user-visible, operator-visible, or contract behavior, not implementation trivia.
- Prefer real code paths over mocks; mock only unavoidable external seams.
- If the test name needs "and", split the behavior.
- A passing test that never failed is not regression evidence.
- If RED fails for the wrong reason, fix the test before touching production code.
- Verify each thin slice before broadening. Do not stack multiple behaviors
  behind one unproven GREEN.
- Prefer DAMP behavior clarity over DRY fixtures when over-abstracted tests hide
  what failed.

## Bugfix Rule

For bugs, use `do-it-debugging` first enough to state the root cause. Then write
the regression test that would have caught that cause, not only the symptom.

## Stop Conditions

Stop and reroute when:

- the first failing check cannot be made to fail for the intended reason;
- the root cause is still unknown after reproducing a bug symptom;
- the behavior requires a new public interface, schema, protocol, migration, or
  security boundary that has not had an interface drill;
- three GREEN attempts fail on the same behavior;
- the only available proof is a mock that removes the collaborator chain being
  claimed.

## Common Rationalizations

- *"I'll add tests after the implementation."* — Then there is no proof the
  test guards against the original behavior rather than the new code shape.
- *"This is too small for RED."* — Small behavior still needs either a failing
  check or an explicit reason test-first is not useful.
- *"The happy path is enough."* — Choose RED coverage from the failure-mode
  forecast; risk often lives in contract, state, or operator paths.

## Red Flags

- No command captured the RED failure.
- RED failed for a setup error, not the target behavior.
- The fix changes multiple behaviors before rerunning the narrow check.
- Tests assert private implementation details while the public contract can
  still regress.
- The verification claim depends on a mock that bypasses the live path.

## Handoff Return

When TDD is delegated, the subagent returns:

- tier used;
- RED command and failure reason;
- GREEN command and pass result;
- files changed;
- failure modes covered and not covered;
- behaviors covered and not covered;
- prevention hook added or still needed;
- assumptions or residual risk.

## Verification

For a TDD claim, evidence must include:

- RED command and expected failure reason, or a documented reason RED was not
  applicable;
- GREEN command and pass result for the same behavior;
- next relevant check after the narrow GREEN;
- failure-mode coverage and any untested risks;
- current-worktree final verification when slices are integrated.
