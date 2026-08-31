# Task Pointer

v2 runtime truth is `.do-it/runtime/active-task`: one repo-relative Task
Contract path. `.do-it/runtime/pointer` is a leftover one-line slug file from
older builds. Do not create or refresh `pointer` on new work. If an old
`pointer` exists, treat it only as a best-effort hint toward
`.do-it/plans/<slug>.md`. It is never authoritative.

Do not create `.do-it/brainstorm/` or `.do-it/grill/` trees. Those names are
retired; they are not a source of truth.

## Protocol

| Action | Owner | Shape |
|---|---|---|
| Read | `do-it-decide` when it needs to extend instead of fork a task; `do-it-router` § First Move when an active task exists | `cat .do-it/runtime/active-task` — one repo-relative path. If that file is missing, `cat .do-it/runtime/pointer` is a compatibility hint only |
| Write | `do-it-decide` when creating a Task Contract under `.do-it/plans/` | write `.do-it/runtime/active-task` (repo-relative path). Do not write `pointer` |
| Clear | `do-it-verify` when the branch is merged, discarded, or otherwise closed | clear `.do-it/runtime/active-task` and any leftover `pointer` |

## Rules

- `active-task` holds a repo-relative Task Contract path, not a bare slug.
- An old `pointer` contains the slug only — ASCII-only, no spaces, no
  timestamps, no stage info. Stage and status live inside the artifact.
- `.do-it/runtime/` is already gitignored — both files are local-only.
- A read consumer MUST verify the referenced `.do-it/plans/<slug>.md` (or the
  `active-task` path) exists before trusting it. Neither file is flipped on a
  branch switch, a manual deletion, or a concurrent session — the
  artifact-existence check is the real source of truth.
- Never treat `.do-it/brainstorm/<slug>.md` or `.do-it/grill/<slug>.md` as the
  contract, even when an old pointer names that slug.
- Concurrent writes are not coordinated; last writer wins. The
  verify-by-artifact rule above is what keeps this safe.
- Never write `active-task` (or a leftover pointer) that does not match an
  existing `.do-it/plans/` Task Contract.
