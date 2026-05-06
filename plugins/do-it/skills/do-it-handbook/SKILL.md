---
name: do-it-handbook
description: "Use when a project needs a durable `.do-it/handbook/` skeleton for architecture, glossary, code map, backlog, runtime, maintenance, and workflow docs."
---

# Do-It Handbook

## Purpose

Use this to scaffold a long-lived handbook for a project that uses `do-it`. The handbook is the agent-readable source of truth for terms, invariants, ownership, and review discipline that does not change every turn. It complements the per-task artifacts (`.do-it/grill/`, `.do-it/plans/`, `.do-it/brainstorm/`) and the always-active sediment (`.do-it/CONTEXT.md`).

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
  maintenance.md              # documentation update rules
  task-card-template.md       # template for non-trivial work briefs
  workflow/
    agent-workflow.md         # per-card / per-wave / phase pipelines
    review-protocol.md        # review mode, severity, evidence expectations
    subagent-dispatch.md      # how delegated workers are constrained
```

## Bootstrap Behavior

When invoked:

1. Check whether `.do-it/handbook/` exists.
   - If it does **and** every file from the template list is present, report `handbook is current` and stop.
   - If it does **and** some files are missing, copy only the missing files (additive, never overwrite).
   - If it does not exist, create the full tree.
2. Templates are copied verbatim from `templates/` under this skill. Each template is a skeleton with placeholder text the project owner replaces; do not hand-edit the project's handbook from inside the bootstrap step.
3. Add a `.gitkeep` to `.do-it/brainstorm/`, `.do-it/grill/`, `.do-it/plans/`, and `.do-it/handbook/workflow/` if any of those directories are missing, so the project tracks them in version control.
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
| `do-it-planning` | `.do-it/plans/<task>.md` | `task-card-template.md` |
| `do-it-review-loop` | `.do-it/review/<task>.md` | `workflow/review-protocol.md`, `invariants.md` |
| `do-it-subagent-orchestration` | the dispatch contract | `workflow/subagent-dispatch.md` |
| code-mapper agent | summary returned to parent | writes `code-map.md` "Current implementation locations" section |

The handbook is read-mostly. The only file that gets written by an agent on a regular basis is `code-map.md`, and only by `code-mapper` per the contract in its agent definition.

## Term Promotion Rule (`.do-it/CONTEXT.md` ↔ `glossary.md`)

To prevent drift between the active sediment and the stable glossary:

- A new term enters `.do-it/CONTEXT.md` (the per-session sediment owned by `do-it-context`).
- After it has been stable for **three** independent sessions (i.e., the same definition has held without revision in three different grill or planning artifacts), it is promoted to `glossary.md`.
- After promotion, remove the entry from `.do-it/CONTEXT.md` to avoid two homes for the same term.
- A term that gets revised after promotion comes back to `.do-it/CONTEXT.md` and re-runs the three-session check.

This rule is enforced by the agent during `do-it-context` writes, not by tooling. Stating it once here keeps both files honest.

## Output

The bootstrap command should produce a short, deterministic report:

```
[do-it-handbook] writing 12 file(s) to .do-it/handbook/
  + .do-it/handbook/README.md
  + .do-it/handbook/invariants.md
  + .do-it/handbook/architecture.md
  + .do-it/handbook/code-map.md
  + .do-it/handbook/glossary.md
  + .do-it/handbook/backlog.md
  + .do-it/handbook/runtime-status.md
  + .do-it/handbook/maintenance.md
  + .do-it/handbook/task-card-template.md
  + .do-it/handbook/workflow/agent-workflow.md
  + .do-it/handbook/workflow/review-protocol.md
  + .do-it/handbook/workflow/subagent-dispatch.md

next: fill in invariants.md and glossary.md before running grill on any non-trivial task.
```

Idempotent re-runs print only the files actually written; an empty list means the handbook is current.

## Common Mistakes

- Treating the bootstrap as a one-time action and never refreshing the templates against do-it upstream. When `do-it` ships a new template (e.g. a new workflow file), the bootstrap should be re-runnable to add it.
- Copying the templates and then immediately auto-filling them from the codebase. The placeholders are intentional — they prompt the human owner to make the call.
- Letting `code-map.md` drift. The `code-mapper` agent owns its update; if your project is using do-it without code-mapper running periodically, the handbook copy will rot.
- Promoting every term from `.do-it/CONTEXT.md` to `glossary.md` as soon as it appears. The three-session rule exists because most session terms do not survive review.

## Related Skills

- `do-it-context` — owns active sediment; promotes terms to `glossary.md`.
- `do-it-architecture-scan` — reads `architecture.md` and `invariants.md`.
- `do-it-planning` — reads `task-card-template.md` shape.
- `do-it-review-loop` — reads `workflow/review-protocol.md`.
- `do-it-subagent-orchestration` — `workflow/subagent-dispatch.md` is the narrative form of its dispatch contract.
