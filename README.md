# do-it Workflow

[English](./README.md) | [中文](./README.zh-CN.md)

[![npm version](https://img.shields.io/npm/v/@tdwhere/do-it.svg)](https://www.npmjs.com/package/@tdwhere/do-it)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

`do-it` is a cross-host workflow bundle for agentic software delivery. It
packages the operating habits that keep AI-assisted work useful: route the task,
inspect the current truth, plan only as much as the risk requires, implement in
bounded slices, review the result, fix findings, and make completion claims only
after fresh verification.

Two install targets are first-class as of 0.4.0:

- **Codex** (`do-it install` — default): copies skills to `~/.codex/skills` and
  TOML agents to `~/.codex/agents`.
- **Claude Code** (`do-it install --target=claude`, or via plugin marketplace):
  copies skills to `~/.claude/skills`, Markdown agents to `~/.claude/agents`,
  and wires hook scripts so the workflow auto-triggers without slash commands.

Both targets use the same `skills/do-it/*/SKILL.md` and `agents/*.toml` source.

## Upgrading to 0.5.0

`do-it 0.5.0` ships sharper hook triggering (no more single-CJK false fires,
ASCII word-boundary matching, ≥2-signal Heavy upgrade), same-session grill
de-duplication, automatic question / discussion mode, structured
`DO_IT_DEBUG=1` traces, and a `.do-it/grill/<task>.md` artifact contract.

Existing 0.4.x users do nothing special — `do-it install` detects the older
state, backs it up to `.pre-migrate.json`, and migrates silently. See
[`install/migrations/0.4-to-0.5.md`](./install/migrations/0.4-to-0.5.md) for
the breakdown. Use `do-it install --no-migrate` if you want to fail loudly
instead of migrating.

Debugging hooks: `DO_IT_DEBUG=1` makes each hook emit one stderr line per
decision (escape / skip / question / tier / trigger / evidence). Inspect
session state with `do-it doctor --session=<id>`.

## What This Package Provides

- A three-tier routing model for `Light`, `Standard`, and `Heavy` work.
- do-it-native skills for planning, slicing, pressure testing, implementation,
  TDD, debugging, review, fix loops, verification, worktree isolation, branch
  closeout, visual planning, and skill authoring.
- Portable Codex agent definitions for mapping, planning challenge, correctness
  review, architecture review, red-team review, spec compliance, domain language
  checks, install/release review, documentation, testing, and specialist drills.
- Copy-based installer and doctor commands that validate the managed Codex home
  entries against `manifest.json`.
- A release surface that works from a local checkout, a packed tarball, a GitHub
  repository, or the npm registry.

## Routing Model

`do-it` uses a small routing matrix instead of one fixed process for every task:

1. `Light` work is for small documentation edits, mechanical fixes, and narrow
   command checks. It normally stays local and ends with targeted verification.
2. `Standard` work is the default for ordinary implementation, bug fixes,
   refactors, and bounded policy updates. It uses a modification map, focused
   implementation, verification, and review when risk justifies it.
3. `Heavy` work is for waves, phases, public interfaces, architecture shifts,
   release work, or high-risk changes. The parent agent owns the plan, slice
   boundaries, review stack, fix loop, re-review, and closeout evidence.

See [docs/routing-matrix.md](./docs/routing-matrix.md) for the full policy.

## Install From npm

Install the CLI globally, then run setup:

```bash
npm install -g @tdwhere/do-it
do-it setup
```

`do-it setup` runs `do-it install` followed by `do-it doctor`.

- `do-it install` copies the managed skills and agents into `CODEX_HOME`.
- `do-it doctor` checks that the installed files and install state match the
  package manifest.
- `CODEX_HOME` defaults to `~/.codex`.

Use a temporary Codex home when testing an install:

```bash
CODEX_HOME=/tmp/do-it-codex-test do-it setup
```

The installer will not silently replace user-owned skill or agent files. If it
finds a target that is not already marked as do-it-managed, it stops. Set
`DO_IT_FORCE=1` only when you intentionally want the package to replace those
targets.

## Install In Claude Code

`do-it` ships as a Claude Code plugin. Install via the plugin marketplace:

```text
/plugin marketplace add tdwhere123/codex-workflow
/plugin install do-it
```

Or via the CLI (when not using marketplace):

```bash
do-it install --target=claude
do-it doctor --target=claude
```

The Claude target installs to `~/.claude/` by default; override with
`CLAUDE_PLUGIN_ROOT_OVERRIDE`. Optional skills (e.g. `do-it-visual-planning`)
are excluded by default — opt in with `--with-optional`.

The Claude target wires three hooks so the workflow shows up automatically:

- `UserPromptSubmit` → `do-it-router` (Light/Standard/Heavy classification)
  and `do-it-grill` (premise pressure-test)
- `PreToolUse(Edit|Write)` → grill plan-card and src-edit gates
- `Stop` → `do-it-verification-gate` (block completion claims without evidence)

There are no slash commands to remember. To bypass for one turn, include
`yolo`, `直接做`, `skip grill`, or `/do-it-skip` in the prompt.

## Install Before Registry Publication

For a GitHub-hosted package:

```bash
npm install -g github:OWNER/codex-workflow
do-it setup
```

For a packed release artifact:

```bash
npm pack
npm install -g ./tdwhere-do-it-0.3.0.tgz
do-it setup
```

## Local Development

From a checkout, use the package entrypoint:

```bash
npm exec --package . -- do-it setup
npm exec --package . -- do-it install
npm exec --package . -- do-it doctor
```

Equivalent package scripts are also available:

```bash
npm run setup
npm run install:do-it
npm run doctor
npm run do-it -- doctor
```

The shell wrappers remain for direct installer testing and delegate to the same
managed install behavior:

```bash
./install/install.sh
./install/doctor.sh
```

This package does not use npm lifecycle scripts to modify `~/.codex`.
Installation into Codex happens only when the operator runs `do-it setup` or
`do-it install`.

Before sending hook changes for review, run `npm run lint` (shellcheck via
`scripts/lint-hooks.sh`). CI runs the same script on push / PR.

## Repository Layout

```text
agents/          Portable Codex agent TOML definitions
bin/             The global do-it CLI entrypoint
docs/            Routing, maintenance, origin map, and release notes
install/         Installer, doctor, and shell wrapper entrypoints
skills/custom/   Local skill examples that are not installed by default
skills/do-it/    Installed do-it-native skill directories
manifest.json    Install inventory and target paths
package.json     npm package metadata and CLI scripts
```

The private `.do-it/` directory is for local plans, notes, and scratch
artifacts. It is ignored by Git and is not installed.

## Maintenance

Use [docs/maintenance.md](./docs/maintenance.md) when changing skills, agents,
installer behavior, or package metadata. In short:

1. Edit the maintained repository copy.
2. Update `manifest.json` when install inventory changes.
3. Keep `docs/routing-matrix.md` aligned with routing or closeout policy
   changes.
4. Verify with a temporary `CODEX_HOME`.
5. Publish only after the packed package contains the expected files.

Useful release checks:

```bash
npm pack --dry-run
CODEX_HOME=/tmp/do-it-codex-test npm exec --package . -- do-it setup
CODEX_HOME=/tmp/do-it-codex-test npm exec --package . -- do-it doctor
```

## Acknowledgements

`do-it` absorbs and rewrites useful workflow ideas from the Superpowers skill
ecosystem into a Codex-first package. The public names, routing model, installer,
and closeout policy are maintained here as do-it-native source.
