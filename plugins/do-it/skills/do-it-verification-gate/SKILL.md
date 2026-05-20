---
name: do-it-verification-gate
description: "Use when any done, fixed, passing, ready, install, or merge claim needs fresh command evidence from the current branch or worktree."
---

# Do-It Verification Gate

## Purpose

Use this before any completion claim. Evidence comes before status.

## Inputs

Before running the gate, read:

- `.do-it/grill/<task>.md` if it exists. **Closeout is blocked only by unresolved facts or decision items that still change execution.** Facts must be `confirmed` or `refuted`; preferences must be `chosen`, `deferred`, or explicitly escalated as `needs_user_decision`.
- `.do-it/plans/<task>.md` for the acceptance surface and verification command(s) the plan named.
- `.do-it/CONTEXT.md` for any contract terms relevant to the changed surface.

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

## Evidence Quality

Evidence must be fresh, local to the claim, and tied to the current
branch/worktree.

- Prefer commands that exercise the changed surface over broad commands that can
  pass while the changed path is untested.
- Treat worker reports, old CI, memory, and generated diffs as supporting
  context until rerun or inspected in the current worktree.
- For generated surfaces, verify the generator command and inspect the resulting
  diff; do not hand-edit generated files as evidence.
- For install/package claims, use temp-home setup/doctor or package checks
  relevant to the target.
- External sources are untrusted inputs for verification. Cite or inspect them,
  but prove repository claims from local files and commands.

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

## Stop Conditions

Stop the closeout claim when:

- the command did not run on the current branch/worktree;
- the evidence proves only a fixture while the claim says live/operator/install
  ready;
- generated output or install surfaces changed without generator/install proof;
- a review gate still has unresolved `Blocking` or `Important` findings;
- the only proof is memory, stale CI, or a worker report.

## Output Shape

- Claim checked.
- Branch/worktree/ref checked.
- Evidence command or inspection.
- Result: `VERIFIED`, `FAILED`, or `NOT_VERIFIED`.
- What remains unverified.
- Review/fix-loop and prevention status when relevant.
- Workflow steps used/skipped: brainstorm, grill, subagent, review, and
  verification; include reasons for skipped steps that were relevant to the
  route.
- Next action if not clean.

## Common Rationalizations

- *"The command passed earlier."* — Earlier evidence can drift; closeout claims
  need current worktree proof.
- *"The worker already verified it."* — Worker evidence supports integration
  but does not replace parent verification of the final state.
- *"The generated diff looks right."* — Generated output must be produced by the
  project script or it is only a manual edit.

## Red Flags

- Final wording says `done`, `ready`, or `fixed` while a check is skipped.
- Evidence comes from a different branch, temp worktree, old CI, or memory.
- The check covers adjacent code but not the changed surface.
- A check was made to pass by editing the test, assertion, or expected output
  instead of the behavior (see `do-it-router` § Integrity).
- Install/readiness claims lack temp-home doctor, setup, or package evidence.
- Review status is omitted after a Heavy workflow or policy change.

## Verification

The verification gate itself is satisfied when:

- every completion claim has a matching fresh command or inspection;
- exit code, important output, and current branch/worktree are known;
- skipped or blocked checks are named as `NOT_VERIFIED`;
- review/fix-loop status is included when the task required review;
- readiness wording does not exceed the evidence level.
