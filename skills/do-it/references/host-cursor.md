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
~/.cursor/plugins/local/do-it-cursor          # macOS / Linux / Remote-WSL
%USERPROFILE%\.cursor\plugins\local\do-it-cursor   # native Windows
```

as a **real directory**. Do **not** symlink the repo here — Cursor rejects
symlink targets outside `~/.cursor/plugins/local/` (security validation), even
though older docs suggested `ln -s`.

The installer also **merges** do-it entries into user-level
`~/.cursor/hooks.json` (without removing your other hooks). Current Cursor
Hooks service / Customize → Hooks UI only scans enterprise, user, and project
`hooks.json` — it does **not** register `plugins/local/.../hooks/hooks.json`.
If you only rely on the plugin package hooks file, Hooks stays empty even
when Plugins shows `do-it-cursor loaded`.

After install, confirm:

1. Absolute path printed by the script exists and contains `.cursor-plugin/plugin.json`
2. Customize → Hooks lists user-level do-it commands (not an empty page)
3. `do-it doctor --target=cursor` reports plugin present, user hooks wired, and
   sample hook runnable

**Native Windows (PowerShell):** run Node from the repo; the script uses
`%USERPROFILE%` directly and never rewrites it to `/mnt/c/...` (that WSL mount
form is wrong on win32 and can land under `D:\mnt\c\Users\...` when cwd is on
`D:`). Prefer Git Bash or WSL only when you intentionally want those shells —
both still install into the Windows profile Cursor reads.

**Windows + WSL:** Cursor running as a Windows app reads
`%USERPROFILE%\.cursor\plugins\local\`, not the Linux `$HOME/.cursor`. The
install script mirrors into detected Windows profiles under `/mnt/c/Users/…`
**only when running inside WSL**. Alternatively open the project with
**Remote-WSL** so Linux `~/.cursor` is used.

**Option B — CLI setup** (same official local path):

```bash
do-it setup --target=cursor
do-it doctor --target=cursor
```

Default install root is `$HOME/.cursor/plugins/local/do-it-cursor` (on native
Windows, `HOME` falls back to `%USERPROFILE%`). Override with
`CURSOR_PLUGIN_ROOT_OVERRIDE=/path/to/plugin-root`.

Reload Cursor (**Developer: Reload Window**) after either option.

### Hooks visibility (important)

| Source | Loaded by current Cursor Hooks service? | Shown in Customize → Hooks? |
|---|---|---|
| `~/.cursor/hooks.json` (user) | Yes | Yes |
| `/.cursor/hooks.json` (project) | Yes | Yes |
| `plugins/local/do-it-cursor/hooks/hooks.json` | **No** (known gap) | **No** |

do-it therefore writes the user-level file as the primary execution path and
keeps the plugin `hooks/hooks.json` for marketplace / future Cursor support.
**Open config** opening an empty `~/.cursor/hooks.json` before install does
**not** mean the plugin failed to load — run install/setup so that file is
merged, then reload.

### Windows hook entrypoint (`.cmd`, not `.sh`)

On native Windows, Cursor treats a bare `.sh` (or extensionless bash) hook
`command` as a **file to open** — the editor pops script source, or Windows
shows “Select an app to open”. do-it routes every Cursor hook through the
polyglot runner:

```text
…/hooks/run-hook.cmd session-start
…/hooks/run-hook.cmd router
```

`run-hook.cmd` finds Git Bash (`C:\Program Files\Git\bin\bash.exe`, then
`(x86)`, then `where bash` while skipping `System32\bash.exe`) and execs the
matching `.sh`. It also sets `CURSOR_PLUGIN_ROOT` / `CURSOR_PLUGIN_DATA` when
missing so `session-start.sh` still emits Cursor `{additional_context}`.

**Do not** point Customize → Hooks at `router.sh` / `session-start.sh`
directly on Windows. Re-run `node scripts/install-cursor-local.mjs` or
`do-it setup --target=cursor` if an older install left bare `.sh` commands.
macOS / Linux keep the same `run-hook.cmd` command (polyglot) so one
`hooks.json` works on all platforms.

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
    ├── hooks.json          # also mirrored into ~/.cursor/hooks.json
    ├── run-hook.cmd        # Windows-safe entry (polyglot); required on win32
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
