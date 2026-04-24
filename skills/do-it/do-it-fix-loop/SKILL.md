---
name: do-it-fix-loop
description: Use when applying review feedback, closing findings, repairing regressions, or proving that Blocking or Important do-it findings are resolved.
---

# Do-It Fix Loop

## Purpose

Use this to turn review feedback into verified repairs. A finding is closed by
evidence, not by changing code once.

## Tiers

### Light

Use for obvious one-line or docs fixes with a direct check.

- Verify the feedback against current files.
- Patch narrowly.
- Run the targeted check.
- Confirm the exact finding is closed.

### Standard

Use for normal review-fix work and subagent fix assignments unless explicitly
assigned otherwise.

1. Read all feedback before editing.
2. Clarify anything ambiguous before partial implementation.
3. Verify each finding against the current codebase.
4. Reject or downgrade unsupported findings with evidence.
5. Fix one issue or tightly related cluster at a time.
6. Add or update a regression check when behavior changed.
7. Re-run the finding-specific verification.
8. Re-review the changed surface.

### Heavy

Use when fixes cross boundaries, reopen architecture/interface choices, affect
state/security/persistence, or close a wave/phase review set. Heavy is
parent-only unless explicitly assigned.

- Preserve finding IDs, cause, fix, verification, and follow-up evidence for the final report or commit body.
- Re-run interface or architecture drills if the fix changed boundaries.
- Do not broaden into cleanup while `Blocking` or `Important` findings are open.
- Require integrated re-review before closeout.

## Feedback Handling

- Human feedback is authoritative on desired scope, but still verify technical details.
- External or subagent feedback is a claim to check.
- Do not respond with performative agreement; act or give technical pushback.
- If a suggested fix would add unused surface, ask whether to remove or defer it.

## Closure Record

For each fixed finding, record:

- original finding;
- verification that it was real;
- root cause or cause class;
- files changed;
- command or line evidence proving closure;
- remaining risk or deferred opportunity.

If proof is blocked, mark the item `STILL_OPEN` or `NEEDS_CONTEXT`.
