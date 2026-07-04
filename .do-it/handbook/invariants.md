# Invariants

Rules that do not bend for speed. Violations are Blocking in review.

## Source of truth

| Surface | Role |
| --- | --- |
| `skills/do-it/` | Maintained skill bodies and `references/` kernel |
| `agents/*.toml` | Agent definitions (portable; no host model pins) |
| `hooks/` | Enforcement scripts (router, grill, verification-gate, lints) |
| `manifest.json` + `package.json` | Published inventory and version |
| `plugins/do-it/` | Codex plugin build output from source |
| `plugins/do-it-cursor/` | Cursor plugin build (core skills + agents from `dist/claude/`) |
| `dist/claude/` | Generated Claude/Cursor agent markdown from TOML |

**Never** hand-edit generated plugin trees to “fix” drift — rebuild from source.

## Skill tiers

- **Core** (`scripts/skill-tiers.mjs` `CORE_SKILLS`): shipped in Cursor plugin; router, grill, planning, tdd, review, fix, verification-gate, subagent-orchestration.
- **Extended**: on-demand or maintenance skills; Codex/Claude install all; Cursor does not bundle extended skill directories.

## Workflow gates

- Non-trivial work loads `do-it-router` before plan/edit/review/verify/closeout.
- **Light** skips orthogonal DIM evaluation; **Standard** is default delegation tier; **Heavy** is parent-owned unless explicitly assigned.
- `verification-gate` is a **soft transcript heuristic** on Stop — it checks markers and skip flags, not a hard CI gate.
- Skip must be announced: `skipped: <skill-or-hook> because <reason>` (see `workflow-kernel` § Skip Announcement).

## Review ownership

- **reviewer**: correctness, contracts, regressions, missing tests — not security threat modeling.
- **red-team-reviewer**: security, auth, concurrency, replay, adversarial failure modes.
- Findings use workflow-kernel **Finding Schema** (`cause_class`, `NOT_CHECKED` required).

## Agents

- Parent dispatch must include scope, write ownership, stop condition.
- Return status: `DONE` | `NEEDS_CONTEXT` | `BLOCKED` only (`CLEAR`/`FINDINGS`/`STILL_OPEN` retired).

## Tests and validation

- `npm test` runs `build:generated` → `build:cursor-plugin` → `validate:agents` (includes Cursor byte-parity checks).
- Hook tests include `routing-golden.test.sh` for tier/skip precedents.
