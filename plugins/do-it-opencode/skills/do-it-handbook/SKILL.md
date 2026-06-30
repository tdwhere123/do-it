---
name: do-it-handbook
description: "Use when a project needs a lean `.do-it/handbook/` for stable project truth plus `.do-it/worklog/` for daily or goal notes."
---

# Do-It Handbook

## Purpose

Use this to scaffold a small project handbook for truth that should survive many
sessions: invariants, stable architecture shape, and glossary terms. Everything
that changes daily or per-goal goes to `.do-it/worklog/` instead of the
handbook.

The point is low context load. Code locations are rediscovered with `rg` or a
temporary `code-mapper` dispatch; they are not maintained in a persistent
`code-map.md`.

## When To Use

- The user explicitly asks to bootstrap a handbook (`/do-it-handbook init`, "建 handbook", "set up the handbook").
- The project is starting to grow beyond a single CLAUDE.md and the team is rediscovering the same terms each turn.
- A new contributor (human or agent) keeps asking what counts as a `Blocking` finding, or where the architecture invariants live.
- The router selects Standard or Heavy for a code-touching turn and neither `.do-it/handbook/` nor `.do-it/CONTEXT.md` exists yet — this is the automatic bootstrap trigger.

Skip when:

- A `docs/handbook/` (or equivalent) already exists. Do not duplicate.
- The project is a one-shot script with no team beyond a single user.

## File Layout

```
.do-it/handbook/
  README.md                   # navigation hub
  invariants.md               # rules that always win
  architecture.md             # stable system shape
  glossary.md                 # vocabulary (long-stable terms)
  worklog-template.md         # template copied into .do-it/worklog/
.do-it/worklog/
  .gitkeep
```

The handbook holds only **project-specific truth** — the facts a generic skill
cannot carry. Process docs (task-card layout, review protocol, subagent
dispatch, execution pipeline, maintenance rules), code maps, runtime status, and
backlog queues are NOT scaffolded here. Per-task or per-day detail belongs in
`.do-it/worklog/YYYY-MM-DD.md`, `.do-it/worklog/<goal>.md`, plans, or review
artifacts.

## Bootstrap Behavior

When invoked (explicit command, `/do-it-handbook`, or automatic router trigger):

1. Check whether `.do-it/handbook/` exists.
   - If it does **and** every file from the template list is present, report `handbook is current` and stop.
   - If it does **and** some files are missing, copy only the missing files (additive, never overwrite).
   - If it does not exist, create the full tree.
2. Templates are copied verbatim from `templates/` under this skill. Each template is a skeleton with placeholder text the project owner replaces; do not hand-edit the project's handbook from inside the bootstrap step.
3. Add a `.gitkeep` to `.do-it/brainstorm/`, `.do-it/grill/`, `.do-it/plans/`,
   and `.do-it/worklog/` if any of those directories are missing, so the project
   tracks them in version control.
4. Print one line per file written, then a one-paragraph "next steps" pointer telling the user to start by filling in `invariants.md` and `glossary.md`.

The bootstrap must actually write files, not merely suggest that the user create them. The placeholders are intentional — they prompt the human owner to make the call in a later turn.

Do **not**:

- run `git add` or `git commit` automatically;
- overwrite an existing handbook file (additive only);
- attempt to discover the project's architecture and back-fill the templates with project-specific content. That is a separate, larger pass; the bootstrap leaves placeholders.

## Relationship To Other Skills

| | Owns | Reads from handbook |
|---|---|---|
| `do-it-context` | `.do-it/CONTEXT.md` (active sediment) | `glossary.md` (long-stable terms) |
| `do-it-architecture-scan` | inline review output | `architecture.md`, `invariants.md` |
| `do-it-grill` | `.do-it/grill/<task>.md` | `invariants.md`, `glossary.md` |
| `do-it-review-loop` | `.do-it/review/<task>.md` | `invariants.md` |

`do-it-planning` owns the task-card layout itself, `do-it-review-loop` owns the
review protocol, and `do-it-subagent-orchestration` owns the dispatch contract —
none of them read a handbook copy. The handbook only feeds them project-specific
truth (`invariants.md`, `glossary.md`, `architecture.md`).

The handbook is read-mostly. Routine progress, experiments, lessons, and
day-level status go to worklogs; promote only stable facts back into the
handbook.

## Term Promotion Rule (`.do-it/CONTEXT.md` ↔ `glossary.md`)

To prevent drift between the active sediment and the stable glossary:

- A new term enters `.do-it/CONTEXT.md` (the per-session sediment owned by `do-it-context`).
- After it has been stable for **three** independent sessions (i.e., the same definition has held without revision in three different grill or planning artifacts), it is promoted to `glossary.md`.
- After promotion, remove the entry from `.do-it/CONTEXT.md` to avoid two homes for the same term.
- A term that gets revised after promotion comes back to `.do-it/CONTEXT.md` and re-runs the three-session check.

This rule is enforced by the agent during `do-it-context` writes, not by tooling. Stating it once here keeps both files honest.

## Maintenance

When and how to update each handbook or worklog file. The per-session sediment
(`.do-it/CONTEXT.md`) and per-task artifacts (`.do-it/grill/`, `.do-it/plans/`,
`.do-it/review/`) live outside the handbook.

Update triggers:

- **Implementation moved** → do not update a persistent code map. Use `rg` or a
  temporary `code-mapper` dispatch in the next task, then record only durable
  lessons in the worklog or handbook.
- **Cross-cutting issue opened/closed** → record the current state in the
  relevant plan/review artifact or worklog. Promote to handbook only if it
  becomes an invariant.
- **Contract changed** → schema snippets in `architecture.md`, enum values in
  `glossary.md`, and the affected plan cards; then search the codebase for
  callers.
- **Invariant changed** → open a task card citing the invariant number; after
  landing, sweep for contradictions and file backlog issues for any you cannot
  fix in the same change.
- **Term stabilized** → promote `.do-it/CONTEXT.md` → `glossary.md` per the
  three-session rule above.

Keep any single handbook file under ~15 KB. Worklogs may be archived by day or
goal; do not require routine agents to read old worklogs unless the active
task points at one.

## Output

The bootstrap command should produce a short, deterministic report:

```
[do-it-handbook] writing 4 file(s) to .do-it/handbook/ and 1 template to .do-it/worklog/
  + .do-it/handbook/README.md
  + .do-it/handbook/invariants.md
  + .do-it/handbook/architecture.md
  + .do-it/handbook/glossary.md
  + .do-it/handbook/worklog-template.md
  + .do-it/worklog/.gitkeep

next: fill in invariants.md and glossary.md, then use .do-it/worklog/YYYY-MM-DD.md for daily progress.
```

Idempotent re-runs print only the files actually written; an empty list means the handbook is current.

## Common Mistakes

- Treating the bootstrap as a one-time action and never refreshing the templates against do-it upstream. When `do-it` ships a new template (e.g. a new truth file), the bootstrap should be re-runnable to add it.
- Copying the templates and then immediately auto-filling them from the codebase. The placeholders are intentional — they prompt the human owner to make the call.
- Recreating a persistent code map. Code locations are cheap to rediscover and
  expensive to keep current.
- Promoting every term from `.do-it/CONTEXT.md` to `glossary.md` as soon as it appears. The three-session rule exists because most session terms do not survive review.

## Related Skills

- `do-it-context` — owns active sediment; promotes terms to `glossary.md`.
- `do-it-architecture-scan` — reads `architecture.md` and `invariants.md`.
- `do-it-grill` — reads `invariants.md` and `glossary.md` for term anchoring.
- `do-it-planning` / `do-it-review-loop` / `do-it-subagent-orchestration` — own their task-card layout / review protocol / dispatch contract directly; the handbook no longer carries a copy.
