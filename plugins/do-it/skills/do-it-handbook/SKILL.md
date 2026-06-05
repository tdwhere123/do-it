---
name: do-it-handbook
description: "Use when a project needs a durable `.do-it/handbook/` skeleton for architecture, invariants, glossary, code map, backlog, and runtime status."
---

# Do-It Handbook

## Purpose

Use this to scaffold a long-lived handbook for a project that uses `do-it`. The handbook is the agent-readable source of truth for terms, invariants, ownership, and architecture that does not change every turn. It complements the per-task artifacts (`.do-it/grill/`, `.do-it/plans/`, `.do-it/brainstorm/`) and the always-active sediment (`.do-it/CONTEXT.md`).

The shape is borrowed from a project that has shipped against it for a year (Do-SOUL Alaya). Files are intentionally small (< 30 KB each) so the agent can read whatever it needs without bloating context.

## When To Use

- The user explicitly asks to bootstrap a handbook (`/do-it-handbook init`, "建 handbook", "set up the handbook").
- The project is starting to grow beyond a single CLAUDE.md and the team is rediscovering the same terms each turn.
- A new contributor (human or agent) keeps asking what counts as a `Blocking` finding, or where the architecture invariants live.

Skip when:

- A `docs/handbook/` (or equivalent) already exists. Do not duplicate.
- The project is a one-shot script with no team beyond a single user.

## File Layout

```
.do-it/handbook/
  README.md                   # navigation hub
  invariants.md               # rules that always win
  architecture.md             # stable system shape
  code-map.md                 # current implementation locations (maintained by code-mapper)
  glossary.md                 # vocabulary (long-stable terms)
  backlog.md                  # cross-cutting unresolved issues with close conditions
  runtime-status.md           # implementation status and known wiring gaps
```

The handbook holds only **project-specific truth** — the facts a generic skill
cannot carry. Process docs (task-card layout, review protocol, subagent
dispatch, execution pipeline, maintenance rules) are NOT scaffolded here: the
owning skills are their single source of truth (`do-it-planning`,
`do-it-review-loop`, `do-it-subagent-orchestration`, `do-it-router`, and the
`## Maintenance` section below). This keeps the handbook small and removes the
duplicate-doc drift that comes from copying skill prose into every project.

## Bootstrap Behavior

When invoked:

1. Check whether `.do-it/handbook/` exists.
   - If it does **and** every file from the template list is present, report `handbook is current` and stop.
   - If it does **and** some files are missing, copy only the missing files (additive, never overwrite).
   - If it does not exist, create the full tree.
2. Templates are copied verbatim from `templates/` under this skill. Each template is a skeleton with placeholder text the project owner replaces; do not hand-edit the project's handbook from inside the bootstrap step.
3. Add a `.gitkeep` to `.do-it/brainstorm/`, `.do-it/grill/`, and `.do-it/plans/` if any of those directories are missing, so the project tracks them in version control.
4. Print one line per file written, then a one-paragraph "next steps" pointer telling the user to start by filling in `invariants.md` and `glossary.md`.

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
| code-mapper agent | summary returned to parent | writes `code-map.md` "Current implementation locations" section |

`do-it-planning` owns the task-card layout itself, `do-it-review-loop` owns the
review protocol, and `do-it-subagent-orchestration` owns the dispatch contract —
none of them read a handbook copy. The handbook only feeds them project-specific
truth (`invariants.md`, `glossary.md`, `architecture.md`).

The handbook is read-mostly. The only file that gets written by an agent on a regular basis is `code-map.md`, and only by `code-mapper` per the contract in its agent definition.

## Term Promotion Rule (`.do-it/CONTEXT.md` ↔ `glossary.md`)

To prevent drift between the active sediment and the stable glossary:

- A new term enters `.do-it/CONTEXT.md` (the per-session sediment owned by `do-it-context`).
- After it has been stable for **three** independent sessions (i.e., the same definition has held without revision in three different grill or planning artifacts), it is promoted to `glossary.md`.
- After promotion, remove the entry from `.do-it/CONTEXT.md` to avoid two homes for the same term.
- A term that gets revised after promotion comes back to `.do-it/CONTEXT.md` and re-runs the three-session check.

This rule is enforced by the agent during `do-it-context` writes, not by tooling. Stating it once here keeps both files honest.

## Maintenance

When and how to update each handbook file. The per-session sediment
(`.do-it/CONTEXT.md`) and per-task artifacts (`.do-it/grill/`, `.do-it/plans/`,
`.do-it/review/`) live outside the handbook; the project root `README.md` /
`CLAUDE.md` are entry points that delegate detail here.

Update triggers:

- **Implementation moved** → update `code-map.md` "Current implementation
  locations" (normally the `code-mapper` agent) and `runtime-status.md` if
  wiring, readiness, or known gaps changed.
- **Cross-cutting issue opened/closed** → `backlog.md` with a close condition;
  per-task acceptance belongs in the plan card, not here.
- **Contract changed** → schema snippets in `architecture.md`, enum values in
  `glossary.md`, and the affected plan cards; then search the codebase for
  callers.
- **Invariant changed** → open a task card citing the invariant number; after
  landing, sweep for contradictions and file backlog issues for any you cannot
  fix in the same change.
- **Term stabilized** → promote `.do-it/CONTEXT.md` → `glossary.md` per the
  three-session rule above.

Keep any single handbook file under ~30 KB (it is read on routine agent work;
context budget is the constraint, not disk). After doc edits, sweep for changed
symbols and readiness labels, e.g. `rg -n "<changed symbol>" docs .do-it/handbook`.

## Output

The bootstrap command should produce a short, deterministic report:

```
[do-it-handbook] writing 7 file(s) to .do-it/handbook/
  + .do-it/handbook/README.md
  + .do-it/handbook/invariants.md
  + .do-it/handbook/architecture.md
  + .do-it/handbook/code-map.md
  + .do-it/handbook/glossary.md
  + .do-it/handbook/backlog.md
  + .do-it/handbook/runtime-status.md

next: fill in invariants.md and glossary.md before running grill on any non-trivial task.
```

Idempotent re-runs print only the files actually written; an empty list means the handbook is current.

## Common Mistakes

- Treating the bootstrap as a one-time action and never refreshing the templates against do-it upstream. When `do-it` ships a new template (e.g. a new truth file), the bootstrap should be re-runnable to add it.
- Copying the templates and then immediately auto-filling them from the codebase. The placeholders are intentional — they prompt the human owner to make the call.
- Letting `code-map.md` drift. The `code-mapper` agent owns its update; if your project is using do-it without code-mapper running periodically, the handbook copy will rot.
- Promoting every term from `.do-it/CONTEXT.md` to `glossary.md` as soon as it appears. The three-session rule exists because most session terms do not survive review.

## Related Skills

- `do-it-context` — owns active sediment; promotes terms to `glossary.md`.
- `do-it-architecture-scan` — reads `architecture.md` and `invariants.md`.
- `do-it-grill` — reads `invariants.md` and `glossary.md` for term anchoring.
- `do-it-planning` / `do-it-review-loop` / `do-it-subagent-orchestration` — own their task-card layout / review protocol / dispatch contract directly; the handbook no longer carries a copy.
