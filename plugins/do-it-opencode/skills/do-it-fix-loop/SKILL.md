---
name: do-it-fix-loop
description: "Use when review findings or regressions need atomic repair and the same-scope review must repeat until Blocking and Important findings are clear."
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

1. **Collect all findings first.** Wait until the review pass returns the complete list — do not start editing while findings are still arriving.
2. Clarify anything ambiguous before partial implementation.
3. Verify each finding against the current codebase.
4. Preserve the finding ID, headline, cause class, and repro/witness before editing.
5. Reject or downgrade unsupported findings with evidence.
6. **Run the Batch vs Pointwise Decision (see below) on the full list, in writing, before editing.**
7. Fix according to that decision: same-root findings get one root-cause repair; independent findings can be fixed in one pass (one commit may carry several unrelated fixes when each has its own evidence).
8. Add or update a regression check when behavior changed.
9. Re-run the finding-specific verification — covering all repaired findings, not one at a time.
10. Re-review the changed surface once, covering every repaired file.

### Heavy

Use when fixes cross boundaries, reopen architecture/interface choices, affect
state/security/persistence, or close a wave/phase review set. Heavy is
parent-only unless explicitly assigned.

- Preserve finding IDs, cause, fix, verification, prevention, and follow-up evidence for the final report or commit body.
- Re-run interface or architecture drills if the fix changed boundaries.
- Do not broaden into cleanup while `Blocking` or `Important` findings are open.
- Require integrated re-review before closeout.

## Batch vs Pointwise Decision

This step operates on the complete finding batch emitted by `do-it-review-loop` § Standard, "Emit findings as a complete batch" — if the reviewer is still streaming findings, wait. The two contracts are paired by design; editing one without the other re-introduces "see-one-fix-one" churn.

Findings often share a root cause — the same missing helper, the same forgotten validation, the same architectural mismatch surfaces in 3-5 places. Fixing them one-by-one means "fix one, another appears, fix that, another appears" — wasted re-review rounds and partial fixes that miss the real cause.

**The default fix-loop posture is "collect, root-cause, then fix"**, not "see one, fix one".

Open the fix-loop with a written decision record covering every finding in the list:

```
Findings collected: <N>
Shared-root clusters:
- Cluster A (findings #1, #3, #5): root cause = <one sentence>; fix = <one root-cause repair>
- Cluster B (finding #4): independent; fix = <pointwise repair>
- Cluster C (findings #2, #6): root cause = <one sentence>; fix = <one root-cause repair>
Decision: 2 root-cause repairs + 1 pointwise = 3 atomic edits, one re-review.
```

Heuristics for spotting shared root:

- Same file, same function, same helper missing → cluster.
- Different files but same anti-pattern (e.g. "every caller of X forgot to validate Y") → cluster; fix the contract at X.
- Same cause class returned by reviewer (e.g. multiple `synthetic proof`) → cluster; check whether the test scaffold itself is the cause.
- Independent symptom on unrelated surface → pointwise.

When the cluster is large (≥ 3 findings) the root-cause repair often replaces a helper, tightens a type, or adjusts a single contract — not editing each caller in turn. If after writing the cluster down it is still unclear whether the cause is shared, ask grill or the reviewer for one more pass on cause classification before editing.

Once the decision is written, do not silently flip mid-fix from batch to pointwise (or vice versa) — that is a sign the cause classification was wrong; re-do the decision record.

## Feedback Handling

- Human feedback is authoritative on desired scope, but still verify technical details.
- External or subagent feedback is a claim to check.
- Do not respond with performative agreement; act or give technical pushback.
- If a suggested fix would add unused surface, ask whether to remove or defer it.
- If a confirmed Blocking or Important finding is fixable inside the assigned
  scope, fix it now after root-cause analysis. Do not silently defer it to a
  later version. Deferral requires explicit user confirmation or a clearly
  unassigned boundary, and the closeout must name that reason.

## Prevention Requirement

Every Blocking or Important fix must name how the same root cause will be
caught earlier next time. Use one of:

- new or tightened regression test;
- stronger failure-mode forecast or path-map requirement;
- dispatch prompt checklist;
- review checklist item;
- verification-gate command or parity check;
- explicit follow-up issue when prevention cannot fit this slice.

Do not mark a fix closed with only "changed code" evidence when no prevention
hook exists.

## Stop Conditions

Stop and return `STILL_OPEN` or `NEEDS_CONTEXT` when:

- a finding cannot be reproduced or refuted from current files;
- the requested fix conflicts with another accepted finding or user constraint;
- the fix would cross an interface, persistence, security, or release boundary
  that was not assigned to this slice;
- the same finding remains after one targeted repair and verification rerun.

## Common Rationalizations

- *"I changed the code the reviewer pointed at."* — Closure needs proof that
  the behavior or contract risk is gone.
- *"This adjacent cleanup will prevent future issues."* — Cleanup waits until
  Blocking and Important findings in the current scope are clear.
- *"The reviewer probably meant this."* — Preserve the finding ID and verify
  the exact claim before editing.
- *"We can leave this for next version."* — Only if the user confirmed the
  deferral or the fix is outside the assigned boundary; otherwise repair the
  root cause now.

## Red Flags

- A finding is marked closed without command, line, or behavior evidence.
- A finding is "closed" by silencing the symptom — a swallowed error, a
  weakened assertion, a skipped or deleted test — instead of repairing the
  cause (see `do-it-router` § Integrity).
- A cluster of related findings is patched one-by-one without a written root-cause decision — symptom of "see one fix one" that the Batch vs Pointwise step is meant to prevent.
- The Batch vs Pointwise decision record is missing or contradicts the actual fix shape (e.g. record says "3 clusters" but the diff edits each finding location independently).
- Prevention is omitted for a Blocking or Important fix.
- A confirmed in-scope issue is moved to follow-up without user confirmation.
- Re-review scope is narrower than the files or contracts changed by the fix.

## Verification

Before calling the loop clean:

- every Blocking and Important finding is `closed`, `downgraded with evidence`,
  `STILL_OPEN`, or `NEEDS_CONTEXT`;
- finding-specific checks pass on the current worktree;
- any Evidence Ledger row touched by the fix is updated with current
  `VERIFIED`, `FAILED`, `NOT_VERIFIED`, `BLOCKED`, or `DEFERRED_BY_USER`
  status instead of being left implicit;
- the same-scope review has been rerun for repaired surfaces;
- residual risks and deferred Opportunities are explicitly named.
- any deferred Blocking or Important item has explicit user confirmation or a
  documented out-of-scope boundary.

## Closure Record

For each fixed finding, record:

- original finding;
- verification that it was real;
- root cause or cause class;
- files changed;
- command or line evidence proving closure;
- ledger row or truth plane affected, when a durable plan exists;
- prevention hook added or explicit follow-up;
- remaining risk or deferred opportunity.

If proof is blocked, mark the item `STILL_OPEN` or `NEEDS_CONTEXT`.
