# Installation Guide

[English](./install.md) | [中文](./install.zh-CN.md)

Delivery is host-specific. Codex and Claude Code are **marketplace-first**;
Cursor is **local copy or Team Import today, with public listing pending**;
OpenCode and Pi ship as **independent npm packages**; and Kimi Code reads the
**repository root as the plugin** — no build step. Plugin bundles ship skills,
agents, and hooks together.

| Truth plane | What this repository can claim |
| --- | --- |
| Source/package metadata | This checkout declares `0.17.0`, 12 user/runnable skills + 1 generated discovery entry, and 10 agents. |
| Git tag | A `0.17.0` npm/GitHub release still requires `v0.17.0`; version metadata alone is not a release tag. |
| Marketplace / npm | Coordinates and publish paths are documented; only post-workflow `npm view` proves registry publication. Cursor marketplace listing remains pending. |
| Live host | Only an install/inspection on that host proves what is active there; do not infer it from source or a packed artifact. |

## Codex

```bash
codex plugin marketplace add tdwhere123/do-it
codex plugin add do-it@tdwhere-do-it
```

`codex plugin marketplace add` only registers the marketplace — it does not
install the plugin. After install, **trust the plugin hooks** under `/hooks` so
compact context, independent child stance, and source-edit checks are available.

Local checkout smoke test (use a temp `CODEX_HOME` if needed):

```bash
CODEX_HOME=/tmp/do-it-plugin-test codex plugin marketplace add /path/to/do-it
CODEX_HOME=/tmp/do-it-plugin-test codex plugin add do-it@tdwhere-do-it
```

The Codex plugin bundle lives at `plugins/do-it/` (generated from
`manifest.json`): 12 user/runnable skills, 1 generated `_index.md` discovery
entry, and 10 agents, plus plugin-local hooks.

Modern Codex plugins own those bundled do-it agents.
`manifest.targets.codex.installAgents=false` keeps `~/.codex/agents` for
user-defined agents; legacy migration removes only confirmed old do-it
duplicates.

## Claude Code

```text
/plugin marketplace add tdwhere123/do-it
/plugin install do-it@do-it
```

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

## OpenCode

OpenCode loads plugins from the `"plugin"` array in `opencode.json`. After
`npm view @tdwhere/do-it-opencode@0.16.0 version` succeeds, install the
independent npm package:

```bash
opencode plugin @tdwhere/do-it-opencode -g
```

Before registry publication, for checkout development, or during registry
outages, `npm run install:opencode-global` builds and vendors a copy under
OpenCode's config home. Do not point a live host at a mutable git checkout. See
[`plugins/do-it-opencode/docs/README.opencode.md`](../plugins/do-it-opencode/docs/README.opencode.md).

```bash
npm run test-opencode
```

## Pi

After `npm view @tdwhere/do-it-pi@0.16.0 version` succeeds, install the
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
optional package-agent availability. Build and package checks are available as
`npm run test-pi` and `npm run smoke:pi-package`. See
[`plugins/do-it-pi/README.md`](../plugins/do-it-pi/README.md).

## Kimi Code

Kimi Code reads the repository root as the plugin — no build step, no generated
bundle. The root `kimi.plugin.json` points straight at `./skills/do-it/`,
`./commands/`, and `./hooks/`:

```text
/plugins install https://github.com/tdwhere123/do-it
```

Then `/reload` (or a new session). Installs are per-user under
`$KIMI_CODE_HOME/plugins/managed/do-it/` and run from that managed copy;
reinstall to pick up updates.

Isolated local smoke (does not touch your real Kimi home):

```bash
export KIMI_CODE_HOME=/tmp/do-it-kimi-test
# From a Kimi Code session pointed at this checkout:
#   /plugins install /path/to/do-it
#   /reload
# Then: confirm 12 skills appear, `/do-it:skip` resolves, and a prompt + Edit +
# stop turn exercises sessionStart/kernel-context, evidence-observer,
# compact context and source-edit checks.
# Or run the packaged validator without a live session:
npm run validate:kimi-plugin
```

Kimi ships the full skills and three commands, compact session/prompt context,
and source-edit checks. Its built-in agent mechanism is separate from the portable
custom agent bundle. See [Kimi details](../skills/do-it/references/host-kimi.md).

## Optional / legacy: `do-it setup`

CLI setup remains for doctor checks, temp-home smoke tests, and migration from
older global installs. It is **not** the recommended first install. Prefer the
plugin marketplace; use setup only to mirror or migrate — do not run plugin
install and a live, do-it-managed legacy mirror at the same time. User-defined
global agents can remain separate.

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
npm install -g ./tdwhere-do-it-0.16.0.tgz
do-it setup   # optional / legacy global copy
```
