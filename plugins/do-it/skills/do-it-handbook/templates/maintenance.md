# Documentation Maintenance

When and how to update each handbook file.

## Directory Roles

- `.do-it/handbook/` — maintained handbook (this directory).
- `.do-it/CONTEXT.md` — per-session active sediment; owned by
  `do-it-context`.
- `.do-it/grill/<task>.md` — per-task grill log.
- `.do-it/plans/<task>.md` — per-task plan card.
- `.do-it/brainstorm/<task>.md` — per-task multi-persona brainstorm.
- `.do-it/review/<task>.md` — per-task review-loop findings (when
  used).
- Project root `README.md`, `CLAUDE.md` (or equivalent) — entry
  points; delegate detail to the handbook.

## Update Rules

When implementation changes:

- Update `code-map.md` "Current implementation locations" if files,
  packages, routes, repos, migrations, or service ownership changed.
  This is normally written by the `code-mapper` agent.
- Update `runtime-status.md` if wiring, readiness, or known gaps
  changed.
- Update `backlog.md` only for unresolved cross-cutting issues with a
  close condition. Per-task acceptance criteria belong in the task
  card.

When dependencies or readiness gates change:

- Update `Prerequisite`, `Blocks`, `Depends` in the affected task
  cards.
- Update `runtime-status.md` status labels.

When contracts change:

- Update schema snippets (architecture or interface docs).
- Update enum values in `glossary.md` if any.
- Update acceptance criteria and test expectations in the affected
  task cards.
- Update downstream consumer assumptions and search the codebase for
  callers.

When a term stabilizes:

- Promote it from `.do-it/CONTEXT.md` to `glossary.md` after the
  three-session rule (see `do-it-handbook` SKILL).

When an invariant changes:

- Open a task card. Cite the invariant number.
- After landing, sweep the codebase for contradictions. File backlog
  issues for any you cannot fix in the same change.

## Large File Rule

Do not create new handbook files larger than ~30 KB if they are read
on routine agent work. Split lookup-heavy content into smaller pages.
The agent's context budget is the constraint, not disk.

## Drift Sweep

After doc edits, run targeted sweeps for changed symbols, events,
dependencies, and readiness labels. Project-specific examples:

```bash
rg -n "<changed symbol>" docs .do-it/handbook
rg -n "schema-ready|implementation-ready|live-event-ready" \
   docs .do-it/handbook
find .do-it/handbook docs -type f -name '*.md' -size +30k -print
```

If a sweep surfaces a contradiction, fix it in the same change or
open a backlog issue with a close condition.
