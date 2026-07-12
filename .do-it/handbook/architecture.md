# Architecture

Stable shape of the **do-it** repo — not a file inventory.

## Four hosts

| Host | Install target | Skills |
| --- | --- | --- |
| Codex | `plugins/do-it/` | All skills |
| Claude Code | `.claude-plugin/` + `dist/claude/` | All skills |
| Cursor | `plugins/do-it-cursor/` | Full `ALL_SKILLS` + `references/` + `_index.md` |
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

User prompt → **router.sh** (tier + 5 DIM flags) → **grill-prompt.sh** (Heavy-only premise pressure, or explicit grill) → tool hooks (`write-quality-lint`) → **verification-gate.sh** on Stop (**evidence-only**: fresh Bash/Shell proof after edits; `apply_patch` counts as an edit).

Hooks read session state via `hooks/lib/common.sh`; agents infer DIM from prompt prose (see `references/dimensions.md`).

## Router → workflow-kernel pointers

`do-it-router/SKILL.md` stays ≤160 lines; shared definitions live in `references/workflow-kernel.md`:

- failure-mode forecast classes and path map chain
- Diverge vs Converge (`do-it-decide` modes; `plan-challenger` as converge sub-lens)
- Finding Schema and Skip Announcement
- tier precedents for forecast/path-map N/A

## Subagent model

10 agents in `agents/*.toml`; parent **Delegation Contract** in the router / parent prompt plus thin **`subagent-stance`** hook — no separate orchestration skill. Review lenses detailed in `references/review-lenses.md`.

## Project meta directories

```
.do-it/handbook/     stable truth (this tree)
.do-it/worklog/      per-goal notes
.do-it/brainstorm/   brainstorm artifacts
.do-it/grill/        grill artifacts
.do-it/plans/        durable plan cards
.do-it/runtime/      pointer + hook session state (ignored)
```
