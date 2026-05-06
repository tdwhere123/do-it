# Project Handbook

The handbook is the agent-readable, low-token navigation hub for this
project. It captures the rules, terms, ownership, and review discipline
that hold across sessions. Per-task artifacts live elsewhere
(`.do-it/grill/`, `.do-it/plans/`, `.do-it/brainstorm/`,
`.do-it/CONTEXT.md`).

## Start Here

- `invariants.md` — rules that always win.
- `architecture.md` — stable system shape.
- `workflow/agent-workflow.md` — execution flow for non-trivial work.
- `workflow/review-protocol.md` — review mode and evidence rules.
- `code-map.md` — current implementation locations (maintained by the
  `code-mapper` agent).
- `runtime-status.md` — current implementation status and known gaps.
- `backlog.md` — cross-cutting unresolved issues with explicit close
  conditions.
- `glossary.md` — long-stable vocabulary.
- `task-card-template.md` — template for non-trivial work briefs.
- `maintenance.md` — when and how to update each handbook file.

## Source-Of-Truth Map

| Concern | File |
|---|---|
| Architecture invariants | `invariants.md` |
| Stable system shape | `architecture.md` |
| Current implementation locations | `code-map.md` |
| Implementation status / wiring gaps | `runtime-status.md` |
| Cross-cutting issues | `backlog.md` |
| Vocabulary | `glossary.md` |
| Per-task brief template | `task-card-template.md` |
| Execution flow | `workflow/agent-workflow.md` |
| Review discipline | `workflow/review-protocol.md` |
| Subagent dispatch | `workflow/subagent-dispatch.md` |
| Doc maintenance rules | `maintenance.md` |

## How To Update

See `maintenance.md` for which file to update when, and which targeted
sweeps to run after edits. Do not let `code-map.md` and
`runtime-status.md` drift from the codebase — they are read every
session and bad data here costs more than missing data.
