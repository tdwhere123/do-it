# Host Adapter: Cursor

Medium hook depth: bootstrap + prompt gates + write-time quality + stop
verification. **Global install** via `do-it setup --target=cursor` copies the
plugin bundle to `~/.cursor/plugins/do-it-cursor/` and registers
`do-it-cursor@do-it` for the IDE. Marketplace install remains optional.

## Skill Bundle (Core Only)

The Cursor plugin registers **8 core skills** only:

`do-it-router`, `do-it-grill`, `do-it-planning`, `do-it-tdd`,
`do-it-review-loop`, `do-it-fix-loop`, `do-it-verification-gate`,
`do-it-subagent-orchestration`.

`skills/do-it/references/` is always copied alongside (shared kernel — not a
registered skill). **Extended** skills (brainstorm, architecture-scan,
codebase-design, interface-drill, debugging, slicing, comments-discipline,
worktree-isolation, branch-closeout, handbook, context, skill-authoring) remain
in the full repo and Codex/Claude installs — not in the Cursor plugin bundle.

When Route Map or hooks point at an extended skill, load it from the repository
source or run full `do-it setup` for a non-Cursor target; tell the user if the
skill is not present in the plugin install.

Tier source of truth: `scripts/skill-tiers.mjs` (`CORE_SKILLS` / `EXTENDED_SKILLS`).

## Install

```bash
do-it setup --target=cursor
do-it doctor --target=cursor
```

Override install root: `CURSOR_PLUGIN_ROOT_OVERRIDE=/path/to/plugin-root`.

Layout after install:

```
~/.cursor/plugins/do-it-cursor/
├── .cursor-plugin/plugin.json
├── skills/          # core 8 skills + references/ (see host-cursor.md)
├── agents/
└── hooks/
    ├── hooks.json   # Cursor event mapping (install/cursor-hooks.json)
    ├── session-start.sh
    └── write-quality-lint.sh
```

Session state: `$CURSOR_PLUGIN_DATA/sessions/` (first in `do_it_session_dir`
search order).

## Hook Depth

**Medium** — subset of full kernel:

| Event | Scripts | Matcher | Notes |
|---|---|---|---|
| `sessionStart` | `session-start.sh` | — | Light bootstrap; skills index hint |
| `beforeSubmitPrompt` | `router.sh` → `grill-prompt.sh` → `subagent-stance.sh` | — | Same simplified chain as Codex |
| `preToolUse` | `grill-pretool.sh` | `StrReplace\|Write\|EditNotebook` | Heavy / durable plan gate |
| `postToolUse` / `afterFileEdit` | `write-quality-lint.sh` | `StrReplace\|Write\|EditNotebook` | Single advisory reminder |
| `stop` | `verification-gate.sh` | — | Hard done-claim block |

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
