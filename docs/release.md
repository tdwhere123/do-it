# Release Notes

This workflow bundle ships through three surfaces:

1. Codex global setup for full automatic hooks and doctor-managed install.
2. Codex plugin marketplace for first-class skills and agents discovery.
3. Claude Code plugin marketplace for Claude-native hooks, commands, and
   generated agents.

## Baseline

- `2026-04-24`: do-it rewrite installs only do-it-native skill names while
  preserving the portable Codex agent definitions and copy-based doctor flow.
  The install surface includes the full do-it skill flow: router, planning,
  slicing, grill, architecture scan, interface drill, domain language, delivery,
  TDD, debugging, subagent orchestration, review, fix-loop, verification,
  worktree isolation, branch closeout, visual planning, and skill authoring.
  The review agent set includes correctness, scope compliance, maintainability,
  architecture, red-team, domain-language, skill-quality, and install/release
  lenses.

## Global Install Surface

Current verified terminal install from GitHub:

```bash
npm install -g https://github.com/tdwhere123/do-it/archive/refs/heads/main.tar.gz
do-it setup
```

After npm registry publication, the registry path may also be used:

```bash
npm install -g @tdwhere/do-it
do-it setup
```

`do-it setup` delegates to the same installer and doctor logic as the local
scripts. It does not run from npm lifecycle hooks. For Codex, setup installs
skills, agents, `hooks/`, and root `hooks.json`.

## Codex Plugin Surface

The Codex plugin marketplace files follow the repo-local marketplace shape:

- `.agents/plugins/marketplace.json`
- `plugins/do-it/.codex-plugin/plugin.json`
- `plugins/do-it/skills/`
- `plugins/do-it/agents/`

Regenerate the bundle from `manifest.json`:

```bash
npm run build:codex-plugin
```

Register the marketplace from a checkout:

```bash
CODEX_HOME=/tmp/do-it-plugin-test codex plugin marketplace add /path/to/do-it
```

Do not treat plugin-local hooks as the v1 enforcement path. Local capability
checks currently show `codex_hooks=true`, `plugins=true`, and
`plugin_hooks=false`, so enforced hooks come from Codex global setup.

## Host Capability Matrix

| Host surface | Skills | Agents | Commands | Hooks | Doctor | Verification command |
|---|---|---|---|---|---|---|
| Codex global setup | Yes, from `manifest.json` | Yes, TOML from `agents/` | CLI `do-it` only | Yes, root `hooks.json` plus do-it-managed files under `hooks/` | Yes, default target | `CODEX_HOME=/tmp/do-it-codex-test npm exec --package . -- do-it setup` |
| Codex plugin marketplace | Yes, generated under `plugins/do-it/skills/` | Yes, generated under `plugins/do-it/agents/` | No slash command surface | Not relied on while `plugin_hooks=false` | No direct doctor; pair with global setup for hooks | `npm run build:codex-plugin` then `CODEX_HOME=/tmp/do-it-plugin-test codex plugin marketplace add /path/to/do-it` |
| Claude Code plugin | Yes, from `skills/do-it/` | Yes, generated Markdown under `dist/claude/agents/` | Yes, `commands/` | Yes, do-it-managed files under `hooks/`, including `hooks/hooks.json` | Yes, `--target=claude` | `CLAUDE_PLUGIN_ROOT_OVERRIDE=/tmp/do-it-claude-test npm exec --package . -- do-it setup --target=claude` |

## Local Checkout Surface

From the repository root:

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
do-it setup
```

### Option 2: Pack And Test Locally

```bash
npm pack
```

Use the generated tarball with `npm install --global` or
`npm exec --package ./tdwhere-do-it-0.10.0.tgz -- do-it setup` when testing a
release artifact.

## Release Checklist

1. Run `git diff --check`.
2. Run `npm test`.
3. Run `npm run validate:agents`.
4. Run `npm run build:claude-agents`.
5. Run `npm run build:codex-plugin`.
6. Run `CODEX_HOME=/tmp/do-it-codex-test npm exec --package . -- do-it setup`.
7. Run `CODEX_HOME=/tmp/do-it-codex-test npm exec --package . -- do-it doctor`.
8. Smoke the installed Codex hook commands for `UserPromptSubmit`,
   `PreToolUse`, `PostToolUse`, and `Stop` against the temporary `CODEX_HOME`.
9. Run `CODEX_HOME=/tmp/do-it-plugin-test codex plugin marketplace add /path/to/do-it`
   or inspect the local marketplace registration manually.
10. Run `CLAUDE_PLUGIN_ROOT_OVERRIDE=/tmp/do-it-claude-test npm exec --package . -- do-it setup --target=claude`.
11. Run `npm pack --dry-run --json`.
12. Confirm `docs/upstream-map.md` reflects the latest imports.
13. Confirm `manifest.json` matches the on-disk inventory.
14. Confirm `index.json`, `.agents/plugins/marketplace.json`,
   `plugins/do-it/`, and `install/codex-hooks.json` are included in the
   package.
15. Confirm the temporary/source-only rewrite material is not included in the
   package.
16. Confirm a simulated legacy upgrade can remove unmodified deprecated targets
   without `DO_IT_FORCE=1`.
17. Confirm a simulated replacement failure preserves both current managed
   targets and deprecated legacy targets.
18. Confirm `doctor` fails when `.do-it-install-state.json` is missing or stale.
19. Confirm no machine-local files were added to the package.
20. Confirm the release instructions describe copy-based install behavior only,
   not symlink-based deployment.
21. Confirm Codex-installed `agents/*.toml` do not contain unsupported fields
   such as `model`, `model_reasoning_effort`, `claude_model`, or
   `output_budget`, and that `npm run build:claude-agents` generates Claude
   agent frontmatter without concrete model pins.
22. For release/install claims, record source, package, temp-install, live
   Codex, live Claude, and host-behavior truth planes separately; do not call
   the workflow synced until live doctor or setup evidence exists.
