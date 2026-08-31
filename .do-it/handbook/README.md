# do-it Handbook

Lean stable truth for the **do-it** repository itself — not a second README.

## Navigation

| File | Use when |
| --- | --- |
| [invariants.md](invariants.md) | Rules that always win over convenience |
| [architecture.md](architecture.md) | Four hosts, build chain, hook enforcement |
| [glossary.md](glossary.md) | Canonical terms (tier, DIM, finding, skip) |
| [worklog-template.md](worklog-template.md) | Copy into `.do-it/worklog/` per goal or day |

## What lives elsewhere

- **Process** (route → meaning buckets → verify): `skills/do-it/` — skills are operational law.
- **Execution contracts**: `.do-it/plans/` — Goal, Decisions, Boundary, Acceptance. Not a progress log. Persist only when earned; see `skills/do-it/references/task-contract.md`.
- **Active sediment**: `.do-it/CONTEXT.md` — terse terms. Project truth, not task state, not adaptive profile.
- **Ephemeral runtime / adaptive / events**: `.do-it/runtime/`, `.do-it/adaptive/`, `.do-it/events/` — local, gitignored.
- **Daily notes**: `.do-it/worklog/` — not handbook.

## Bootstrap rule

If this handbook exists, Standard/Heavy turns read relevant files before durable
decide/plan work. Missing handbook triggers `do-it-handbook` lean bootstrap
(additive only; never overwrite CONTEXT, handbook, or existing contracts). New
init creates CONTEXT / handbook / worklog / plans only — not brainstorm/grill.
