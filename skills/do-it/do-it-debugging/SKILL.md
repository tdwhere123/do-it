---
name: do-it-debugging
description: "Use when a bug's root cause is unclear or prior fixes failed and you need a hypothesis, instrumentation, falsification, root fix, and regression proof."
---

# Do-It Debugging

## Purpose

Use this before fixing symptoms. The output is a root-cause diagnosis and a TDD
fix plan that can be verified.

## Tiers

### Light

Use when the failure is local, reproducible, and the likely owner is obvious.

- Read the full error and exit code.
- Reproduce once with the narrowest command.
- Inspect the owning code and the nearest working example.
- State root cause and fix plan before editing.

### Standard

Use for ordinary failing tests, bugs, or unclear behavior. This is the default
debugging tier for subagents unless assigned otherwise.

1. Capture the symptom in durable language: user-visible issue, trigger, impact.
2. Reproduce or explain why reproduction is blocked.
3. Check recent diffs, inputs, environment, and adjacent working paths.
4. Trace data/control flow backward to the first wrong value or decision.
5. State one hypothesis: root cause because evidence.
6. Test the hypothesis with the smallest check.
7. Write a regression test or verification check before the fix when feasible.
8. Fix the cause, then verify the original symptom and regression coverage.

### Heavy

Use for multi-component failures, repeated failed fixes, architecture suspicion,
data loss, security, persistence, async ordering, or release/gate failures.
Heavy is parent-only unless explicitly assigned.

- Freeze the failing surface and current evidence.
- Instrument or inspect each component boundary before proposing fixes.
- Separate cause, contributing factors, and unrelated observations.
- If three fix attempts fail, stop and question the architecture before trying another patch.
- Route interface or architecture findings to the relevant do-it skill.

## Root-Cause Standard

A diagnosis is ready only when it names:

- where the bad state starts;
- why existing checks allowed it;
- what change prevents recurrence;
- what verification proves the fix.

If any part is missing, report `Needs more evidence` rather than guessing.

## Debugging Loop

Use the smallest loop that can prove the cause:

1. **Reproduce:** capture the failing command, user action, log, or blocked
   reproduction reason.
2. **Localize:** trace backward from the observed wrong state to the first bad
   value, branch, input, or missing boundary check.
3. **Reduce:** find the narrowest failing path that still shows the issue.
4. **Fix:** change the cause, not the downstream symptom.
5. **Guard:** add a regression test, verification check, or documented
   prevention hook that would catch the same cause.

## Stop Conditions

Stop and return `Needs more evidence` or reroute when:

- reproduction is blocked and no reliable witness exists;
- evidence points to a contract or architecture boundary outside the current
  ownership;
- three fix attempts fail or produce a new symptom;
- the proposed fix only masks an error without explaining the bad state;
- verification cannot exercise the original symptom or the reduced failing path.

## Fix Plan Shape

- Issue statement: user-facing symptom and impact.
- Evidence: commands, files, line facts, or reproduction steps.
- Root cause: specific source of the wrong behavior.
- TDD plan: first failing check, minimal fix, broadened verification.
- Risk: what may remain unproven.

## Common Rationalizations

- *"The failure is probably caused by the recent diff."* — Recent diffs are a
  lead, not a diagnosis; trace to the first bad state.
- *"The fix is obvious."* — If the cause is not named, the patch may only move
  the symptom.
- *"I cannot reproduce it, but this should help."* — Without a witness or
  blocked-repro statement, the claim is not verifiable.

## Red Flags

- The proposed fix appears before reproduction or a blocked-repro explanation.
- The diagnosis names a component but not the wrong value or decision.
- Verification proves a different path than the original symptom.
- The patch adds fallback behavior without explaining why the primary path
  failed.
- The same class of failure recurs after multiple fixes.

## Verification

Before closing a debugging task:

- original symptom is reproduced or reproduction is explicitly blocked with
  evidence;
- root cause names the first bad state and the missing guard;
- the fix is paired with a regression or prevention check when feasible;
- the original symptom and the reduced failing path now pass;
- residual risk is stated when any path remains unproven.
