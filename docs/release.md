# Release Notes

This workflow bundle ships plugin-first through four host surfaces plus an
optional CLI setup path:

1. Codex plugin marketplace — skills, agents, and plugin hooks (trust under
   `/hooks`).
2. Claude Code plugin marketplace — Claude-native hooks, commands, and
   generated agents.
3. Cursor plugin marketplace (`plugins/do-it-cursor/`) — medium-depth hooks.
4. OpenCode TypeScript plugin (`plugins/do-it-opencode/`) — registered through
   `opencode.json`, with per-message routing and selective bash bridges.
5. Optional / legacy: `do-it setup` for doctor, temp-home smoke, and migration
   from older global installs.

## Baseline

- `2026-07-12` (`0.14.0`): meaning-centric skill buckets — `do-it-router`,
  `do-it-code-quality`, `do-it-review`, `do-it-decide`, `do-it-verify`, plus
  `do-it-handbook` / `do-it-context` / `do-it-skill-authoring`. Agents reduced
  to 10. Plugin-first install; `grill-pretool` removed; `grill-prompt`
  Heavy-only. See [`CHANGELOG.md`](../CHANGELOG.md).
- `2026-04-24`: earlier do-it rewrite installed a larger process-skill set
  (planning, grill, review-loop, …). Those names are deleted in `0.14.0`; use
  the migration table in the changelog.

## Install Surface (plugin-first)

```bash
# Codex
codex plugin marketplace add tdwhere123/do-it
codex plugin add do-it@tdwhere-do-it
# then trust plugin hooks under /hooks

# Claude Code
# /plugin marketplace add tdwhere123/do-it && /plugin install do-it@do-it

# Cursor — no Claude /plugin commands; symlink plugins/do-it-cursor to
# ~/.cursor/plugins/local/do-it-cursor (or do-it setup --target=cursor), then Reload Window
# Team Import from Repo / public marketplace when listed

# OpenCode — local path in opencode.json (see plugins/do-it-opencode/docs/README.opencode.md)
# npm @tdwhere/do-it-opencode when published
```

Optional CLI (legacy / doctor / migration):

```bash
npm install -g https://github.com/tdwhere123/do-it/archive/refs/heads/main.tar.gz
do-it setup
```

After npm registry publication, the registry path may also be used:

```bash
npm install -g @tdwhere/do-it
do-it setup
```

## Codex Plugin Surface

The Codex plugin marketplace files follow the repo-local marketplace shape:

- `.agents/plugins/marketplace.json`
- `plugins/do-it/.codex-plugin/plugin.json`
- `plugins/do-it/skills/`
- `plugins/do-it/agents/`
- `plugins/do-it/hooks/` (plugin-local hooks; trust under `/hooks`)

Regenerate the bundle from `manifest.json`:

```bash
npm run build:codex-plugin
```

Register the marketplace from a checkout, then install:

```bash
CODEX_HOME=/tmp/do-it-plugin-test codex plugin marketplace add /path/to/do-it
CODEX_HOME=/tmp/do-it-plugin-test codex plugin add do-it@tdwhere-do-it
```

Plugin hooks are the primary enforcement path. Global `do-it setup` is optional
for doctor and migration — do not require pairing it with marketplace install.

## Host Capability Matrix

| Host surface | Skills | Agents | Commands | Hooks | Doctor | Verification command |
|---|---|---|---|---|---|---|
| Codex plugin marketplace | Yes, under `plugins/do-it/skills/` | Yes, under `plugins/do-it/agents/` | No slash command surface | Yes, plugin hooks (trust under `/hooks`) | Optional via CLI | `npm run build:codex-plugin` then `CODEX_HOME=/tmp/do-it-plugin-test codex plugin marketplace add /path/to/do-it` and `codex plugin add do-it@tdwhere-do-it` |
| Codex CLI setup (legacy) | Yes, from `manifest.json` | Yes, TOML from `agents/` | CLI `do-it` only | Yes, root `hooks.json` plus `hooks/` | Yes, default target | `CODEX_HOME=/tmp/do-it-codex-test npm exec --package . -- do-it setup` |
| Claude Code plugin | Yes, from `skills/do-it/` | Yes, under `dist/claude/agents/` | Yes, `commands/` | Yes, plugin `hooks/hooks.json` | Yes, `--target=claude` | `CLAUDE_PLUGIN_ROOT_OVERRIDE=/tmp/do-it-claude-test npm exec --package . -- do-it setup --target=claude` |
| Cursor plugin | Full 8 (`ALL_SKILLS`) under `plugins/do-it-cursor/skills/` (+ `references/`) | Yes, under `plugins/do-it-cursor/agents/` | No | Medium: `sessionStart`, `beforeSubmitPrompt`, `postToolUse`/`afterFileEdit`, `stop` (no `grill-pretool`) | Yes, `--target=cursor` | `npm run build:cursor-plugin`; symlink `plugins/do-it-cursor` to `~/.cursor/plugins/local/do-it-cursor` (or `do-it setup --target=cursor`); Reload Window |
| OpenCode plugin | Yes, under `plugins/do-it-opencode/skills/` | Yes, under `plugins/do-it-opencode/agents/` | No | Medium-Light: transform bootstrap, `tool.execute.after`, `session.idle` soft reminder | No CLI doctor | `npm run build:opencode-plugin && npm run test-opencode` |

## 0.14.0

- Meaning-centric skill buckets; migration table in CHANGELOG.
- Agents: 10 retained after merges.
- Hooks: Heavy-only `grill-prompt`; `grill-pretool` removed; quality families
  overhaul; Codex plugin bundles hooks.
- Plugin-first delivery: marketplaces for Codex / Claude / Cursor; `opencode.json` plugin registration for OpenCode.

## 0.13.1

- Hotfix on the four-host line: safer `verification-gate` turn slicing, hardened
  write-quality scan edge cases, corrected skill `references/` links.
- OpenCode build requires `tsc`; `prepack` expands Cursor and OpenCode plugin builds.

## 0.13.0

- Four-host adapter matrix: Codex, Claude, Cursor, OpenCode share one workflow kernel.
- Merged advisory `write-quality-lint` replaces dual PostToolUse `comments-lint` +
  `anti-patterns-lint` (legacy wrappers exec into merged script for one release).
- UserPromptSubmit chain compressed for Standard turns; tier/DIM gates write-quality.
- Skills `references/` sheets externalized; harness matrix at `docs/harness-adapter-matrix.md`.
- Cursor plugin marketplace bundle and OpenCode TS plugin ship from `plugins/`.

## Local Checkout Surface

From the repository root (optional CLI path):

```bash
npm exec --package . -- do-it setup
npm exec --package . -- do-it install
npm exec --package . -- do-it doctor
```

The package bin is `do-it`, and it delegates to `install/manage.mjs`. The shell
wrappers remain available:

```bash
./install/install.sh
./install/doctor.sh
```

Set `CODEX_HOME=/path/to/codex-home` to test or install into a temporary target.

## Publish Paths

### Option 1: Publish To npm

```bash
npm publish --access public
```

Keep the package scoped and keep `do-it` as the bin:

```bash
npm install -g @tdwhere/do-it
do-it setup   # optional / legacy
```

### Option 2: Pack And Test Locally

```bash
npm pack
```

Use the generated tarball with `npm install --global` or
`npm exec --package ./tdwhere-do-it-0.14.0.tgz -- do-it setup` when testing a
release artifact.

## Release Checklist

1. Run `git diff --check`.
2. Run `npm test`.
3. Run `npm run validate:agents`.
4. Run `npm run build:claude-agents`.
5. Run `npm run build:codex-plugin`.
6. Run `npm run build:cursor-plugin`.
7. Run `npm run build:opencode-plugin && npm run test-opencode`.
8. Smoke Codex plugin marketplace + trust hooks under `/hooks`.
9. Optional: `CODEX_HOME=/tmp/do-it-codex-test npm exec --package . -- do-it setup`
   and `do-it doctor`.
10. Smoke hook commands for `UserPromptSubmit`, `PostToolUse`, and `Stop`
    (no `PreToolUse` / `grill-pretool`).
11. Run `CODEX_HOME=/tmp/do-it-plugin-test codex plugin marketplace add /path/to/do-it`
    then `codex plugin add do-it@tdwhere-do-it`, or inspect the local marketplace
    registration manually.
12. Run `CLAUDE_PLUGIN_ROOT_OVERRIDE=/tmp/do-it-claude-test npm exec --package . -- do-it setup --target=claude`.
13. Run `npm pack --dry-run --json`.
14. Confirm `docs/upstream-map.md` reflects the latest imports.
15. Confirm `manifest.json` matches the on-disk inventory (8 skills, 10 agents).
16. Confirm `index.json`, `.agents/plugins/marketplace.json`,
    `plugins/do-it/`, `plugins/do-it-cursor/`, `plugins/do-it-opencode/`, and
    hook configs are included in the package.
17. Confirm the temporary/source-only rewrite material is not included in the
    package.
18. Confirm a simulated legacy upgrade can remove unmodified deprecated targets
    without `DO_IT_FORCE=1`.
19. Confirm a simulated replacement failure preserves both current managed
    targets and deprecated legacy targets.
20. Confirm `doctor` fails when `.do-it-install-state.json` is missing or stale
    (CLI path).
21. Confirm no machine-local files were added to the package.
22. Confirm the release instructions describe copy-based install behavior only,
    not symlink-based deployment.
23. Confirm Codex-installed `agents/*.toml` do not contain unsupported fields
    such as `model`, `model_reasoning_effort`, `claude_model`, or
    `output_budget`, and that `npm run build:claude-agents` generates Claude
    agent frontmatter without concrete model pins.
24. For release/install claims, record source, package, temp-install, live
    Codex, live Claude, and host-behavior truth planes separately; do not call
    the workflow synced until live doctor or plugin evidence exists.
