---
name: do-it-verify
description: "Use before any done, fixed, passing, ready, install, or merge claim, and when closing a branch — map acceptance to fresh evidence on this worktree; hooks vary by host, this skill is the checklist."
---

# Do-It Verify

Evidence before status. This skill is the universal checklist; host hooks may
block, remind, or be unavailable. Never let a hook substitute for
claim-specific proof.

Leading words: **fresh evidence**, **this worktree**, **acceptance map**, **claim**.

## Before Any Done Claim

<!-- do-it-contract:verify.acceptance-map -->
Closeout is an acceptance→evidence map (`core §r-verify`). Observed event ≠
proof. Ledger rows, old CI, worker summaries, and memory are candidates, not
closeout.

If there is no durable contract, extract a minimal acceptance from the user
ask and current Goal; do not stall for a file
([`../references/task-contract.md`](../references/task-contract.md)).

Prefer checks that hit the changed surface after the last edit on this
worktree.

## Cannot Be VERIFIED
<!-- do-it-contract:verify.unverifiable-classes -->

These cannot support `VERIFIED`, even when a command exited 0:

- **stale** — evidence predates the last edit
- **other worktree** — not this worktree / HEAD / fingerprint
- **irrelevant** — green on a different surface than the claim
- **mock-only** — synthetic collaborator chain; live path unproven
- **partial** — some acceptance items unmapped, or the check is incomplete

Honest `NOT_VERIFIED` names the missing proof and the next check.
<!-- do-it-contract:verify.honest-not-verified -->

## Closeout

```text
Claim
Contract / task
Worktree + HEAD/fingerprint if known
Acceptance map:
  A1 → evidence E...
  A2 → NOT_VERIFIED / missing <check>
Review state
Residual risk
Deferred / reinterpreted items
VERIFIED | FAILED | NOT_VERIFIED
```

Overall `VERIFIED` is illegal unless every material acceptance item maps to
fresh, relevant, this-worktree, non-mock-only, non-partial evidence. `FAILED`
means evidence disproves the claim. Missing or incomplete proof is
`NOT_VERIFIED`, not `FAILED`.

For each mapped item, say why that evidence is relevant, that it ran after
the last change, that it is from this worktree, and that it is not mock-only.
Production claims need production-side evidence.

## Claim Shortcuts

| Claim | Needs |
| --- | --- |
| `tests pass` | Fresh test output + exit code on the changed surface |
| `bug fixed` | Original symptom or regression now green |
| `review clean` | No unresolved Blocking/Important on both axes |
| `ready to merge` | Verify + review + intended diff + commit policy |
| `ready to install` | Package/doctor/setup evidence for the changed surface |
| `runs in production` | Production-side evidence (health check, metric, log) — local test output alone is not proof |

Shortcuts do not replace the acceptance map.

## Branch Closeout

When closing a branch, PR, merge, or cleanup:

- Acceptance map for the delivery claim
- Review / fix status
- Intended diff only
- Deferred-marker sweep: grep the project's convention (e.g. `TODO(@owner)`) and surface leftovers in the claim
- Rollback note for merge/release/install changes
- Explicit path: merge / PR / keep / discard (discard needs confirmation)
- Clear `.do-it/runtime/active-task` (and any leftover pointer) when merged or discarded

Subagents do not commit, merge, push, or delete branches by default.

## Failure

Capture → debug/fix → re-verify (`core §r-verify`, `core §r-recovery`); never
soften wording. A blocked claim is `NOT_VERIFIED` plus the missing proof.
Unresolved ambiguity follows `core §r-uncertainty`.

## Output

Claim; contract/task; this worktree + HEAD/fingerprint if known; acceptance
map; review state; `VERIFIED` / `FAILED` / `NOT_VERIFIED`; remains; residual
risk; next action.
