# Release Notes

This workflow bundle is designed so `codex/` can later be published as its own
repository.

## Baseline

- `2026-04-24`: repo bundle rebaselined from the current live global
  `~/.codex/skills` and `~/.codex/agents` entries. This is a pre-rewrite
  baseline; legacy `superpowers` terminology is still expected in some files.

## Publish Paths

### Option 1: Split This Subtree

```bash
git subtree split --prefix=codex -b codex-workflow-release
```

Push that branch to a new GitHub repository and continue maintaining the bundle
there if you want it fully separated from the product repository.

### Option 2: Mirror Manually

Copy the `codex/` subtree into a dedicated repository and keep this repository
as the staging area while the layout is still evolving.

## Release Checklist

1. Run `./codex/install/install.sh`.
2. Run `./codex/install/doctor.sh`.
3. Confirm `codex/docs/upstream-map.md` reflects the latest imports.
4. Confirm `codex/manifest.json` matches the on-disk inventory.
5. Confirm no machine-local files were added under `codex/`.
6. Confirm the release instructions describe copy-based install behavior only,
   not symlink-based deployment.
