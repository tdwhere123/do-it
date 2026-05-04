# Release Notes

This workflow bundle is designed to ship as a global npm CLI. The public path is
`npm install -g ...`, then `do-it setup`.

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

From the npm registry:

```bash
npm install -g @tdwhere/do-it
do-it setup
```

From a GitHub repository before registry publication:

```bash
npm install -g github:OWNER/do-it
do-it setup
```

`do-it setup` delegates to the same installer and doctor logic as the local
scripts. It does not run from npm lifecycle hooks.

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
`npm exec --package ./tdwhere-do-it-0.5.1.tgz -- do-it setup` when testing a
release artifact.

## Release Checklist

1. Run `git diff --check`.
2. Run `npm test`.
3. Run `npm run build:claude-agents`.
4. Run `CODEX_HOME=/tmp/do-it-codex-test npm exec --package . -- do-it setup`.
5. Run `CLAUDE_PLUGIN_ROOT_OVERRIDE=/tmp/do-it-claude-test npm exec --package . -- do-it setup --target=claude`.
6. Run `npm pack --dry-run --json`.
7. Confirm `docs/upstream-map.md` reflects the latest imports.
8. Confirm `manifest.json` matches the on-disk inventory.
9. Confirm the temporary/source-only rewrite material is not included in the
   package.
10. Confirm a simulated legacy upgrade can remove unmodified deprecated targets
   without `DO_IT_FORCE=1`.
11. Confirm a simulated replacement failure preserves both current managed
   targets and deprecated legacy targets.
12. Confirm `doctor` fails when `.do-it-install-state.json` is missing or stale.
13. Confirm no machine-local files were added to the package.
14. Confirm the release instructions describe copy-based install behavior only,
   not symlink-based deployment.
