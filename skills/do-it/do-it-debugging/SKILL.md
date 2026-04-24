---
name: do-it-debugging
description: Use when do-it work hits a bug, failing test, broken command, unexpected behavior, unclear root cause, or regression that must be diagnosed before fixing.
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

## Fix Plan Shape

- Issue statement: user-facing symptom and impact.
- Evidence: commands, files, line facts, or reproduction steps.
- Root cause: specific source of the wrong behavior.
- TDD plan: first failing check, minimal fix, broadened verification.
- Risk: what may remain unproven.
