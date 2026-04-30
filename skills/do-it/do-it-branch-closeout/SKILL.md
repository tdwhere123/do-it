---
name: do-it-branch-closeout
description: "Problem: branches get merged with uncited verification gaps, half-finished refactors, or missing rollback notes; the cost surfaces after merge. Fix: close the branch only when scope, evidence, and integration steps are all named in writing — before the merge call."
---

# Do-It Branch Closeout

## Purpose

Use this after implementation and review are complete enough to decide what
happens to the branch or worktree.

## Tiers

### Light

Use for a local no-commit closeout or tiny docs/config branch. Verify the
changed files and report the state.

### Standard

Use for ordinary task branches.

1. Run `do-it-verification-gate` for the delivery claim.
2. Check review/fix-loop status.
3. Inspect intended diff and exclude unrelated edits.
4. Re-read local commit, merge, PR, and install instructions that apply.
5. If committing, create only the scoped commit with required evidence.
6. Offer or execute the requested closeout path.

Subagents do not commit, merge, push, install, or delete branches by default.

### Heavy

Use for wave, phase, release/gate, install-affecting changes, multi-commit
history, integration worktrees, or cleanup of several lanes. Heavy is
parent-only unless explicitly assigned.

- Audit the full delivered surface, not only the last commit.
- Confirm commit bodies preserve required cause/fix/verify/review evidence.
- Re-run integration verification after merges.
- Keep unrelated concurrent edits out of commits and cleanup.
- Clean up worktrees and branches only after merge/PR/discard policy is explicit.

## Closeout Options

When the user has not already chosen a path, present concise options:

1. merge locally;
2. push/create PR;
3. keep branch/worktree as-is;
4. discard task-owned work.

Discard requires explicit confirmation and must name what will be deleted.

## Install-Adjacent Checks

If the branch touches skills, manifests, package metadata, install scripts, or
published workflow files, verify the relevant installer/doctor/packaging surface
before saying it is ready. If those paths are outside current write ownership,
do not edit them; report the needed follow-up.

## Final Record

Report:

- branch/worktree state;
- commits created or intentionally not created;
- verification and review evidence;
- cleanup performed or intentionally skipped;
- residual risks.
