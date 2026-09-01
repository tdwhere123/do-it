# Project Handbook

The handbook is the low-token source for stable project truth: rules, terms,
ownership, and architecture that hold across many sessions. Daily progress,
experiments, temporary status, and lessons live in `.do-it/worklog/`.

## Start Here

- `invariants.md` — rules that always win.
- `architecture.md` — stable system shape.
- `glossary.md` — long-stable vocabulary.
- `worklog-template.md` — copy into `.do-it/worklog/YYYY-MM-DD.md` or
  `.do-it/worklog/<goal>.md`.

## Source-Of-Truth Map

| Concern | File |
|---|---|
| Architecture invariants | `invariants.md` |
| Stable system shape | `architecture.md` |
| Vocabulary | `glossary.md` |
| Daily or goal history | `.do-it/worklog/` |
| Execution contracts | `.do-it/plans/` |
| Active sediment | `.do-it/CONTEXT.md` |
| Runtime / adaptive / events | local only (gitignored) |

`.do-it/plans/` holds durable execution contracts: Goal, Decisions, Boundary,
Acceptance. They are not progress logs. Do not add progress checkboxes.
Persist a contract only when earned; otherwise finish in chat.

Project truth, task state, and adaptive profile are different planes. Do not
store task progress or personal policy in this handbook.

Process guidance is owned by skills, not this handbook: execution contracts →
`do-it-decide`, review protocol → `do-it-review`, delegation →
`workflow-kernel.md` delegation boundary guidance, execution routing →
`do-it-router`. The handbook update rules live in the `do-it-handbook` SKILL
`## Maintenance` section.

## How To Update

Use `rg` and targeted file reads for current code locations. Do not maintain a
persistent code map here; stale code maps cost more tokens than rediscovery.
