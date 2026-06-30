# Host Adapter: Cursor

Medium hook depth: bootstrap + prompt gates + write-time quality + stop
verification. Distribution is **plugin marketplace only** (no standalone CLI
install path).

## Install (planned / in progress)

```
plugins/do-it-cursor/
├── .cursor-plugin/plugin.json
├── skills/          # synced from skills/do-it/
├── agents/
└── hooks/
    ├── hooks.json
    ├── session-start.sh
    └── write-quality-lint.sh   # symlink or copy of hooks/write-quality-lint.sh
```

Session state: `$CURSOR_PLUGIN_DATA/sessions/` (first in `do_it_session_dir`
search order).

## Hook Depth

**Medium** — subset of full kernel:

| Event | Scripts | Notes |
|---|---|---|
| `sessionStart` | `session-start.sh` | Light bootstrap; skills index hint |
| `beforeSubmitPrompt` | `router.sh` → `grill-prompt.sh` → `subagent-stance.sh` | Same simplified chain as Codex |
| `preToolUse` | `grill-pretool.sh` | Heavy / durable plan gate |
| `postToolUse` / `afterFileEdit` | `write-quality-lint.sh` | Single advisory reminder |
| `stop` | `verification-gate.sh` | Hard done-claim block |

No NotebookEdit matcher until Cursor exposes an equivalent event.

## Tool Mapping

| do-it intent | Cursor tool |
|---|---|
| Read / inspect | `Read`, `Grep`, `Glob`, `SemanticSearch` |
| Edit | `StrReplace`, `Write`, `EditNotebook` |
| Verify | `Shell` |
| Delegate | `Task` subagent |
| Load skill | Cursor skill discovery (`.cursor/skills`, plugin skills) |
| Browser / UI | MCP browser tools when enabled |

Shared skills must say "edit tool" or "host edit tool", not `MultiEdit`.

## Truth Plane

Use `live-cursor` for claims about Cursor hook firing, marketplace plugin load,
Glass/MCP behavior, or IDE-specific skill discovery.

## Token Strategy

Same tier gating and single-reminder dedup as Codex. Cloud agents may skip
heavier skill loads — router tier still writes session state when hooks run.
