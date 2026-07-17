---
name: do-it-verify
description: "Use before any done, fixed, passing, ready, install, or merge claim, and when closing a branch — fresh evidence on this worktree; hooks vary by host, this skill is the checklist."
---

# Do-It Verify

Evidence before status. This skill is the universal checklist; host hooks may block, remind, or be unavailable. Never let a hook substitute for claim-specific proof.

Leading words: **fresh evidence**, **this worktree**, **claim**.

## Before Any Done Claim

1. Name the claim (`tests pass`, `bug fixed`, `review clean`, `ready to merge`, …).
2. Choose the command or inspection that proves it on **this** branch/worktree.
3. Run it fresh (or `NOT_VERIFIED` with why).
4. Compare output to the claim.
5. Report the exact result — not optimism.

Old CI, worker summaries, and memory are context, not closeout proof. Prefer checks that hit the changed surface.

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

If verification fails: do not soften wording → capture → debug/fix → re-verify. If blocked: `NOT_VERIFIED` + missing command — never claim `done` / `ready` / `fixed` for that surface.

## Output

Claim; branch/worktree; evidence command; `VERIFIED` / `FAILED` / `NOT_VERIFIED`; remains; residual risk; next action.
