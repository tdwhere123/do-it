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
doctor command to prove the repository and live global entries match.

For workflow policy changes, update `docs/routing-matrix.md` so
`do-it-router`, the three-tier routing model, planning, slicing, drills,
implementation, review, fix-loop, verification, and closeout guidance stay
aligned.

## Package And CLI Coordination

The durable public concept is global npm installation through the `do-it` CLI.
Current package work exposes a `do-it` bin and local package scripts. Keep docs
stable:

- use `npm install -g @tdwhere/do-it` followed by `do-it setup` as the public
  registry path
- mention `npm install -g github:OWNER/do-it` for GitHub-hosted pre-registry
  installs
- use `npm exec --package . -- do-it setup` for checkout-local package examples
  when the package surface is present
- keep `do-it install` and `do-it doctor` documented as the underlying split
  commands for CI, debugging, or partial checks
- do not invent package.json scripts or release coordinates that are not present
- make future package commands delegate to the same installer and doctor logic

Current validation commands:

```bash
npm exec --package . -- do-it setup
npm exec --package . -- do-it install
npm exec --package . -- do-it doctor
./install/install.sh
./install/doctor.sh
CODEX_HOME=/tmp/do-it-codex-test ./install/install.sh
CODEX_HOME=/tmp/do-it-codex-test ./install/doctor.sh
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
- optional auxiliary support, such as visual planning, that is installed but not
  part of the default tier flow

For either kind:

1. Edit the maintained copy under `skills/`.
2. Remove stale support files if the rewritten skill no longer references them.
3. Update `docs/routing-matrix.md` when routing, stack depth, or closeout gates
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
6. Update `docs/routing-matrix.md` if the agent changes default planning,
   implementation, review, or closeout flow.

Review coverage should stay explicit. Keep dedicated read-only reviewer agents
for correctness, scope compliance, maintainability, architecture, red-team,
domain-language, skill-quality, and install/release readiness. Writer
specialists can support drills or fixes, but they should not be counted as the
only Heavy review lens unless the parent explicitly scopes them as read-only and
the report satisfies the review schema.

Each agent should keep the subagent tier contract explicit:

- default delegated implementation is a `Standard` do-it slice;
- `Light` is allowed only for tightly bounded mechanical checks;
- `Heavy` requires explicit parent assignment;
- if unassigned Heavy work is required, the agent stops with
  `BLOCKED: requires heavy escalation` and evidence.

## Claude Code Adapter Guidance

Codex remains the primary install target. For Claude Code compatibility, adapt
the roles rather than forking the policy:

- map `do-it-router` to the environment's routing or skill-selection mechanism
- map `do-it-grill` to subagent review, plan challenge, and closeout checks
- preserve the parent agent as coordinator and final verifier
- translate tool names, sandbox controls, and file-edit mechanics locally
- keep source-of-truth edits in this repository

## Delegated Agent Maintenance

Agent descriptions should make clear that subagents run a do-it slice, not an
unstructured side quest. When adding or changing an agent:

- state whether it is a mapper, drill, reviewer, specialist, or implementer;
- keep its write permissions narrow;
- require it to inspect current truth before acting;
- require verification evidence when it edits files;
- require residual risk and stop conditions in the return shape;
- remind implementation agents that the parent owns integration and final
  claims.

The delegated prompt contract belongs in `do-it-subagent-orchestration` and
should be reflected in agent descriptions when practical: tier, scope, write
ownership, forbidden paths, current truth, must-verify facts, stop condition,
and return schema.

## Verification

Recommended checks before committing workflow changes:

```bash
./install/install.sh
./install/doctor.sh
CODEX_HOME=/tmp/do-it-codex-test ./install/install.sh
CODEX_HOME=/tmp/do-it-codex-test ./install/doctor.sh
```

Also run targeted sweeps for stale references after substantial rewrites, for
example old project names, obsolete save paths, deleted support files, or
commands that belong to an adapter instead of the Codex-first workflow.
