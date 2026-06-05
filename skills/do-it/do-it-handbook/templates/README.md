# Project Handbook

The handbook is the agent-readable, low-token navigation hub for this
project. It captures the rules, terms, ownership, and architecture
that hold across sessions. Per-task artifacts live elsewhere
(`.do-it/grill/`, `.do-it/plans/`, `.do-it/brainstorm/`,
`.do-it/CONTEXT.md`).

## Start Here

- `invariants.md` — rules that always win.
- `architecture.md` — stable system shape.
- `code-map.md` — current implementation locations (maintained by the
  `code-mapper` agent).
- `runtime-status.md` — current implementation status and known gaps.
- `backlog.md` — cross-cutting unresolved issues with explicit close
  conditions.
- `glossary.md` — long-stable vocabulary.

## Source-Of-Truth Map

| Concern | File |
|---|---|
| Architecture invariants | `invariants.md` |
| Stable system shape | `architecture.md` |
| Current implementation locations | `code-map.md` |
| Implementation status / wiring gaps | `runtime-status.md` |
| Cross-cutting issues | `backlog.md` |
| Vocabulary | `glossary.md` |

Process docs are owned by skills, not this handbook: task-card layout →
`do-it-planning`, review protocol → `do-it-review-loop`, subagent dispatch →
`do-it-subagent-orchestration`, execution pipeline → `do-it-router`. The
handbook update rules live in the `do-it-handbook` SKILL `## Maintenance`
section.

## How To Update

See the `do-it-handbook` SKILL `## Maintenance` section for which file to
update when, and which targeted sweeps to run after edits. Do not let
`code-map.md` and `runtime-status.md` drift from the codebase — they are read
every session and bad data here costs more than missing data.
