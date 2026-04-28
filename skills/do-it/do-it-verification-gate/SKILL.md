---
name: do-it-verification-gate
description: Use when you are about to claim do-it work is complete, fixed, passing, ready to merge, ready to install, or otherwise verified.
---

# Do-It Verification Gate

## Purpose

Use this before any completion claim. Evidence comes before status.

## Tiers

### Light

Use for tiny edits with one obvious check: grep, formatter, targeted test,
typecheck, or local diff review.

### Standard

Use for normal work and subagent closeout. Subagents verify their own slice, but
the parent independently verifies any integrated claim.

1. Identify the claim.
2. Choose the command or inspection that proves it on the current branch/worktree.
3. Run the full targeted check fresh, or state why it cannot run.
4. Read output and exit code.
5. Compare evidence to the claim and acceptance surface.
6. Report exact result, not optimism.

### Heavy

Use for wave, phase, gate, release, install, branch closeout, or broad
integration claims. Heavy is parent-only unless explicitly assigned.

- Verify narrow slice checks first.
- Verify integrated behavior after merging slices on the final branch/worktree, not only in worker lanes.
- Include review/fix-loop status, not just tests.
- Confirm docs, manifest, install, or branch state only from current files and commands.
- Record skipped checks and residual risk plainly.

## Claim Matrix

- `tests pass`: requires fresh test output and exit code.
- `bug fixed`: requires original symptom or regression check now passes.
- `requirements met`: requires checklist against the task or acceptance surface.
- `review clean`: requires no unresolved `Blocking` or `Important` findings.
- `ready to merge`: requires verification, review, clean intended diff, and commit policy check.
- `ready to install`: requires package/install/doctor checks relevant to the changed surface.
- `fixture-ready`: requires fixture-level behavior proof and no live/operator-ready wording.
- `live-event-ready`: requires producer -> transport/client -> consumer proof on real wiring.
- `operator-ready`: requires a discoverable user action and visible feedback proof.
- `workflow synced`: requires source/live parity plus install or doctor evidence.

## Failure Handling

If verification fails:

- do not soften the status;
- capture the failure;
- route to `do-it-debugging` when cause is unclear;
- route to `do-it-fix-loop` when a known finding remains;
- rerun the gate after the repair.

If verification is blocked, skipped, or cannot run:

- mark the claim `NOT_VERIFIED`;
- record the exact blocked or skipped command or inspection;
- do not use `complete`, `fixed`, `passing`, `ready to merge`, `ready to install`,
  or `review clean` wording for the unverified claim;
- state the next action needed to make the claim verifiable.

## Output Shape

- Claim checked.
- Branch/worktree/ref checked.
- Evidence command or inspection.
- Result: `VERIFIED`, `FAILED`, or `NOT_VERIFIED`.
- What remains unverified.
- Review/fix-loop and prevention status when relevant.
- Next action if not clean.
