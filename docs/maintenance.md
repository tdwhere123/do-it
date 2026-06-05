# Maintenance Guide

## Source Of Truth

This repository is the maintained source of truth for the do-it workflow
distribution. The live `~/.codex` copy is an install target, not the place to
make durable edits.

Working rule:

1. Edit the maintained repository copy.
2. Deploy it with `./install/install.sh`.
3. Validate it with `./install/doctor.sh`.
4. Avoid hand-editing deployed files under `~/.codex`.

Exception: for an intentional live-global rebaseline, copy only
manifest-managed targets from `~/.codex` back into this repository, then run the
doctor command to prove the repository and live global entries match. Use this
only when the operator explicitly asks for live-first workflow changes. The
closeout must name it as `live-global rebaseline`, show source/live parity, and
run package or temporary `CODEX_HOME` validation before any commit.

For workflow policy changes, update `docs/routing-matrix.md` so
`do-it-router`, the three-tier routing model, planning, slicing, drills,
implementation, review, fix-loop, verification, and closeout guidance stay
aligned. For mixed code/docs changes, update docs after behavior and review are
proven so documentation follows current truth.

## Package And CLI Coordination

The durable public concept is explicit installation through the `do-it` CLI,
plus optional plugin marketplace discovery where the host supports it. Current
package work exposes a `do-it` bin and local package scripts. Keep docs stable:

- use the GitHub tarball install followed by `do-it setup` as the currently
  verified public terminal path
- mention `npm install -g @tdwhere/do-it` only as the registry path after
  registry publication is verified
- use `npm exec --package . -- do-it setup` for checkout-local package examples
  when the package surface is present
- keep `do-it install` and `do-it doctor` documented as the underlying split
  commands for CI, debugging, or partial checks
- keep Codex plugin marketplace instructions paired with global setup when
  the user needs enforced automatic hooks
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
| Codex global setup | Managed from `manifest.json` | TOML from `agents/` | CLI `do-it` | Enforced through root `hooks.json` plus do-it-managed files under `hooks/` | Default target | `CODEX_HOME=/tmp/do-it-codex-test npm exec --package . -- do-it setup` |
| Codex plugin marketplace | Generated under `plugins/do-it/skills/` | Generated under `plugins/do-it/agents/` | None | Do not rely on plugin hooks while `plugin_hooks=false` | None; use global setup for doctor | `npm run build:codex-plugin` and `CODEX_HOME=/tmp/do-it-plugin-test codex plugin marketplace add /path/to/do-it` |
| Claude Code plugin | Same maintained `skills/do-it/` source | Generated Markdown under `dist/claude/agents/` | `commands/` | Do-it-managed files under `hooks/`, including `hooks/hooks.json` | `--target=claude` | `CLAUDE_PLUGIN_ROOT_OVERRIDE=/tmp/do-it-claude-test npm exec --package . -- do-it setup --target=claude` |

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
  flow (no skills are marked optional in 0.11.0)

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
- Keep do-it public names: Router, Light / Standard / Heavy, grill, planning,
  slicing, drills, review-loop, fix-loop, verification-gate, and closeout.
- Map every absorbed idea in `docs/upstream-map.md` as `source idea -> do-it
  destination -> absorbed shape`.
- Treat external docs, search results, old reports, and memory as untrusted
  context until checked against current repo files and commands.
- If the idea changes a dependency, framework, datastore, protocol, install
  target, or public workflow promise, run the research-first path in
  `do-it-planning` before implementation.
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
read-only reviewer agents for correctness, scope compliance, maintainability,
architecture, red-team, domain-language, skill-quality, and install/release
readiness, but do not run all of them for every change. Writer
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
  `/plugin marketplace add tdwhere123/do-it` then `/plugin install
  do-it`.
- `hooks/hooks.json` and four hook scripts (`router.sh`, `grill-prompt.sh`,
  `grill-pretool.sh`, `verification-gate.sh`) — wire UserPromptSubmit /
  PreToolUse / Stop into router, grill, and verification-gate without slash
  commands.
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
- **Hook change:** keep Codex global hook enforcement in the CLI setup path.
  Plugin-local hooks are not a v1 enforcement promise while
  `plugin_hooks=false`.

Generated artifact rules:

- Do not hand-edit `plugins/do-it/skills/`, `plugins/do-it/agents/`,
  `plugins/do-it/.codex-plugin/plugin.json`, `.agents/plugins/marketplace.json`,
  `dist/claude/agents/`, or `dist/claude/skills/_index.md`.
- Skill source is `skills/do-it/`; Codex plugin output is regenerated with
  `npm run build:codex-plugin`.
- Claude agent output is regenerated with `npm run build:claude-agents`.
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

The delegated prompt contract belongs in `do-it-subagent-orchestration` and
should be reflected in agent descriptions when practical: tier, scope, write
ownership, forbidden paths, current truth, must-verify facts, stop condition,
and return schema.

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
CLAUDE_PLUGIN_ROOT_OVERRIDE=/tmp/do-it-claude-test npm exec --package . -- do-it setup --target=claude
npm pack --dry-run --json
```

Also run targeted sweeps for stale references after substantial rewrites, for
example old project names, obsolete save paths, deleted support files, or
commands that belong to an adapter instead of the Codex-first workflow.
