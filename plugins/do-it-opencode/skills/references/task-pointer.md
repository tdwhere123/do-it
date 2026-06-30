# Task Pointer

`.do-it/runtime/pointer` is a single-line **best-effort hint** holding the active
task slug. It exists to help a fresh turn recover quickly; it is never
authoritative.

## Protocol

| Action | Owner | Shape |
|---|---|---|
| Read | `do-it-planning` when it needs to extend instead of fork a task; `do-it-router` § First Move when an active task exists | `cat .do-it/runtime/pointer` — one line, no trailing newline |
| Write | `do-it-planning` when creating `.do-it/plans/<slug>.md`; `do-it-brainstorm` when creating `.do-it/brainstorm/<slug>.md` | `mkdir -p .do-it/runtime && printf '%s' "<slug>" > .do-it/runtime/pointer` |
| Clear | `do-it-branch-closeout` when the branch is merged, discarded, or otherwise closed | `mkdir -p .do-it/runtime && printf '%s' "<closed>" > .do-it/runtime/pointer` (or `rm` the file) |

## Rules

- Pointer contains the slug only — ASCII-only, no spaces, no timestamps, no
  stage info. Stage and status live inside the artifact's own frontmatter.
- `<closed>` is the sentinel for "no active task" so a new turn knows to ignore
  stale state.
- `.do-it/runtime/` is already gitignored — the pointer is local-only.
- A read consumer MUST verify the referenced
  `.do-it/{brainstorm,grill,plans}/<slug>.md` exists before trusting the
  pointer. The pointer can be stale after a branch switch, a manual deletion, or
  a concurrent session — none of these flip the pointer, so the artifact-existence
  check is the real source of truth.
- Concurrent writes to the pointer file are not coordinated; one-line slug writes
  fit within the OS atomic-write window, but if two skills race, the loser's slug
  simply gets overwritten. The verify-by-artifact rule above is what keeps this
  safe.
- Never write a pointer that does not match an existing
  `.do-it/{brainstorm,grill,plans}/<slug>.md` file.
