# Invariants

Rules that do not bend for speed. Violations are Blocking in review.

## Source of truth

| Surface | Role |
| --- | --- |
| `skills/do-it/` | Maintained skill bodies and `references/` kernel |
| `agents/*.toml` | Agent definitions (portable; no host model pins) |
| `hooks/` | Enforcement scripts (router, grill-prompt, verification-gate, write-quality) |
| `manifest.json` + `package.json` | Published inventory and version |
| `plugins/do-it/` | Codex plugin build output from source |
| `plugins/do-it-cursor/` | Cursor plugin build (core skills + agents from `dist/claude/`) |
| `dist/claude/` | Generated Claude/Cursor agent markdown from TOML |

**Never** hand-edit generated plugin trees to “fix” drift — rebuild from source.

## Skill tiers (0.14+)

- **Core** (`scripts/skill-tiers.mjs` `CORE_SKILLS`): `do-it-router`, `do-it-code-quality`, `do-it-review`, `do-it-decide`, `do-it-verify` — shipped in the Cursor plugin.
- **Extended maintenance**: `do-it-handbook`, `do-it-context`, `do-it-skill-authoring` — Codex/Claude/OpenCode; not Cursor-bundled.
- Pre-0.14 process skills (`grill`, `planning`, `review-loop`, `fix-loop`, `verification-gate` skill, `subagent-orchestration`, …) are **retired** — see `CHANGELOG.md`.

## Workflow gates

- Non-trivial work loads `do-it-router` before plan/edit/review/verify/closeout.
- **Light** skips orthogonal DIM evaluation; **Standard** self-selects meaning buckets (no mandatory decide chain); **Heavy** is parent-owned unless explicitly assigned.
- `grill-prompt` injects only on **Heavy** or explicit grill language.
- `verification-gate` is **evidence-only** on Stop: after edits, completion language needs a fresh relevant shell command (`Bash` or `Shell`) in the current turn — not review markers.
- Skip must be announced: `skipped: <skill-or-hook> because <reason>` (see `workflow-kernel` § Skip Announcement).

## Review ownership

- **reviewer**: correctness, contracts, regressions, missing tests — not security threat modeling.
- **red-team-reviewer**: security, auth, concurrency, replay, adversarial failure modes.
- Findings use workflow-kernel **Finding Schema** (`cause_class`, `NOT_CHECKED` required).

## Agents

- About **10** agents after 0.14 merges. Parent dispatch must include scope, write ownership, stop condition.
- Return status: `DONE` | `NEEDS_CONTEXT` | `BLOCKED` only (`CLEAR`/`FINDINGS`/`STILL_OPEN` retired).

## Tests and validation

- `npm test` runs generated builds → plugin builds → validates → hook/install suites.
- Hook tests include `routing-golden`, `verification-gate`, and `grill-prompt` policy coverage.
