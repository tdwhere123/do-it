---
name: do-it-verify
description: "Use before any done, fixed, passing, ready, install, or merge claim, and when closing a branch — fresh evidence on this worktree; hooks vary by host, this skill is the checklist."
---

# Do-It Verify

Evidence before status. This skill is the universal checklist; host hooks may block, remind, or be unavailable. Never let a hook substitute for claim-specific proof.

Leading words: **fresh evidence**, **this worktree**, **claim**.

## Before Any Done Claim

The proof-before-claim rule is `core §r-verify`; the claim→evidence shortcut
table below carries the claim-specific value. Old CI, worker summaries, and
memory are context, not closeout proof. Prefer checks that hit the changed
surface.

## Claim Shortcuts

| Claim | Needs |
| --- | --- |
| `tests pass` | Fresh test output + exit code |
| `bug fixed` | Original symptom or regression now green |
| `review clean` | No unresolved Blocking/Important on both axes |
| `ready to merge` | Verify + review + intended diff + commit policy |
| `ready to install` | Package/doctor/setup evidence for the changed surface |
| `runs in production` | Production-side evidence (health check, metric, log) — local test output alone is not proof |

## Branch Closeout

When closing a branch, PR, merge, or cleanup:

- Verification evidence for the delivery claim
- Review / fix status
- Intended diff only
- Deferred-marker sweep: grep the project's convention (e.g. `TODO(@owner)`) and surface leftovers in the claim
- Rollback note for merge/release/install changes
- Explicit path: merge / PR / keep / discard (discard needs confirmation)
- Clear `.do-it/runtime/pointer` when merged or discarded

Subagents do not commit, merge, push, or delete branches by default.

## Failure

`core §r-verify` + `core §r-recovery`: capture → debug/fix → re-verify, never
softening wording; a blocked claim is `NOT_VERIFIED` plus the missing command.
Unresolved ambiguity follows `core §r-uncertainty`.

## Output

Claim; branch/worktree; evidence command; `VERIFIED` / `FAILED` / `NOT_VERIFIED`; remains; residual risk; next action.
