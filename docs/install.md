# Installation Guide

[English](./install.md) | [中文](./install.zh-CN.md)

Delivery is host-specific. Codex and Claude Code are **marketplace-first**;
Cursor is **local copy or Team Import today, with public listing pending**;
Pi ships as an **independent npm package**. Skills, specialists, and runtime
checks use the host-specific delivery paths below. Grok Build uses its generated
`do-it-grok` bundle.
OpenCode and Kimi Code repository support is retired; this does not remove local
applications or user configuration.

| Truth plane | What this repository can claim |
| --- | --- |
| Source/package metadata | This checkout declares `0.18.1`, 12 user/runnable skills + 1 generated discovery entry, and 10 agents. |
| Git tag | A `0.18.1` npm/GitHub release still requires `v0.18.1`; version metadata alone is not a release tag. |
| Marketplace / npm | Coordinates and publish paths are documented; only post-workflow `npm view` proves registry publication. Cursor marketplace listing remains pending. |
| Live host | Only an install/inspection on that host proves what is active there; do not infer it from source or a packed artifact. |

## Codex

```bash
codex plugin marketplace add tdwhere123/do-it
codex plugin add do-it@tdwhere-do-it
```

`codex plugin marketplace add` only registers the marketplace — it does not
install the plugin. Inspect and trust configured plugin hooks under `/hooks`.
Manifest validation and skill discovery do not prove hooks execute in the active
host; verify that separately before relying on context or edit checks.

Local checkout smoke test (use a temp `CODEX_HOME` if needed):

```bash
CODEX_HOME=/tmp/do-it-plugin-test codex plugin marketplace add /path/to/do-it
CODEX_HOME=/tmp/do-it-plugin-test codex plugin add do-it@tdwhere-do-it
```

The Codex plugin bundle lives at `plugins/do-it/` (generated from
`manifest.json`): 12 user/runnable skills, 1 generated `_index.md` discovery
entry, plus plugin-local hooks. Native agents are installed separately below.

The bundle uses `.codex-plugin/plugin.json`. In an isolated `codex 0.162.0`
`plugin/read` comparison, root `plugin.json` yielded zero hooks while the Codex
manifest exposed hooks. The builder removes the root manifest and plugin
`agents/` directory. A native read of the final repository bundle returned
12 skills and 3 hook declarations with Skills/Hooks capabilities. Discovery
still does not prove live hook execution.

**Named specialists require native agent installation.** Codex loads
`.codex/agents/*.toml` or explicit configured roles; plugin `agents` metadata
and cached files do not register those roles. From this checkout, install only
the canonical native agents using the same ownership and replacement guards:

```bash
node bin/do-it.mjs setup --target=codex --only=agents
node bin/do-it.mjs doctor --target=codex --only=agents
```

The default destination is `~/.codex/agents`; set `CODEX_HOME` to use an isolated
home. This path does not install a second skills/hooks mirror or edit user configuration. It retains
current canonical agents during legacy migration and preserves unrelated
user-defined agents. Doctor proves managed file/state consistency; separately
verify live named-role discovery and the role's sandbox behavior. See
[architecture](./architecture.md) for the pinned host contract and evidence limits.

## Claude Code

```text
/plugin marketplace add tdwhere123/do-it
/plugin install do-it@do-it
```

For checkout validation, `claude plugin validate --strict .claude-plugin/plugin.json`
checks the plugin manifest and passed for this source update. Validating the
repository root checks the marketplace and does not replace this check. Neither
command proves live hook execution.

## Cursor

**Cursor does not use Claude Code `/plugin …` slash commands.**

Cursor has an official marketplace
([cursor.com/marketplace](https://cursor.com/marketplace)), but **`do-it` is not
listed there yet**. Until it is submitted/reviewed, use:

1. **Local (recommended today):**

   ```bash
   npm run install:cursor-local
   ```

   then **Developer: Reload Window**. This builds the bundle and copies it into
   `~/.cursor/plugins/local/do-it-cursor` as a **real directory** (Cursor
   rejects external symlinks), then merges do-it hooks into user-level
   `~/.cursor/hooks.json` via `hooks/run-hook.cmd …` (plugin-local hooks are
   not registered by the current Cursor Hooks UI/service; bare `.sh` commands
   on Windows open in the editor instead of executing). On **native Windows**
   the target is `%USERPROFILE%\.cursor\plugins\local\do-it-cursor` (never
   `/mnt/c/...`). On Windows+WSL the script also mirrors into that Windows
   profile when it can see `/mnt/c/Users`. After reload, verify the exact
   plugin directory exists and Customize → Hooks lists user-level do-it `.cmd`
   entries; Agent turns must not pop `.sh` source. This local-copy path does not
   create managed CLI install state, so ordinary `do-it doctor` is not its
   verifier.
2. **Managed CLI setup:** `do-it setup --target=cursor` then reload (same
   `…/plugins/local/do-it-cursor` path + user hooks merge). `setup` runs managed
   install plus `doctor`; later `do-it doctor --target=cursor` applies only to
   this managed CLI setup.
3. **Team Import (no public listing needed):** Dashboard → Plugins → Import
   from Repo → `https://github.com/tdwhere123/do-it` (reads
   `.cursor-plugin/marketplace.json`).
4. **Public listing later:** submit at
   [cursor.com/marketplace/publish](https://cursor.com/marketplace/publish).

Cursor ships the full skill inventory, discovery index, references, and scoped
agents. Context and edit checks use run-hook.cmd; completion gates and automatic
diagnostics are not registered. See [host matrix](./harness-adapter-matrix.md).

## Pi

After `npm view @tdwhere/do-it-pi@0.18.1 version` succeeds, install the
independent Pi package from npm:

```bash
pi install npm:@tdwhere/do-it-pi
```

Before registry publication or for package development, a local checkout can
run `npm run install:pi-global`, then `/reload` in Pi. The extension, skills,
and prompt templates work without extra packages. Install `pi-subagents`
separately to execute the ten namespaced package agents such as
`do-it.code-mapper` and `do-it.reviewer`:

```bash
pi install npm:pi-subagents
```

Use `/do-it-status` to check Bash, Git Bash on Windows, hook diagnostics, and
`Agent`/`subagent` tool registration. Check the runtime’s actual `do-it.*` role
list separately; a registered tool alone does not establish package-agent
discovery in that session or a child fork. A fresh Pi 1.1.0 process verified
stance-only context and no root hooks for a persisted native child running `pwd`.
Build and package checks are available as
`npm run test-pi` and `npm run smoke:pi-package`. See
[`plugins/do-it-pi/README.md`](../plugins/do-it-pi/README.md).

## Grok Build

Use the generated `plugins/do-it-grok/` bundle, named `do-it-grok`. The repository
root can collide with a Claude marketplace plugin named `do-it`; it is not the
Grok installation target. With the bundle generated, run from the checkout:

```bash
npm run build:generated
node scripts/build-grok-plugin.mjs
agent plugin validate plugins/do-it-grok
agent plugin install "$(pwd)/plugins/do-it-grok" --trust
agent inspect --json
```

These commands use the native Grok Build `agent` executable (verified host
version: 1.0.46). Reload the Plugins tab or start a new session. Inspect the
loaded source paths and actual skill/agent names under `do-it-grok`: a plugin
list entry alone does not prove which source won discovery. The bundle carries
12 canonical skills and 10 generated Markdown specialists.

UserPromptSubmit only updates turn state and emits no Core context.
Grok's hook protocol differs from Claude's: prompt/session hook context is not
proof of model-visible bootstrap context. PostToolUse can deliver context after
a tool result. The adapter delivers Core after the first completed tool, not
before the first action; live execution still needs separate evidence.
The Claude strict external-action profile is not copied to Grok. See
[Grok host details](../skills/do-it/references/host-grok.md).

## Optional / legacy: `do-it setup`

CLI setup remains for doctor checks, temp-home smoke tests, and migration from
older global installs. It is **not** the recommended first install. Prefer the
plugin marketplace; use setup only to mirror or migrate — do not run plugin
install and a live, do-it-managed legacy mirror at the same time. User-defined
global agents can remain separate. The agent-only Codex command above is the
complement to plugin delivery, not a legacy skills/hooks mirror.

```bash
npm install -g https://github.com/tdwhere123/do-it/archive/refs/heads/main.tar.gz
do-it setup                  # Codex legacy global copy
do-it setup --target=claude  # optional CLI mirror of the Claude plugin
do-it setup --target=cursor  # optional CLI mirror of the Cursor plugin
do-it doctor
```

`DO_IT_FORCE=1` only when you intentionally replace unmarked skill/agent
targets. Prefer a temporary home (`CODEX_HOME=…`,
`CLAUDE_PLUGIN_ROOT_OVERRIDE=…`, `CURSOR_PLUGIN_ROOT_OVERRIDE=…`) when testing.

## What It Installs

Professional skills, scoped specialists where supported, compact context, and
advisory edit checks. No .do-it scaffold is required. See the [host matrix](./harness-adapter-matrix.md)
and [migration](./simplification-migration.md). Managed upgrades remove retired
package components only when ownership is proven; user profiles and memory are
never migrated or deleted.

## Alternative Install Sources

For a packed local release artifact:

```bash
npm pack
npm install -g ./tdwhere-do-it-0.18.1.tgz
do-it setup   # optional / legacy global copy
```
