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
| Source/package metadata | This checkout prepares `0.19.0`, 10 runnable skills + 1 generated discovery entry, and 8 agents. |
| Git tag | This source update creates no release tag. A future `v0.19.0` must identify the verified release commit; metadata alone is not publication. |
| Marketplace / npm | Both npm packages published `0.18.1` on 2026-10-17 (registry checked 2026-11-04); those tarballs predate this checkout. This work does not publish `0.19.0`. Cursor marketplace listing remains pending. |
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
`manifest.json`): 10 runnable skills, 1 generated `_index.md` discovery
entry, plus plugin-local hooks. Native agents are installed separately below.

The bundle uses `.codex-plugin/plugin.json`. In an isolated `codex 0.162.0`
`plugin/read` comparison, root `plugin.json` yielded zero hooks while the Codex
manifest exposed hooks. The builder removes the root manifest and plugin
`agents/` directory. That historical native probe returned 12 discovered skill
entries and 3 hook declarations with Skills/Hooks capabilities; it is not a
current-inventory assertion. Current native discovery and live hook execution
require their own evidence.

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

1. **Local (recommended today):** Pause Cursor agent and hook activity during an
   upgrade: managed asset files are replaced separately, not as an atomic reader
   snapshot. Runtime `.do-it-data` and unrelated user files remain in place;
   same-path bundled assets are updated, and unknown or modified retired files
   are preserved. On a process interruption, inspect any `.do-it-backup-*` and
   `.do-it-stage-*` paths before retrying; interrupted work is not automatically
   rolled back. A rollback conflict reports its retained backup path.
   An existing `<profile>/.cursor/.do-it-install.lock` always blocks another
   installer, including across WSL and Windows. Managed Cursor `install` and
   `setup` hold that same lock before asset changes through registration,
   rollback, and cleanup. A local PID cannot establish another OS's liveness.
   After interruption, stop concurrent install attempts on all OSes sharing
   the profile, inspect the recorded owner and recovery
   files, confirm no installer is active, then archive and remove that lock
   and retry once. Never remove it while another installer may be running.
   This coordination does not protect against external lock deletion or older
   installers that ignore it.

   ```bash
   npm run install:cursor-local
   ```

   then **Developer: Reload Window**. This builds the bundle and copies it into
   `~/.cursor/plugins/local/do-it-cursor` as a **real directory** (Cursor
   rejects external symlinks), then merges do-it hooks into user-level
   `~/.cursor/hooks.json` via `hooks/run-hook.cmd …` (plugin-local hooks are
   not registered by the earlier locally verified Cursor Hooks UI/service;
   bare `.sh` commands on Windows opened in the editor instead of executing).
   Current plugin-native hook loading has not been reverified here: check for
   duplicate execution before assuming the user-level mirror is still necessary. On **native Windows**
   the target is `%USERPROFILE%\.cursor\plugins\local\do-it-cursor` (never
   `/mnt/c/...`). On Windows+WSL, set `USERPROFILE` to that Windows profile or
   `CURSOR_LOCAL_HOME` to its WSL path to mirror it. After reload, verify the exact
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

The published package is separate from this unreleased checkout. After
`npm view @tdwhere/do-it-pi@0.19.0 version` confirms the intended release,
install that exact Pi package:

```bash
pi install npm:@tdwhere/do-it-pi@0.19.0
```

Before registry publication or for package development, a local checkout can
run `npm run install:pi-global`, then `/reload` in Pi. The extension, skills,
and prompt templates work without extra packages. Correct child routing with
the primary runtime `@tintinweb/pi-subagents` currently requires an unpublished
source patch, not its unpatched npm 0.23.0 release. Prepare and review the
[native verification record and source patch](release-evidence/pi-child-identity-boundaries.md),
then deliberately select that local runtime source instead of the old one:

```bash
pi install /path/to/pi-subagents-child-identity
```

First inspect `pi list` and remove only the previous selected runtime package
registration, if present; do not load both versions together. This is an
operator action, not something do-it's installer or tests perform. Migration is
**paired**: do not deploy/reload the new adapter alone against unpatched Tintinweb.
Changing a live-linked source checkout also changes the installed plugin on reload;
explicit authorization for that runtime/adapter migration is still required.

It currently discovers package roles under bare names such as `code-mapper`;
the separate `pi-subagents` compatibility runtime uses names such as
`do-it.code-mapper`. Do not assume a registered tool proves which role source
won: user and project roles can override package roles. `/do-it-status` reports
Bash, hook diagnostics, and tool registration, not role discovery.

Provider-free native tests on Pi 1.5.0 cover patched persisted, in-memory and
nested children, ordinary forks, extension filtering, and cancelling one child
while its sibling continues. The creator supplies session-local identity;
`PI_SUBAGENT_CHILD=1` remains a separate subprocess marker. Without either,
identity is **unmarked**, root hooks apply, and status warns explicitly.
Unpatched Tintinweb 0.23.0 children are unsupported; lineage and tool presence
are no longer guessed. Root authority crosses the shell boundary even under an
`/agents/` transcript path. Pi stance dedupe follows actual persisted SDK delivery,
so interrupted output can retry on resume. On role transitions, only owned
role-specific reminders are omitted from model context, not immutable history or
user content. No live installation was patched by these tests.

The SDK peer policy is `~1.5.0`; native evidence is for **1.5.0** only. The
compatibility runtime's optional peer and development dependency are pinned to
**0.35.1**. On Linux, simulated-provider native tests verify package discovery,
project inheritance, child stance without root hooks, result preservation, and
active-child cancellation with PID death and parent survival. See
[`tests/pi/nicobailon-native.md`](../tests/pi/nicobailon-native.md). Windows and
0.84.0 lifecycle are **NOT_VERIFIED**; nicobailon's attested acceptance overlay
can reject prose-only completion despite exit code 0. The runtimes share package
agents but differ in metadata semantics; the projection explicitly qualifies
runtime names and does not select a runtime automatically. Tintinweb's replacement prompt does not inherit project
instruction files, so pass required constraints in the delegation. Tool lists,
read-only instructions, and this trusted-extension identity seam are not a
sandbox. See
[`plugins/do-it-pi/README.md`](../plugins/do-it-pi/README.md) for details.

`pi update` updates Pi; `pi update --extensions` reconciles extension packages.
Pinned package sources remain pinned. Build and package checks are
`npm run test-pi` and `npm run smoke:pi-package`.

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
version for isolated discovery: 1.0.70). Reload the Plugins tab or start a new session. Inspect the
loaded source paths and actual skill/agent names under `do-it-grok`: a plugin
list entry alone does not prove which source won discovery. The bundle carries
10 canonical skills and 8 generated Markdown specialists. Native discovery
reports specialist names such as `do-it-grok:reviewer`.

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
npm install -g ./tdwhere-do-it-0.19.0.tgz
do-it setup   # optional / legacy global copy
```
