# Codex Workflow Distribution

This directory is the maintained source of truth for the portable parts of a
personal Codex workflow bundle.

The bundle keeps a stable install surface under `~/.codex`. As of the
2026-04-24 live sync, the repo copy reflects the current global workflow
entries under `~/.codex/skills` and `~/.codex/agents`; some skills still carry
legacy `superpowers` terminology and support files. Treat this as the baseline
for the next repo-managed rewrite, not as a completed semantic cleanup.

This is maintenance material, not normal project-working documentation. During
ordinary product work, use the repository docs under `docs/` and the project
instructions. Come into `codex/` only when you explicitly want to inspect,
rewrite, or sync the local Codex workflow bundle.

It currently manages only:

- skills
- agent definitions

It intentionally does not manage:

- `rules`
- `hooks`
- `auth.json`
- `config.toml`
- session state, logs, caches, plugins, or other machine-local data

## Layout

```text
codex/
  agents/          Portable agent TOML definitions
  docs/            Maintenance, routing policy, origin history, release notes
  install/         Install and doctor entrypoints
  skills/
    custom/        Repo-authored skills with no upstream counterpart
    upstream/      Maintained skill directories kept under stable install names
  manifest.json    Install inventory and target paths
```

## Install

Copy the repo-managed bundle into `~/.codex`:

```bash
./codex/install/install.sh
```

Verify the installed state against `codex/manifest.json`:

```bash
./codex/install/doctor.sh
```

All scripts support overriding the target home for testing:

```bash
CODEX_HOME=/tmp/codex-test ./codex/install/install.sh
CODEX_HOME=/tmp/codex-test ./codex/install/doctor.sh
```

## Collision Note

Older upstream copies may still exist under locations such as
`~/.codex/superpowers/skills/`. The installer and doctor do not modify those
copies. They only warn about overlapping names so you can decide which install
surface to keep.

Deployment policy is copy-based. This bundle is meant to overwrite the managed
targets under `~/.codex`; it is not maintained through symlink-based installs.

## Maintenance

See:

- `codex/docs/maintenance.md`
- `codex/docs/routing-matrix.md`
- `codex/docs/upstream-map.md`
- `codex/docs/release.md`
