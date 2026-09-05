# Maintenance Guide

## Source Of Truth

This repository is the maintained source of truth for the do-it workflow
distribution. The live `~/.codex` copy is an install target, not the place to
make durable edits.

Working rule:

1. Edit the maintained repository copy.
2. Use the host's current path: marketplace-first for Codex / Claude, local copy
   or Team Import for Cursor while public listing is pending, and the independent
   OpenCode npm package with the vendored config-home fallback. Treat registry
   availability as unverified until `npm view` succeeds.
3. Use `do-it setup` only for managed CLI doctor / migration. Ordinary `doctor`
   verifies that managed state; it does not verify Cursor's standalone local-copy
   installer or OpenCode registration.
4. Avoid hand-editing deployed files under host configuration roots.

For modern Codex installs, the plugin owns bundled do-it agents.
`manifest.targets.codex.installAgents=false` deliberately leaves
`~/.codex/agents` as user-owned space rather than a second plugin mirror. A
legacy migration may remove only exact, confirmed old do-it duplicates; it must
not overwrite, delete, or classify user-defined global agents as do-it state.

Exception: for an intentional live-global rebaseline, copy only
manifest-managed targets from `~/.codex` back into this repository, then run the
doctor command to prove the repository and live global entries match. Use this
only when the operator explicitly asks for live-first workflow changes. The
closeout must name it as `live-global rebaseline`, show source/live parity, and
run package or temporary `CODEX_HOME` validation before any commit.

For workflow policy changes, update `docs/routing-matrix.md` so
Direct skill discovery and professional perspectives (`code-quality`, `decide`, `review`, `verify`),
and closeout guidance stay aligned. For mixed code/docs changes, update docs
after behavior and review are proven so documentation follows current truth.

## Package And CLI Coordination

The durable public concept is **host-native plugin delivery**, plus optional
managed CLI setup for doctor and migration. Keep docs honest:

- use marketplace-first language for Codex and Claude Code
- describe Cursor as local copy / Team Import until its public listing is verified
- describe OpenCode as an independent npm package plus vendored fallback; label registry availability unverified until `npm view` succeeds
- demote `do-it setup` / GitHub tarball + setup to optional/legacy
- mention `npm install -g @tdwhere/do-it` only as the registry path after
  registry publication is verified
- use `npm exec --package . -- do-it setup` for checkout-local doctor /
  migration examples when the package surface is present
- keep `do-it install` and `do-it doctor` documented as the underlying split
  commands for CI, debugging, or partial checks
- do not require pairing Codex plugin install with global setup for hooks
- keep user-defined `~/.codex/agents` separate from plugin-owned bundled agents
- do not invent package.json scripts or release coordinates that are not present
- make future package commands delegate to the same installer and doctor logic

Current validation commands:

```bash
npm test
npm run validate:agents
npm run validate:core-skill-boundaries
npm run validate:skill-contracts
npm run eval:behavior:validate
npm run build:claude-agents
npm run build:codex-plugin
npm exec --package . -- do-it setup
npm exec --package . -- do-it install
npm exec --package . -- do-it doctor
CODEX_HOME=/tmp/do-it-codex-test npm exec --package . -- do-it setup
CODEX_HOME=/tmp/do-it-codex-test npm exec --package . -- do-it doctor
CLAUDE_PLUGIN_ROOT_OVERRIDE=/tmp/do-it-claude-test npm exec --package . -- do-it setup --target=claude
./install/install.sh
./install/doctor.sh
CODEX_HOME=/tmp/do-it-codex-test ./install/install.sh
CODEX_HOME=/tmp/do-it-codex-test ./install/doctor.sh
CODEX_HOME=/tmp/do-it-plugin-test codex plugin marketplace add /path/to/do-it
CODEX_HOME=/tmp/do-it-plugin-test codex plugin add do-it@tdwhere-do-it
```

After registry publication, also validate the public global path:

```bash
npm install -g @tdwhere/do-it
do-it setup
```

Do not add lifecycle scripts that install into `~/.codex` automatically during
`npm install`. Installation should be an explicit operator command.

The installer records `.do-it-install-state.json` in the target `CODEX_HOME` so
future installs can distinguish do-it-managed files from user-owned files. It
refuses to overwrite unmarked skill or agent targets unless `DO_IT_FORCE=1` is
set.

Install copies are staged before live targets are changed. Managed replacements
use temporary siblings and backups so a copy failure does not remove the
previous live target.

`doctor` treats a missing, malformed, version-mismatched, or stale install
state file as drift. A clean file copy is not enough when the state marker that
protects future upgrades is missing. Therefore run ordinary `doctor` only for a
managed CLI install/setup; verify Cursor local-copy installs by exact directory,
plugin metadata, and Hooks UI inspection after reload.

## Host Capability Matrix

See [harness-adapter-matrix.md](./harness-adapter-matrix.md) for current context,
check, specialist, and diagnostic wiring. Generated host skills and hooks share
sources; maintained adapter TS and Pi host-specific agents are source exceptions.

## Safe Cleanup Runbook

Cleanup is host-owned and exact-path only. Back up any shared JSON before editing;
never delete an entire `~/.codex`, `~/.claude`, `~/.cursor`, `~/.kimi-code`,
project config, or plugin directory tree just to remove do-it.

| Host / install path | Safe cleanup |
| --- | --- |
| Codex marketplace | Remove only `do-it@tdwhere-do-it` through Codex's plugin manager. Keep the marketplace registration if other plugins use it; otherwise remove only the `tdwhere-do-it` registration through that manager. Inspect `/hooks` afterward. Do not recursively delete `CODEX_HOME`. |
| Claude Code marketplace | Remove only `do-it@do-it` through `/plugin` management. Remove the marketplace registration only when no other installed entry depends on it. Do not recursively delete `~/.claude`. |
| Cursor local copy | Close Cursor, back up `~/.cursor/hooks.json`, remove only hook objects whose `command` path contains `do-it-cursor/hooks/`, and then remove exactly `~/.cursor/plugins/local/do-it-cursor`. On native Windows use the corresponding `%USERPROFILE%\.cursor\...` paths; on WSL clean only the caller's mirrored profile. Reload and confirm the do-it entries disappeared while unrelated hooks remain. |
| Cursor Team Import | Remove the imported do-it plugin in the Team dashboard. If a local copy was also installed, clean it separately with the preceding row; do not delete all team plugins. |
| OpenCode local registration | Back up the applicable project or user `opencode.json`, remove only the do-it absolute-path entry from its `"plugin"` array, restart OpenCode, and confirm unrelated entries still load. Do not delete the project config or the checkout. |
| Pi package | Use `pi remove` with the exact local or `npm:@tdwhere/do-it-pi` package source, then `/reload`. Remove only `~/.pi/agent/do-it-data/` if its session state is no longer needed. `pi-subagents` is independent; do not remove it when other package agents use it. |
| Kimi Code plugin | `/plugins remove do-it` (deletes the install record only). The managed copy stays on disk by host design: remove exactly `$KIMI_CODE_HOME/plugins/managed/do-it/` by hand, then `/reload`. Session state under `$KIMI_CODE_HOME/do-it-data/` is do-it-owned and safe to delete. Do not delete the whole `~/.kimi-code`. |
| Managed CLI setup | There is no broad uninstall command. Use the target's `.do-it-install-state*.json` as an ownership inventory and remove only entries proven do-it-managed; preserve unmarked/user-owned files. Prefer testing and abandoning a temporary home over manually cleaning a shared live home. |

If ownership is unclear, stop and restore the backup rather than using a glob,
recursive home-directory deletion, or `DO_IT_FORCE=1` as cleanup.

For Codex legacy migration, compare against the known do-it-managed inventory
and remove only confirmed stale do-it duplicates. `~/.codex/agents` is otherwise
user-owned; never use a broad agent-directory cleanup to make plugin state look
tidy.

Deprecated legacy skill targets use the same safety rule: install removes them
only when they are marked as do-it-managed in the state file or when
`DO_IT_FORCE=1` is set. The manifest may also list exact `legacyHashes` for the
previous repo-managed bundle so a default upgrade can remove unmodified legacy
targets even though the old installer did not write state. Otherwise install
stops and `doctor` reports the deprecated target as drift.

## Updating A Managed Skill

Edit the owner under skills/do-it/. Keep its trigger succinct, its professional
judgment distinctive, and its necessary permission or ownership boundaries
precise. Model-selected methods need no tier, compulsory sequence, report grammar,
or fixed review/agent count. Use do-it-skill-authoring for useful guidance.
Update affected descriptions, manifests, references, translated docs, and generated
copies. Check relevant behavior and installation consistency. Reuse upstream ideas
through original do-it guidance rather than copying their workflow machinery.

## Adding A New Skill

1. Create a new directory under `skills/do-it/` for installed do-it-native
   skills, or `skills/custom/` for local experiments that are not installed by
   default.
2. Add a `skills[]` entry to `manifest.json` for installed skills.
3. Keep the install target name unique to avoid collisions.
4. Update `docs/routing-matrix.md` if the skill changes routing policy.
5. Update `docs/upstream-map.md` if the skill absorbs outside workflow logic.

## Adding Or Updating Agents

1. Add or edit the `.toml` file under `agents/`.
2. Add or update the matching `agents[]` entry in `manifest.json` only when
   inventory changes are in scope.
3. Keep descriptions in do-it terminology.
4. Keep instructions token-conscious: say what capability is useful, when it is
   useful, and what compact result helps the parent. Add only the boundaries the
   slice actually needs.
5. Verify the agent file does not include machine-specific paths, secrets, or
   runtime-only assumptions.
6. Keep Codex TOML schema-clean and model-agnostic. Supported top-level keys
   are `name`, `description`, `sandbox_mode`, and `developer_instructions`.
   Do not add concrete model names, `model_reasoning_effort`, `output_budget`,
   `claude_model`, or other host-private fields. Host adapters inherit or map
   model policy outside the portable agent template.
7. Update `docs/routing-matrix.md` if the agent changes default planning,
   implementation, review, or closeout flow.

Review coverage should stay risk-budgeted, not fixed. Keep specialist reviewers
available for correctness, scope, maintainability / YAGNI, and adversarial
failure modes, but let the parent choose only the views that improve the task.

Bundled agents are optional capability experts, not a contract pipeline. The
parent gives a worker the goal plus any necessary write or side-effect boundary;
the worker inspects autonomously, returns useful evidence or uncertainty, and
the parent integrates the result. Do not require a fixed field checklist, agent
count, or role matrix.

## Claude Code Target

The manifest and hooks/hooks.json own the shipped skill, command, context, and
edit-check inventory. Optional strict external actions remain configured there.
Profile injection, learning events, classifiers, and completion gates are retired.

### Maintaining the Claude Target

- **Skill change:** edit `skills/do-it/<name>/SKILL.md`. Both targets pick up
  the change. The frontmatter `description` should start with trigger-first
  `Use when...` wording so Codex plugin discovery and Claude implicit-summon
  both see the activation condition. Keep the existing Problem/Fix body content
  below the frontmatter when it is still useful.
- **Agent change:** edit `agents/<name>.toml`. The next install (or
  `npm run build:claude-agents`) regenerates the Claude `.md` form.
- **Model policy change:** keep source agents host-owned and model-agnostic.
  Do not add concrete model names, `model`, `model_reasoning_effort`,
  `claude_model`, `output_budget`, or other host-private policy to
  `agents/*.toml`. Claude generated agents omit `model:` by default and inherit
  the running host model; only use a uniform `model: inherit` compatibility
  fallback if a tested Claude Code version requires the field.
- **Hook keyword change:** edit `hooks/data/*.tsv` and keep
  `hooks/data/SCHEMA.md` aligned. End users extend known tables through the
  data-only `<cwd>/.do-it/keywords.local.tsv` format documented there. The
  legacy executable `.do-it/keywords.local.sh` path is ignored. Numeric
  hook limits (e.g. `file-size` thresholds) are overridden through the
  data-only `<git-root of edited file>/.do-it/write-quality.local.tsv`,
  also documented in `hooks/data/SCHEMA.md`.
- **Hook behavior change:** edit the relevant `hooks/*.sh`. Hook scripts must
  remain portable bash with no nonstandard runtime dependency and degrade
  silently (exit 0) on unexpected input.

## Cursor Plugin Target

As of 0.13.0, do-it ships a Cursor plugin alongside Codex and Claude. Skill and
agent sources remain `skills/do-it/*/SKILL.md` and `agents/*.toml`. The Cursor
target installs the **full** skill inventory (`ALL_SKILLS`) and adds:

- `plugins/do-it-cursor/.cursor-plugin/plugin.json` — plugin metadata for
  local path install (`~/.cursor/plugins/local/do-it-cursor`), Team Import from
  Repo, public marketplace when listed, and `do-it setup --target=cursor`.
- `plugins/do-it-cursor/skills/` — generated from **`ALL_SKILLS`** in
  `scripts/skill-tiers.mjs` (core + extended), including shared `references/`
  and the skills index via extras.
- `plugins/do-it-cursor/agents/` — generated agent bundle for the Cursor host.
- `plugins/do-it-cursor/hooks/` — Cursor event mapping (`sessionStart`,
  `beforeSubmitPrompt`, `postToolUse`/`afterFileEdit`, `stop`). No
  `grill-pretool` / `preToolUse` plan gate.
- `scripts/build-cursor-plugin.mjs` — the only supported way to refresh the
  generated Cursor bundle; both local copy and managed CLI setup install the
  full twelve-skill bundle.

### Maintaining the Cursor Target

- **Core vs extended change:** edit `scripts/skill-tiers.mjs` and keep
  `manifest.skillTiers` in sync, then run `npm run build:cursor-plugin`.
- **Inventory or wording change:** edit source under `skills/do-it/` or
  `agents/`, then run `npm run build:cursor-plugin`. Do not hand-edit
  `plugins/do-it-cursor/skills/` or `plugins/do-it-cursor/agents/`.
- **Hook change:** edit kernel scripts under `hooks/` and Cursor mapping under
  `install/cursor-hooks.json`; regenerate with `npm run build:cursor-plugin`.
- **Install verification:** for `npm run install:cursor-local`, confirm all twelve
  skill directories plus generated discovery/reference files land under
  `~/.cursor/plugins/local/do-it-cursor` as a **real directory**, Reload Window,
  and inspect Customize → Hooks for do-it `.cmd` entries. Do not run ordinary
  `doctor` for this standalone copy because it has no managed install state. For
  `do-it setup --target=cursor` / `CURSOR_PLUGIN_ROOT_OVERRIDE=…`, `setup` runs
  managed install plus doctor; later `do-it doctor --target=cursor` is valid.

## OpenCode Plugin Target

As of 0.13.0, do-it also ships an OpenCode TypeScript plugin. It shares the
same skill and agent sources but maps hooks through OpenCode events instead of
Claude/Codex shell hooks.

- `plugins/do-it-opencode/` — generated skills, agents, and TS plugin bridge.
- `scripts/build-opencode-plugin.mjs` — the only supported way to refresh the
  OpenCode bundle.
- Operators may need to register the plugin manually in project or user
  `opencode.json` — see
  [`plugins/do-it-opencode/docs/README.opencode.md`](../plugins/do-it-opencode/docs/README.opencode.md)
  and [`skills/do-it/references/host-opencode.md`](../skills/do-it/references/host-opencode.md).
  Medium hook depth: transform bootstrap, `tool.execute.after` write-quality,
  `session.idle` soft verification (no `grill-pretool`).

### Maintaining the OpenCode Target

- **Inventory or wording change:** edit source skills/agents, then run
  `npm run build:opencode-plugin`.
- **Hook bridge change:** edit `plugins/do-it-opencode/` sources and kernel
  scripts under `hooks/`; rerun `npm run build:opencode-plugin &&
  npm run test-opencode`.
- **Install verification:** `npm run build:opencode-plugin && npm run
  test-opencode` (no CLI doctor target yet).

## Codex Plugin Target

As of the Codex plugin v1 line, the repo also exposes a Codex marketplace
surface generated from the same maintained manifest:

- `.agents/plugins/marketplace.json` — repo-local marketplace entry pointing
  `do-it` at `./plugins/do-it`.
- `plugins/do-it/.codex-plugin/plugin.json` — plugin metadata with version
  parity to `package.json`.
- `plugins/do-it/skills/` — generated from every `manifest.skills[]` entry.
- `plugins/do-it/agents/` — generated from every `manifest.agents[]` entry.
- `scripts/build-codex-plugin.mjs` — the only supported way to refresh the
  generated plugin bundle.

### Maintaining The Codex Plugin Target

- **Inventory change:** update `manifest.json`, then run
  `npm run build:codex-plugin` and `npm run validate:agents`, then commit the
  generated marketplace/plugin changes.
- **Version change:** update `package.json` and `manifest.json` together; the
  Codex plugin build fails if they drift.
- **Skill wording change:** edit source skills under `skills/do-it/`, then
  regenerate. Do not edit `plugins/do-it/skills/` directly.
- **Agent change:** edit `agents/*.toml`, then regenerate. Do not merge Claude
  `.md` generation into the Codex plugin build.
- **Hook change:** ship hooks inside the Codex plugin bundle and document trust
  under `/hooks`. Global CLI setup remains optional for doctor / migration —
  do not treat `plugin_hooks=false` as a reason to require paired global setup.

Generated artifact rules:

- Do not hand-edit `plugins/do-it/skills/`, `plugins/do-it/agents/`,
  `plugins/do-it/.codex-plugin/plugin.json`, `.agents/plugins/marketplace.json`,
  `plugins/do-it-cursor/skills/`, `plugins/do-it-cursor/agents/`,
  `plugins/do-it-opencode/skills/`, `plugins/do-it-opencode/agents/`,
  `dist/claude/agents/`, or `dist/claude/skills/_index.md`.
- Skill source is `skills/do-it/`; Codex plugin output is regenerated with
  `npm run build:codex-plugin`.
- Claude agent output is regenerated with `npm run build:claude-agents`.
- Cursor plugin output is regenerated with `npm run build:cursor-plugin`.
- OpenCode plugin output is regenerated with `npm run build:opencode-plugin`.
- The lazy skill index is regenerated by install preflight or
  `node scripts/build-skills-index.mjs`; package/install checks should catch
  stale generated inventory.
- If generated output differs after a source edit, commit the generated result
  alongside the source change and name the generator command in closeout.

### Adding a target

1. Add a target entry under `manifest.targets.<name>` with `rootEnv`,
   `rootDefault`, `stateFile`, `agentSourceFrom`, `agentSourceExt`,
   `agentTargetExt`, `extras`, and `preInstall`.
2. If the host needs new top-level files (e.g. plugin metadata), list them
   in `extras`.
3. Verify with `<rootEnv>=/tmp/<name>-test do-it install --target=<name>`
   followed by the matching doctor invocation.

### Verification

```bash
git diff --check
npm test
npm run validate:agents
npm run build:claude-agents
# Codex (default): byte-equal with prior versions except for deprecated/optional skills
CODEX_HOME=/tmp/cx do-it install
diff -r --exclude='.do-it-install-state*' /tmp/cx /tmp/cx-old   # against worktree of v0.3.x

# Claude target
CLAUDE_PLUGIN_ROOT_OVERRIDE=/tmp/cl do-it setup --target=claude

# Optional skills opt-in
CLAUDE_PLUGIN_ROOT_OVERRIDE=/tmp/cl-full do-it install --target=claude --with-optional
```

### State files

Each target has its own state file under the install root (configured via
`manifest.targets.<name>.stateFile`):

- `~/.codex/.do-it-install-state.json` — codex (unchanged from 0.3.x)
- `~/.claude/.do-it-install-state-claude.json` — claude

This avoids state collisions when both targets are installed on the same machine.

## Delegated Agent Maintenance

Agent descriptions should make clear what expertise a subagent contributes, not
encode a parent workflow. When adding or changing an agent:

- state the capability, the useful trigger, and the compact result it returns;
- keep its write permissions narrow;
- require it to inspect current truth before acting;
- require verification evidence when it edits files;
- ask for failure-mode coverage, path-map evidence when applicable, and residual risk;
- remind implementation agents that the parent owns integration and final
  claims.

The parent gives each worker only the goal and necessary boundary context;
`subagent-stance` reinforces autonomous work and parent integration. Do not add
fixed contract fields or refusal behavior. `scripts/validate-agent-bundle.mjs`
still protects portable bundle integrity and model-agnostic policy.

## Verification

Recommended checks before committing workflow changes. For live-first rebaseline, run the source/live parity check before these commands:

```bash
git diff --check
npm test
npm run validate:agents
npm run validate:core-skill-boundaries
npm run validate:skill-contracts
npm run eval:behavior:validate
npm run build:claude-agents
npm run build:codex-plugin
CODEX_HOME=/tmp/do-it-codex-test ./install/install.sh
CODEX_HOME=/tmp/do-it-codex-test ./install/doctor.sh
CODEX_HOME=/tmp/do-it-plugin-test codex plugin marketplace add /path/to/do-it
CODEX_HOME=/tmp/do-it-plugin-test codex plugin add do-it@tdwhere-do-it
CLAUDE_PLUGIN_ROOT_OVERRIDE=/tmp/do-it-claude-test npm exec --package . -- do-it setup --target=claude
npm run validate:release -- vX.Y.Z
npm run smoke:package
```

Also run targeted sweeps for stale references after substantial rewrites, for
example old project names, obsolete save paths, deleted support files, or
commands that belong to an adapter instead of the Codex-first workflow.
