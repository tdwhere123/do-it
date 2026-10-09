# Release Notes

The maintained host set is Claude Code, Codex, Cursor, Pi, and Grok Build:

1. Codex — marketplace skills and plugin hook configuration; native specialist
   roles are installed separately. See [installation](./install.md).
2. Claude Code — marketplace hooks, commands, and generated agents.
3. Cursor — local copy or Team Import; public marketplace listing is pending.
4. Pi — independent `@tdwhere/do-it-pi` npm package or local install, with a
   maintained extension and generated agents executed through optional `pi-subagents`.
5. Grok Build — generated `plugins/do-it-grok/` local bundle, installed as
   `do-it-grok`; inspect loaded source paths and names after native validation.

OpenCode and Kimi Code repository support is retired. Historical version notes
below remain unchanged. No local application or user configuration removal is
part of this support change. Managed CLI setup remains available for doctor,
isolated smoke checks, and legacy migration; Codex agent-only setup complements
the plugin installation without duplicating its skills/hooks.

The [0.18.1 verification record](./release-evidence/0.18.1-unreleased.md) separates
builds, native discovery, actual model probes, and remaining unverified behavior.

## Current Truth Planes

| Plane | Current repository evidence |
| --- | --- |
| Source/package | `package.json`, manifest, and plugin metadata declare `0.18.1`; inventory is 12 runnable skills (including the discovery compatibility alias), 1 generated discovery entry, and 10 agents. This patch improves explicit deep-audit delegation, coverage reuse, and maintainability review, consolidates Core/bootstrap and specialist ownership, and updates host support. It is an unpublished source update; npm publication is deferred. |
| Git tag | The existing `v0.18.0` tag identifies the preceding version. This source update does not create `v0.18.1`. The older `v0.17.0` tag belongs to a different commit whose npm publication failed; do not move or reuse it. Version metadata or a tag alone does not prove npm publication. |
| Marketplace/npm | The release workflow publishes separate `@tdwhere/do-it` and `@tdwhere/do-it-pi` artifacts. Only post-workflow registry queries prove publication. Cursor marketplace listing remains pending. |
| Live host | Only host install/inspection evidence proves an active version. Source, package, tag, and live host may differ. |

## Tag Policy

- Every release ends with a `vX.Y.Z` git tag on the release commit — the tag is
  what triggers `.github/workflows/release.yml` (verify → pack → optional npm
  publish). A version bump without a tag is not a release.
- After a release, `main` bumps to the next patch version (e.g. `0.18.1`)
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
# inspect/trust configured hooks under /hooks; live execution needs separate proof
# from a checkout, add native specialists:
node bin/do-it.mjs setup --target=codex --only=agents

# Claude Code
# /plugin marketplace add tdwhere123/do-it && /plugin install do-it@do-it

# Cursor — no Claude /plugin commands; copy (not external symlink):
#   npm run install:cursor-local
# then Developer: Reload Window. Or: do-it setup --target=cursor
# Team Import from Repo / public marketplace when listed

# Pi — use npm only after `npm view ... version` succeeds
# pi install npm:@tdwhere/do-it-pi
# npm run install:pi-global  # pre-publication/development, then /reload
# optional executable package agents: pi install npm:pi-subagents

```

Optional CLI (legacy / doctor / migration):

```bash
npm install -g https://github.com/tdwhere123/do-it/archive/refs/heads/main.tar.gz
do-it setup
```

After `npm view @tdwhere/do-it@0.18.1 version` succeeds, the root registry
package provides the optional managed CLI. Before publication, use the GitHub
or checkout-local path above.

```bash
npm install -g @tdwhere/do-it
do-it setup
```

## Codex Plugin Surface

The Codex plugin marketplace files follow the repo-local marketplace shape:

- `.agents/plugins/marketplace.json`
- `plugins/do-it/.codex-plugin/plugin.json` — generated native Codex manifest
- `plugins/do-it/skills/`
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

Native host permissions are the enforcement path. Plugin hook configuration
is separate from proof of execution. Full global `do-it setup` remains optional;
`--only=agents` installs native specialist roles without a skills/hooks mirror.
The isolated native `codex 0.162.0` comparison found no hooks with root
`plugin.json` and found hooks with `.codex-plugin/plugin.json`. The builder
prunes the root manifest and plugin agents; discovery still does not prove
execution. The final native repository-bundle read returned twelve skills,
three hook declarations, and Skills/Hooks capabilities. Claude's explicit
`claude plugin validate --strict .claude-plugin/plugin.json` passed; root
marketplace validation passed separately. See [architecture](./architecture.md).

## Host Capability Matrix

The current [host matrix](./harness-adapter-matrix.md) owns runtime and specialist
capabilities. Release verification exercises built packages, host protocols,
installation ownership and rollback, and applicable local behavior. Native
permissions remain authoritative; advisory context and diagnostics do not prove
acceptance. The version-specific sections below describe historical releases.

## 0.14.0 (historical)

- Meaning-centric skill buckets; migration table in CHANGELOG.
- Agents: 10 retained after merges.
- Hooks: Heavy-only `grill-prompt`; `grill-pretool` removed; quality families
  overhaul; Codex plugin bundles hooks.
- Host-native delivery: marketplace-first for Codex / Claude; local copy or Team Import for Cursor pending public listing; at that release, OpenCode used global vendor / package-name registration while npm publication was pending.

## 0.13.1 (historical)

- Hotfix on the four-host line: safer `verification-gate` turn slicing, hardened
  write-quality scan edge cases, corrected skill `references/` links.
- At that release, OpenCode required `tsc`; `prepack` included Cursor and OpenCode builds. These OpenCode build paths are now retired.

## 0.13.0 (historical)

- That release used a four-host matrix: Codex, Claude, Cursor, and OpenCode shared one workflow kernel.
- Merged advisory `write-quality-lint` replaces dual PostToolUse `comments-lint` +
  `anti-patterns-lint` (legacy wrappers exec into merged script for one release).
- UserPromptSubmit chain compressed for Standard turns; tier/DIM gates write-quality.
- Skills `references/` sheets externalized; harness matrix at `docs/harness-adapter-matrix.md`.
- That release shipped Cursor and OpenCode TypeScript plugin sources from `plugins/`; this did not prove marketplace listing or npm publication. OpenCode is no longer a maintained target.

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
  dispatch — full verify, `npm run validate:release`, exact root/Pi
  package smoke, then separate verified tarballs and independent publish jobs
  for both npm packages.

### Option 1: Publish To npm

Prefer publishing the exact tarballs that already passed release validation:

```bash
VERSION=0.18.1
npm run validate:release -- "v${VERSION}"
npm run build:generated
npm run build:codex-plugin
npm run build:cursor-plugin
npm run build:pi-plugin
node scripts/build-grok-plugin.mjs
npm --prefix plugins/do-it-pi test

npm pack --ignore-scripts
(cd plugins/do-it-pi && npm pack --ignore-scripts --pack-destination ../..)

ROOT_TARBALL="./tdwhere-do-it-${VERSION}.tgz"
PI_TARBALL="./tdwhere-do-it-pi-${VERSION}.tgz"
npm run smoke:package -- "$ROOT_TARBALL"
node scripts/smoke-pi-package.mjs "$PI_TARBALL"

npm publish "$ROOT_TARBALL" --access public
npm publish "$PI_TARBALL" --access public
```

Keep the root package scoped and keep `do-it` as its bin. Install from the
registry only after `npm view @tdwhere/do-it@0.18.1 version` succeeds; before
publication, use the exact local tarball from the verified pack step.

```bash
npm install -g @tdwhere/do-it
do-it setup   # optional / legacy
```

The release workflow produces separate root and Pi artifacts.
Publishing one must not select another package's tarball by a broad wildcard.

### Option 2: Pack And Test Locally

```bash
VERSION=0.18.1
npm pack --ignore-scripts
npm run smoke:package -- "./tdwhere-do-it-${VERSION}.tgz"
```

With exactly one root `.tgz` argument, `smoke:package` installs and exercises
that artifact without repacking. With no arguments it packs the root package
from the working tree, then smokes it (CI default). Pi has its separate smoke
command above.

Use the generated tarball with `npm install --global` or
`npm exec --package "./tdwhere-do-it-${VERSION}.tgz" -- do-it setup` when testing
a release artifact.

## Release Checklist

1. Run `git diff --check` and inspect the intended diff.
2. Run `npm test`.
3. Run `npm run validate:agents` and `npm run validate:core-consistency`.
4. Build Claude, Codex, Cursor, Pi, and Grok Build artifacts and check generated drift.
5. Run `npm run build:pi-plugin`, `npm --prefix plugins/do-it-pi test`, and an
   exact-tarball `node scripts/smoke-pi-package.mjs <pi.tgz>` check.
6. On Windows, require Git Bash and prove Pi hook execution plus timeout/abort
   process-tree cleanup; do not skip Bash-dependent tests.
7. Run `agent plugin validate plugins/do-it-grok`; install the absolute bundle
   path with `--trust` in the intended test environment and inspect actual loaded
   sources and names. A list entry alone does not establish correct discovery.
8. Smoke Codex plugin marketplace and native agent-only installation separately;
   verify live named-role discovery, sandbox behavior, and hook execution before
   claiming those capabilities. Trust settings or cache files alone are insufficient.
9. Optional: run isolated managed CLI setup and doctor checks for Codex, Claude,
   and Cursor.
10. Smoke advisory hook behavior: context delivery, write-quality, and
    child stance. No host contains `grill-pretool`; only Claude may contain the
    named, default-off strict external-action profile.
11. In a reloaded Pi session, run `/do-it-status` for Bash, hook diagnostics,
    and `Agent`/`subagent` tool registration. Separately use the active runtime’s role list to
    confirm `do-it.*` agents are executable; without it, confirm extension,
    skills, and prompts remain available with explicit degradation.
12. Run `npm run validate:release -- vX.Y.Z`; it must check both Pi lockfile
    version fields as well as the other host metadata.
13. Run `npm run smoke:package` for root and smoke the independently
    packed Pi tarball.
14. Confirm `manifest.json` matches the on-disk inventory (12 user/runnable
    skills + 1 generated discovery entry, 10 agents). Source metadata is
    `0.18.1`; do not tag or npm-publish until those are authorized. Default
    runtime provides compact context and source-edit checks; classification and
    completion reminder gates are retired.
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
