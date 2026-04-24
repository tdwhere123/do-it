# Maintenance Guide

## Source Of Truth

The repository copy under `codex/` is the only maintained source of truth.

This subtree is for workflow maintenance and sync work, not ordinary project
delivery. Day-to-day product implementation should follow the repo docs and task
cards, not `codex/docs/*`.

Working rule:

1. Edit files in `codex/`.
2. Deploy them with `codex/install/install.sh`.
3. Avoid hand-editing the deployed copies under `~/.codex`.

Exception: for an intentional live-global rebaseline, copy only manifest-managed
targets from `~/.codex` back into `codex/`, then run `codex/install/doctor.sh`
to prove the repo and live global entries match.

For workflow policy changes, also update `codex/docs/routing-matrix.md` so the
entrypoint, planning, implementation, and review layers stay aligned.

## Updating A Managed Skill

When a skill changes, decide which kind of update it is:

- upstream sync reference
- repo-authored rewrite
- hybrid rewrite that keeps the installed name but changes the body

For any of the three:

1. Edit the maintained copy under `codex/skills/`.
2. Remove stale support files if the rewritten skill no longer references them.
3. Update `codex/docs/routing-matrix.md` when routing or stack depth changes.
4. Update `codex/docs/upstream-map.md` when origin notes or rewrite status
   changed.
5. Update `codex/manifest.json` only if inventory, source paths, or install
   targets changed.
6. Run `./codex/install/doctor.sh` or test against a temporary `CODEX_HOME`.

Upstream copies are reference material, not truth. Do not re-import text
blindly; first remove stale tool assumptions, mode assumptions, and repo-path
assumptions that do not hold for the maintained bundle.

## Adding A New Skill

For a skill based on outside material:

1. Copy the source into `codex/skills/upstream/` or rewrite it into a stable
   install name there.
2. Add a `skills[]` entry to `codex/manifest.json`.
3. Record the origin and rewrite notes in `codex/docs/upstream-map.md`.

For a repo-authored skill:

1. Create a new directory under `codex/skills/custom/`.
2. Add a `skills[]` entry to `codex/manifest.json`.
3. Keep the install target name unique to avoid collisions.
4. Update `codex/docs/routing-matrix.md` if the skill changes routing policy.

## Adding A New Agent

1. Add the `.toml` file under `codex/agents/`.
2. Add the matching `agents[]` entry to `codex/manifest.json`.
3. Verify the agent file does not include machine-specific paths or credentials.
4. Update `codex/docs/routing-matrix.md` if the new agent changes default
   planning, implementation, or review flow.

## Verification

Recommended checks before committing workflow changes:

```bash
./codex/install/install.sh
./codex/install/doctor.sh
CODEX_HOME=/tmp/codex-workflow-test ./codex/install/install.sh
CODEX_HOME=/tmp/codex-workflow-test ./codex/install/doctor.sh
```

Also run targeted sweeps for stale references after substantial rewrites, for
example outdated tool names, obsolete save paths, or deleted support files.
