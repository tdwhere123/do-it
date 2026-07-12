# Maintenance Guide

## Source Of Truth

This repository is the maintained source of truth for the do-it workflow
distribution. The live `~/.codex` copy is an install target, not the place to
make durable edits.

Working rule:

1. Edit the maintained repository copy.
2. Prefer plugin marketplace install on each host. Optional: deploy with
   `do-it setup` (or `npm exec --package . -- do-it setup`) for doctor /
   migration. `./install/install.sh` remains for legacy/compat workflows.
3. Validate with `do-it doctor` (or `./install/doctor.sh` for legacy/compat).
4. Avoid hand-editing deployed files under `~/.codex`.

Exception: for an intentional live-global rebaseline, copy only
manifest-managed targets from `~/.codex` back into this repository, then run the
doctor command to prove the repository and live global entries match. Use this
only when the operator explicitly asks for live-first workflow changes. The
closeout must name it as `live-global rebaseline`, show source/live parity, and
run package or temporary `CODEX_HOME` validation before any commit.

For workflow policy changes, update `docs/routing-matrix.md` so
`do-it-router`, meaning buckets (`code-quality`, `decide`, `review`, `verify`),
and closeout guidance stay aligned. For mixed code/docs changes, update docs
after behavior and review are proven so documentation follows current truth.

## Package And CLI Coordination

The durable public concept is **plugin marketplace install** on each host, plus
optional CLI setup for doctor and migration. Keep docs stable:

- use plugin marketplace as the primary public install path for Codex, Claude,
  Cursor, and OpenCode
- demote `do-it setup` / GitHub tarball + setup to optional/legacy
- mention `npm install -g @tdwhere/do-it` only as the registry path after
  registry publication is verified
- use `npm exec --package . -- do-it setup` for checkout-local doctor /
  migration examples when the package surface is present
- keep `do-it install` and `do-it doctor` documented as the underlying split
  commands for CI, debugging, or partial checks
- do not require pairing Codex plugin install with global setup for hooks
- do not invent package.json scripts or release coordinates that are not present
- make future package commands delegate to the same installer and doctor logic

Current validation commands:

```bash
npm test
npm run validate:agents
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
protects future upgrades is missing.

## Host Capability Matrix

| Host surface | Skills | Agents | Commands | Hooks | Doctor | Verification command |
|---|---|---|---|---|---|---|
| Codex plugin marketplace | Generated under `plugins/do-it/skills/` | Generated under `plugins/do-it/agents/` | None | Plugin hooks (trust under `/hooks`) | Optional via CLI | `npm run build:codex-plugin` and `CODEX_HOME=/tmp/do-it-plugin-test codex plugin marketplace add /path/to/do-it` then `codex plugin add do-it@tdwhere-do-it` |
| Codex CLI setup (legacy) | Managed from `manifest.json` | TOML from `agents/` | CLI `do-it` | Root `hooks.json` plus do-it-managed files under `hooks/` | Default target | `CODEX_HOME=/tmp/do-it-codex-test npm exec --package . -- do-it setup` |
| Claude Code plugin | Same maintained `skills/do-it/` source | Generated Markdown under `dist/claude/agents/` | `commands/` | Do-it-managed files under `hooks/`, including `hooks/hooks.json` | `--target=claude` | `CLAUDE_PLUGIN_ROOT_OVERRIDE=/tmp/do-it-claude-test npm exec --package . -- do-it setup --target=claude` |
| Cursor plugin | Full 8 from `ALL_SKILLS` under `plugins/do-it-cursor/skills/` (+ `references/`) | Generated under `plugins/do-it-cursor/agents/` | None | Medium: `sessionStart`, `beforeSubmitPrompt`, `postToolUse`/`afterFileEdit`, `stop` (no `grill-pretool`) | `--target=cursor` | `npm run install:cursor-local` (real copy under `~/.cursor/plugins/local/`) or `do-it setup --target=cursor`; Reload Window |
| OpenCode plugin | Generated under `plugins/do-it-opencode/skills/` | Generated under `plugins/do-it-opencode/agents/` | None | Medium-Light: transform bootstrap, `tool.execute.after`, `session.idle` soft reminder | No CLI doctor | `npm run build:opencode-plugin && npm run test-opencode` (manual `opencode.json` registration may be required) |

Deprecated legacy skill targets use the same safety rule: install removes them
only when they are marked as do-it-managed in the state file or when
`DO_IT_FORCE=1` is set. The manifest may also list exact `legacyHashes` for the
previous repo-managed bundle so a default upgrade can remove unmodified legacy
targets even though the old installer did not write state. Otherwise install
stops and `doctor` reports the deprecated target as drift.

## Updating A Managed Skill

When a skill changes, decide which kind of update it is:

- do-it rewrite
- do-it compatibility adapter that preserves a workflow idea while changing the
  installed name and wording
- optional auxiliary support that is installed but not part of the default tier
  flow (no skills are currently marked optional)

For either kind:

1. Edit the maintained copy under `skills/`.
2. Remove stale support files if the rewritten skill no longer references them.
3. Update `docs/routing-matrix.md` when routing, failure-mode forecasting, path maps, stack depth, readiness labels, prevention records, or closeout gates
   change.
4. Update `docs/upstream-map.md` when origin notes, adapter status, or rewrite
   status changes.
5. Update `manifest.json` when inventory, source paths, or install targets
   change.
6. Run the doctor command or test against a temporary `CODEX_HOME`.

External workflow material is reference material, not truth. Absorb useful
logic by rewriting it into do-it-native skills. Do not copy stale tool
assumptions, mode assumptions, platform assumptions, or repo-path assumptions
into installed skills.

External workflow absorption rules:

- Start from the source idea, not the source wording.
- Keep do-it public names: Router, Light / Standard / Heavy, meaning buckets
  (`code-quality`, `decide`, `review`, `verify`), handbook, context, and
  skill-authoring.
- Map every absorbed idea in `docs/upstream-map.md` as `source idea -> do-it
  destination -> absorbed shape`.
- Treat external docs, search results, old reports, and memory as untrusted
  context until checked against current repo files and commands.
- If the idea changes a dependency, framework, datastore, protocol, install
  target, or public workflow promise, run the research-first path in
  `do-it-decide` before implementation.
- Do not paste upstream SKILL.md sections into this repository. Rewrite the
  operating rule in do-it style and keep host-specific claims out unless this
  repo ships and verifies that host surface.

Skill anatomy checklist for installed do-it skills:

- frontmatter has `name` and a trigger-first `description` beginning with
  `Use when...`;
- the body states the purpose and activation surface;
- Light / Standard / Heavy behavior is present, or the skill has another
  explicit process shape where tiers do not fit;
- stop conditions say when to ask, return `BLOCKED`, return `Needs more
  evidence`, or reroute;
- common rationalizations, red flags, review rules, failure handling, or
  equivalent do-it-native anti-skip rules are present;
- verification states the evidence required before claiming the skill's work;
- external source ideas are rewritten and mapped, not vendored.

The old workflow source directories may be used temporarily during a rewrite,
but the public package should install only do-it-native names. If a temporary
source directory is kept in the repository, it must be excluded from package
files and documented as source-only. Prefer deleting it after the rewrite map
has been verified.

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
4. Keep instructions token-conscious: exact scope, exact files, minimal useful
   review stack, and explicit stop conditions.
5. Verify the agent file does not include machine-specific paths, secrets, or
   runtime-only assumptions.
6. Keep Codex TOML schema-clean and model-agnostic. Supported top-level keys
   are `name`, `description`, `sandbox_mode`, and `developer_instructions`.
   Do not add concrete model names, `model_reasoning_effort`, `output_budget`,
   `claude_model`, or other host-private fields. Host adapters inherit or map
   model policy outside the portable agent template.
7. Update `docs/routing-matrix.md` if the agent changes default planning,
   implementation, review, or closeout flow.

Review coverage should stay explicit and risk-budgeted. Keep dedicated
read-only reviewer agents for correctness, scope compliance, maintainability /
YAGNI, and red-team, but do not run all of them for every change. Writer
specialists can support drills or fixes, but they should not be counted as the
only Heavy review lens unless the parent explicitly scopes them as read-only and
the report satisfies the review schema.

Each agent should keep the subagent tier contract explicit:

- default delegated implementation is a `Standard` do-it slice;
- `Light` is allowed only for tightly bounded mechanical checks;
- `Heavy` requires explicit parent assignment;
- if unassigned Heavy work is required, the agent stops with
  `BLOCKED: requires heavy escalation` and evidence.

## Claude Code Target

As of 0.4.0, do-it ships a Claude Code plugin alongside the Codex install. Both
targets use the same `manifest.json`, the same `skills/do-it/*/SKILL.md`, and
the same `agents/*.toml` source-of-truth. The Claude target adds:

- `.claude-plugin/plugin.json` and `marketplace.json` — plugin metadata for
  `/plugin marketplace add tdwhere123/do-it` then `/plugin install do-it@do-it`.
- `hooks/hooks.json` and hook scripts (`router.sh`, `grill-prompt.sh`,
  `subagent-stance.sh`, `write-quality-lint.sh`, `verification-gate.sh`) — wire
  UserPromptSubmit / PostToolUse / Stop without slash commands. `grill-pretool`
  is not registered.
- `commands/do-it-skip.md` — the only slash command, an explicit escape hatch.
- `dist/claude/agents/*.md` — generated by `scripts/build-claude-agents.mjs`
  from `agents/*.toml`. The build runs automatically before
  `do-it install --target=claude` and on `npm pack` / `npm publish` (via
  `prepack`).

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
  `hooks/data/SCHEMA.md` aligned. End users override locally via
  `<cwd>/.do-it/keywords.local.sh` (sourced after defaults).
- **Hook behavior change:** edit the relevant `hooks/*.sh`. Hook scripts must
  remain bash, jq-only, and degrade silently (exit 0) on unexpected input.

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
  generated Cursor bundle (`do-it setup --target=cursor` also filters to core
  skills at install time).

### Maintaining the Cursor Target

- **Core vs extended change:** edit `scripts/skill-tiers.mjs` and keep
  `manifest.skillTiers` in sync, then run `npm run build:cursor-plugin`.
- **Inventory or wording change:** edit source under `skills/do-it/` or
  `agents/`, then run `npm run build:cursor-plugin`. Do not hand-edit
  `plugins/do-it-cursor/skills/` or `plugins/do-it-cursor/agents/`.
- **Hook change:** edit kernel scripts under `hooks/` and Cursor mapping under
  `install/cursor-hooks.json`; regenerate with `npm run build:cursor-plugin`.
- **Install verification:** run `npm run install:cursor-local` (or
  `do-it setup --target=cursor` / `CURSOR_PLUGIN_ROOT_OVERRIDE=…`), then
  `do-it doctor --target=cursor`. Confirm all eight skill directories (plus
  `references/`) land under `~/.cursor/plugins/local/do-it-cursor` as a **real
  directory** (not an external symlink). Reload Window after install — Cursor
  does not use Claude `/plugin` slash commands.

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

Agent descriptions should make clear that subagents run a do-it slice, not an
unstructured side quest. When adding or changing an agent:

- state whether it is a mapper, drill, reviewer, specialist, or implementer;
- keep its write permissions narrow;
- require it to inspect current truth before acting;
- require verification evidence when it edits files;
- require failure-mode coverage, path-map evidence when applicable, and residual risk in the return shape;
- remind implementation agents that the parent owns integration and final
  claims.

The delegated prompt contract belongs in the parent agent (plain-text slice
contract + `subagent-stance` hook) and should be reflected in agent
descriptions when practical: tier, scope, write ownership, forbidden paths,
current truth, must-verify facts, stop condition, and return schema.

## Verification

Recommended checks before committing workflow changes. For live-first rebaseline, run the source/live parity check before these commands:

```bash
git diff --check
npm test
npm run validate:agents
npm run build:claude-agents
npm run build:codex-plugin
CODEX_HOME=/tmp/do-it-codex-test ./install/install.sh
CODEX_HOME=/tmp/do-it-codex-test ./install/doctor.sh
CODEX_HOME=/tmp/do-it-plugin-test codex plugin marketplace add /path/to/do-it
CODEX_HOME=/tmp/do-it-plugin-test codex plugin add do-it@tdwhere-do-it
CLAUDE_PLUGIN_ROOT_OVERRIDE=/tmp/do-it-claude-test npm exec --package . -- do-it setup --target=claude
npm pack --dry-run --json
```

Also run targeted sweeps for stale references after substantial rewrites, for
example old project names, obsolete save paths, deleted support files, or
commands that belong to an adapter instead of the Codex-first workflow.
