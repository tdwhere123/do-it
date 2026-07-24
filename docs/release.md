# Release Notes

This workflow bundle has six host delivery surfaces plus an optional managed
CLI setup path:

1. Codex — marketplace-first, with skills, agents, and plugin hooks (trust under
   `/hooks`).
2. Claude Code — marketplace-first, with Claude-native hooks, commands, and
   generated agents.
3. Cursor — local copy or Team Import today; public marketplace listing is
   pending. The bundle has medium-depth hooks.
4. OpenCode — independent `@tdwhere/do-it-opencode` npm package with a global
   vendored fallback. The TypeScript plugin has per-message routing and selective
   bridges.
5. Pi — independent `@tdwhere/do-it-pi` npm package or local-path install. One TypeScript extension, full skills,
   prompts, and optional namespaced `do-it.*` package agents via `pi-subagents`.
6. Kimi Code — repo-root `kimi.plugin.json` installed via `/plugins install`
   (per-user). Skills, commands, and manifest hooks; no custom subagents on
   this host, so agents are not shipped.
7. Optional / legacy: `do-it setup` for managed doctor, temp-home smoke, and
   migration from older global installs.

## Current Truth Planes

| Plane | Current repository evidence |
| --- | --- |
| Source/package | `package.json`, manifest, and plugin metadata declare `0.14.1`; inventory is 9 user/runnable skills + 1 generated discovery entry + 10 agents. |
| Git tag | The `0.14.1` release commit must carry `v0.14.1`; version metadata alone is not a release. |
| Marketplace/npm | The release workflow publishes separate `@tdwhere/do-it`, `@tdwhere/do-it-opencode`, and `@tdwhere/do-it-pi` artifacts. Only post-workflow registry queries prove publication. Cursor marketplace listing remains pending. |
| Live host | Only host install/inspection evidence proves an active version. Source, package, tag, and live host may differ. |

## Tag Policy

- Every release ends with a `vX.Y.Z` git tag on the release commit — the tag is
  what triggers `.github/workflows/release.yml` (verify → pack → optional npm
  publish). A version bump without a tag is not a release.
- After a release, `main` bumps to the next patch version (e.g. `0.14.1`)
  promptly, so a checkout never claims a published version it has already
  moved past.
- Historical gap: `0.6.1`–`0.14.0` shipped without tags (latest tag was
  `v0.6.0`). Retro-tag old release commits only with maintainer confirmation;
  going forward, tag at release time.

## Baseline

- `2026-07-12` (`0.14.0` source baseline; not a publication claim): meaning-centric skill buckets — `do-it-router`,
  `do-it-code-quality`, `do-it-review`, `do-it-decide`, `do-it-verify`, plus
  `do-it-handbook` / `do-it-context` / `do-it-skill-authoring`. Agents reduced
  to 10. Plugin-first install; `grill-pretool` removed; `grill-prompt`
  Heavy-only. See [`CHANGELOG.md`](../CHANGELOG.md).
- `0.14.1`: adds the Kimi and Pi adapters, default-off retrospective and strict
  external-action profiles, Windows hardening, and independent npm delivery for
  root, OpenCode, and Pi packages. See [`CHANGELOG.md`](../CHANGELOG.md).
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

# Cursor — no Claude /plugin commands; copy (not external symlink):
#   npm run install:cursor-local
# then Developer: Reload Window. Or: do-it setup --target=cursor
# Team Import from Repo / public marketplace when listed

# OpenCode — use npm only after `npm view ... version` succeeds
# opencode plugin @tdwhere/do-it-opencode -g
# npm run install:opencode-global  # pre-publication/outage fallback

# Pi — use npm only after `npm view ... version` succeeds
# pi install npm:@tdwhere/do-it-pi
# npm run install:pi-global  # pre-publication/development, then /reload
# optional executable package agents: pi install npm:pi-subagents

# Kimi Code — repo-root plugin, no build step:
# /plugins install https://github.com/tdwhere123/do-it  (then /reload)
# local checkout smoke: /plugins install /path/to/do-it
```

Optional CLI (legacy / doctor / migration):

```bash
npm install -g https://github.com/tdwhere123/do-it/archive/refs/heads/main.tar.gz
do-it setup
```

After `npm view @tdwhere/do-it@0.14.1 version` succeeds, the root registry
package provides the optional managed CLI. Before publication, use the GitHub
or checkout-local path above.

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
| --- | --- | --- | --- | --- | --- | --- |
| Codex plugin marketplace | Yes, under `plugins/do-it/skills/` | Yes, under `plugins/do-it/agents/` | No slash command surface | Yes, plugin hooks (trust under `/hooks`) | Optional via CLI | `npm run build:codex-plugin` then `CODEX_HOME=/tmp/do-it-plugin-test codex plugin marketplace add /path/to/do-it` and `codex plugin add do-it@tdwhere-do-it` |
| Codex CLI setup (legacy) | Yes, from `manifest.json` | No — bundled agents are plugin-owned; legacy CLI only supports safe migration | CLI `do-it` only | Yes, root `hooks.json` plus `hooks/` | Yes, default target | `CODEX_HOME=/tmp/do-it-codex-test npm exec --package . -- do-it setup` |
| Claude Code plugin | Yes, from `skills/do-it/` | Yes, under `dist/claude/agents/` | Yes, `commands/` | Yes, plugin `hooks/hooks.json` | Yes, `--target=claude` | `CLAUDE_PLUGIN_ROOT_OVERRIDE=/tmp/do-it-claude-test npm exec --package . -- do-it setup --target=claude` |
| Cursor local / Team Import (public listing pending) | Full 9 (`ALL_SKILLS`) plus generated discovery/reference files | Yes, under `plugins/do-it-cursor/agents/` | No | Medium: `sessionStart`, `beforeSubmitPrompt`, `postToolUse`/`afterFileEdit`, advisory-evidence `stop` | Managed CLI setup only; not standalone local copy | `npm run install:cursor-local`, Reload Window, inspect exact directory + Hooks UI; or `do-it setup --target=cursor` for managed doctor |
| OpenCode plugin | Yes, under `plugins/do-it-opencode/skills/` | Yes, under `plugins/do-it-opencode/agents/` | No | Medium-Light: transform bootstrap, `tool.execute.after`, `session.idle` soft reminder | No CLI doctor | `npm run build:opencode-plugin && npm run test-opencode` |
| Pi package | Yes, under `plugins/do-it-pi/skills/` | Ten `do-it.*` package agents when optional `pi-subagents` is installed; prompts remain available without it | Prompt templates | Medium: root router/grill, root write advice, soft next-turn verification reminder; child stance only | `/do-it-status` | `npm run build:pi-plugin && npm --prefix plugins/do-it-pi test && node scripts/smoke-pi-package.mjs`; live: `/reload`, `/do-it-status`, and package-agent discovery |
| Kimi Code plugin (repo root) | Full 9 via root `kimi.plugin.json` `skills` | No — host has no custom subagents | Yes, `/do-it:*` namespaced | Full-minus-subagent: manifest `hooks[]` (`UserPromptSubmit`×3, `PostToolUse`, `Stop`) | No — `/plugins info do-it` is the host-side check | `npm run validate:kimi-plugin`; live: `/plugins install /path/to/do-it` then `/reload` |

## 0.14.0

- Meaning-centric skill buckets; migration table in CHANGELOG.
- Agents: 10 retained after merges.
- Hooks: Heavy-only `grill-prompt`; `grill-pretool` removed; quality families
  overhaul; Codex plugin bundles hooks.
- Host-native delivery: marketplace-first for Codex / Claude; local copy or Team Import for Cursor pending public listing; global vendor / package-name registration for OpenCode pending npm publication.

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
- Cursor bundle and OpenCode TS plugin source ship from `plugins/`; shipping source does not prove Cursor public listing or OpenCode npm publication.

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

### CI / CD

- **CI** (`.github/workflows/ci.yml`): matrix tests, generated-artifact drift
  checks, Cursor local-install smoke (real copy under `plugins/local`),
  `npm run smoke:package`, and dedicated Linux/Windows Pi build, test, Git Bash,
  discovery, and dependency-absent package smoke jobs on Node 22.
- **Release** (`.github/workflows/release.yml`): on `v*` tags or manual
  dispatch — full verify, `npm run validate:release`, exact root/OpenCode/Pi
  package smoke, then separate verified tarballs and independent publish jobs
  for all three npm packages.

### Option 1: Publish To npm

Prefer publishing the exact tarballs that already passed release validation:

```bash
VERSION=0.14.1
npm run validate:release -- "v${VERSION}"
npm run build:opencode-plugin
npm run build:pi-plugin
npm --prefix plugins/do-it-pi test

npm pack --ignore-scripts
(cd plugins/do-it-opencode && npm pack --ignore-scripts --pack-destination ../..)
(cd plugins/do-it-pi && npm pack --ignore-scripts --pack-destination ../..)

ROOT_TARBALL="./tdwhere-do-it-${VERSION}.tgz"
OPENCODE_TARBALL="./tdwhere-do-it-opencode-${VERSION}.tgz"
PI_TARBALL="./tdwhere-do-it-pi-${VERSION}.tgz"
npm run smoke:package -- "$ROOT_TARBALL" "$OPENCODE_TARBALL"
node scripts/smoke-pi-package.mjs "$PI_TARBALL"

npm publish "$ROOT_TARBALL" --access public
npm publish "$OPENCODE_TARBALL" --access public
npm publish "$PI_TARBALL" --access public
```

Keep the root package scoped and keep `do-it` as its bin. Install from the
registry only after `npm view @tdwhere/do-it@0.14.1 version` succeeds; before
publication, use the exact local tarball from the verified pack step.

```bash
npm install -g @tdwhere/do-it
do-it setup   # optional / legacy
```

The release workflow produces separate root, OpenCode, and Pi artifacts.
Publishing one must not select another package's tarball by a broad wildcard.

### Option 2: Pack And Test Locally

```bash
VERSION=0.14.1
npm pack --ignore-scripts
npm run smoke:package -- "./tdwhere-do-it-${VERSION}.tgz"
```

With one or more `.tgz` arguments, `smoke:package` installs and exercises those
artifacts and does not repack from checkout. With no arguments it packs both the
root and OpenCode packages from the working tree, then smokes them (CI default).

Use the generated tarball with `npm install --global` or
`npm exec --package "./tdwhere-do-it-${VERSION}.tgz" -- do-it setup` when testing
a release artifact.

## Release Checklist

1. Run `git diff --check` and inspect the intended diff.
2. Run `npm test`.
3. Run `npm run validate:agents` and `npm run validate:core-skill-boundaries`.
4. Build Claude, Codex, Cursor, and OpenCode artifacts and check generated drift.
5. Run `npm run build:pi-plugin`, `npm --prefix plugins/do-it-pi test`, and an
   exact-tarball `node scripts/smoke-pi-package.mjs <pi.tgz>` check.
6. On Windows, require Git Bash and prove Pi hook execution plus timeout/abort
   process-tree cleanup; do not skip Bash-dependent tests.
7. Run `npm run validate:kimi-plugin` (the Kimi root manifest ships unbuilt).
8. Smoke Codex plugin marketplace + trust hooks under `/hooks`.
9. Optional: run isolated managed CLI setup and doctor checks for Codex, Claude,
   and Cursor.
10. Smoke advisory hook behavior: router, write-quality, verification, and
    child stance. No host contains `grill-pretool`; only Claude may contain the
    named, default-off strict external-action profile.
11. In a reloaded Pi session, run `/do-it-status` for Bash, hook diagnostics,
    and `subagent` tool registration. Separately use `pi-subagents` discovery to
    confirm `do-it.*` agents are executable; without it, confirm extension,
    skills, and prompts remain available with explicit degradation.
12. Run `npm run validate:release -- vX.Y.Z`; it must check both Pi lockfile
    version fields as well as the other host metadata.
13. Run `npm run smoke:package` for root/OpenCode and smoke the independently
    packed Pi tarball.
14. Confirm `manifest.json` matches the on-disk inventory (9 user/runnable
    skills + 1 generated discovery entry, 10 agents).
15. Confirm root tarball contents remain separate from `plugins/do-it-pi`, and
    the Pi tarball contains only its README/license/runtime assets.
16. Confirm temporary files, machine-local settings, `node_modules`, test build
    output, and retired forced-tool extensions are absent from both tarballs.
17. Confirm simulated legacy upgrades and replacement failures retain the
    existing install-state safety guarantees.
18. Confirm managed `doctor` fails for missing/stale install state; do not use it
    as proof for Cursor's standalone local-copy installer or Pi package load.
19. Confirm Codex agent TOML and generated Claude frontmatter retain their
    supported field/model contracts.
20. Record source, package, temp-install, live-host, and registry truth planes
    separately. A pushed commit is not proof of npm publication or live load.
