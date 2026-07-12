# Host Adapter: Cursor

Medium hook depth: bootstrap + prompt gates + write-time quality + stop
verification. Install via local plugin path, CLI mirror, or Cursor marketplace
when listed.

## Skill Bundle

The Cursor plugin registers the **full skill set** (same as Codex / Claude /
OpenCode):

`do-it-router`, `do-it-code-quality`, `do-it-review`, `do-it-decide`,
`do-it-verify`, plus extended `do-it-handbook`, `do-it-context`,
`do-it-skill-authoring`.

`skills/do-it/references/` is always copied alongside (shared kernel — not a
registered skill).

Tier labels (`CORE_SKILLS` / `EXTENDED_SKILLS` in `scripts/skill-tiers.mjs`)
remain conceptual; Cursor no longer ships a core-only subset.

## Install

**Cursor does not use Claude Code `/plugin marketplace add` or `/plugin install`
slash commands.** Those apply to Claude Code only — do not use them in Cursor.

Cursor **does** have an official public marketplace
([cursor.com/marketplace](https://cursor.com/marketplace)) and Team Marketplaces
(Dashboard → Plugins → Import from Repo). Layout matches
[cursor/plugin-template](https://github.com/cursor/plugin-template) /
[cursor/plugins](https://github.com/cursor/plugins): root
`.cursor-plugin/marketplace.json` + `plugins/do-it-cursor/.cursor-plugin/plugin.json`.

**Status (checked against the public marketplace):** `do-it` / `do-it-cursor` is
**not** listed on cursor.com/marketplace yet. Until it is reviewed/listed,
use local install, CLI setup, or Team Import below. To list publicly, submit
at [cursor.com/marketplace/publish](https://cursor.com/marketplace/publish).

### What works today (local / CLI)

**Option A — local plugin directory** (official path from
[Cursor plugins docs](https://cursor.com/docs/plugins)):

```bash
npm run build:cursor-plugin
node scripts/install-cursor-local.mjs
# then Developer: Reload Window
```

This **copies** `plugins/do-it-cursor/` into:

```text
~/.cursor/plugins/local/do-it-cursor
```

as a **real directory**. Do **not** symlink the repo here — Cursor rejects
symlink targets outside `~/.cursor/plugins/local/` (security validation), even
though older docs suggested `ln -s`.

**Windows + WSL:** Cursor running as a Windows app reads
`%USERPROFILE%\.cursor\plugins\local\`, not the Linux `$HOME/.cursor`. The
install script also mirrors into detected Windows profiles under `/mnt/c/Users/…`.
Alternatively open the project with **Remote-WSL** so Linux `~/.cursor` is used.

**Option B — CLI setup** (same official local path):

```bash
do-it setup --target=cursor
do-it doctor --target=cursor
```

Default install root is `$HOME/.cursor/plugins/local/do-it-cursor`. Override with
`CURSOR_PLUGIN_ROOT_OVERRIDE=/path/to/plugin-root`.

Reload Cursor (**Developer: Reload Window**) after either option.

### Team marketplace (works without public listing)

Cursor Dashboard → Plugins → **Import from Repo** → paste
`https://github.com/tdwhere123/do-it`. Cursor reads
`.cursor-plugin/marketplace.json` and surfaces `do-it-cursor`. Enable from
**Customize**.

### Public marketplace (after listing)

After Anysphere review/listing, install from **Customize** or
[cursor.com/marketplace](https://cursor.com/marketplace).

Repo layout (schema-valid for import / submit):

```text
.cursor-plugin/marketplace.json          # name, owner, metadata, plugins[{name,source,description}]
plugins/do-it-cursor/.cursor-plugin/plugin.json
```

### Layout after install

```
~/.cursor/plugins/local/do-it-cursor/   # real copy (not an external symlink)
├── .cursor-plugin/plugin.json
├── assets/logo.svg
├── skills/          # full 8 skills + references/
├── agents/
└── hooks/
    ├── hooks.json
    ├── session-start.sh
    └── write-quality-lint.sh
```

Session state: `$CURSOR_PLUGIN_DATA/sessions/` (first in `do_it_session_dir`
search order).

## Hook Depth

**Medium** — subset of full kernel; no `grill-pretool`:

| Event | Scripts | Matcher | Notes |
|---|---|---|---|
| `sessionStart` | `session-start.sh` | — | Light bootstrap; skills index hint |
| `beforeSubmitPrompt` | `router.sh` → `grill-prompt.sh` → `subagent-stance.sh` | — | Grill injects Heavy-only |
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
