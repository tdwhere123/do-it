# Architecture

Stable shape of the **do-it** repo — not a file inventory.

## Four hosts

| Host | Install target | Skills |
| --- | --- | --- |
| Codex | `plugins/do-it/` | All skills |
| Claude Code | `.claude-plugin/` + `dist/claude/` | All skills |
| Cursor | `plugins/do-it-cursor/` | Core only + `references/` |
| OpenCode | `plugins/do-it-opencode/` | Adapter-specific |

One maintained skill tree (`skills/do-it/`); hosts consume builds, not forks.

## Build chain

```text
agents/*.toml  →  build-claude-agents.mjs  →  dist/claude/agents/*.md
skills/do-it/  →  build-codex-plugin / build-cursor-plugin / manifest
manifest.json  →  build-index-json.mjs  →  index.json
```

`validate-agent-bundle.mjs` enforces version parity and byte-equality between source, Codex plugin, Claude dist, and Cursor bundle.

## Hook chain (enforcement)

User prompt → **router.sh** (tier + 5 DIM flags) → **grill-prompt.sh** (premise pressure) → tool hooks (write-quality-lint, comments-lint, anti-patterns) → **verification-gate.sh** on Stop (done-claim markers, review trace).

Hooks read session state via `hooks/lib/common.sh`; agents infer DIM from prompt prose (see `references/dimensions.md`).

## Router → workflow-kernel pointers

`do-it-router/SKILL.md` stays ≤160 lines; shared definitions live in `references/workflow-kernel.md`:

- failure-mode forecast classes and path map chain
- Diverge vs Converge (brainstorm / grill / plan-challenger)
- Finding Schema and Skip Announcement
- tier precedents for forecast/path-map N/A

## Subagent model

23 agents in `agents/*.toml`; orchestration contract in `do-it-subagent-orchestration`. Review lenses detailed in `references/review-lenses.md`.

## Project meta directories

```
.do-it/handbook/     stable truth (this tree)
.do-it/worklog/      per-goal notes
.do-it/brainstorm/   brainstorm artifacts
.do-it/grill/        grill artifacts
.do-it/plans/        durable plan cards
.do-it/runtime/      pointer + hook session state (ignored)
```
