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
- **Per-task artifacts** (optional): `.do-it/plans/` and similar — not a mandatory pipeline.
- **Ephemeral runtime**: `.do-it/runtime/` (gitignored) — session pointer and hook state.
- **Daily notes**: `.do-it/worklog/` — not handbook.

## Bootstrap rule

If this handbook exists, Standard/Heavy turns read relevant files before durable decide/plan work. Missing handbook triggers `do-it-handbook` lean bootstrap (additive only).
