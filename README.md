# do-it Workflow

[![npm version](https://img.shields.io/npm/v/@tdwhere/do-it.svg)](https://www.npmjs.com/package/@tdwhere/do-it)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

`do-it` is a portable, GitHub-style workflow project for agentic software
delivery. It packages the operating discipline that should follow a task from
intent to closeout: route the work, map the affected system, execute with the
right amount of rigor, review the result, fix findings, and only then claim
completion.

The project is Codex-first. The maintained install target is `~/.codex`, with
portable skills under `~/.codex/skills` and agent definitions under
`~/.codex/agents`.

Claude Code compatibility is handled through adapter guidance rather than a
second source of truth. Use the same do-it roles and policies, then map them to
the equivalent Claude Code skills, subagents, tools, and sandbox controls in
that environment.

## What do-it Provides

- A three-tier router:
  - `Light`: local or single-agent, low-token, for bounded work.
  - `Standard`: the default engineering path and the default delegated
    subagent slice.
  - `Heavy`: parent-owned wave/phase, architecture, interface, or release work.
- Planning and pressure-test skills: `do-it-router`, `do-it-planning`,
  `do-it-slicing`, and `do-it-grill`.
- Architecture and boundary drills: `do-it-architecture-scan`,
  `do-it-interface-drill`, and `do-it-domain-language`.
- Execution and quality loops: `do-it-delivery-loop`, `do-it-tdd`,
  `do-it-debugging`, `do-it-subagent-orchestration`, `do-it-review-loop`,
  `do-it-fix-loop`, and `do-it-verification-gate`.
- Support skills: `do-it-worktree-isolation`, `do-it-branch-closeout`,
  `do-it-skill-authoring`, and optional `do-it-visual-planning`.
- Portable Codex agent definitions for mapping, planning challenge, correctness
  review, domain-language review, skill-quality review, install/release review,
  RED-only test writing, documentation, and specialist drills.
- Stable installer and doctor scripts for local validation.
- A private `.do-it/` workspace for local plans, notes, and scratch artifacts.
  It is ignored by Git and is not installed.

## Layout

```text
agents/          Portable Codex agent TOML definitions
docs/            Routing, maintenance, origin map, and release notes
install/         Local install and doctor entrypoints
skills/
  custom/        Repo-authored skills with no upstream counterpart
  do-it/         Installed do-it-native skill directories
manifest.json    Install inventory and target paths
```

## Global Install

Install the CLI globally, then run setup to copy the managed do-it skills and
agents into your Codex home:

```bash
npm install -g @tdwhere/do-it
do-it setup
```

`do-it setup` runs `do-it install` and then `do-it doctor`. The default target is
`~/.codex`; override it only for testing or custom Codex homes:

```bash
CODEX_HOME=/tmp/do-it-codex-test do-it setup
```

For a GitHub-hosted package before registry publication:

```bash
npm install -g github:OWNER/do-it
do-it setup
```

## Checkout Install

From a local checkout, use the package surface:

```bash
npm exec --package . -- do-it setup
npm exec --package . -- do-it install
npm exec --package . -- do-it doctor
```

Equivalent local package scripts may be used when present, such as
`npm run setup`, `npm run install:do-it`, `npm run doctor`, or
`npm run do-it -- install`.

The shell wrappers remain available and should delegate to the same install
behavior:

```bash
./install/install.sh
./install/doctor.sh
```

Use a temporary Codex home when testing installer behavior:

```bash
CODEX_HOME=/tmp/do-it-codex-test ./install/install.sh
CODEX_HOME=/tmp/do-it-codex-test ./install/doctor.sh
```

One-off package execution is also supported when users do not want a global CLI:

```bash
npm exec --yes --package @tdwhere/do-it -- do-it setup
```

Package commands and shell wrappers should share the same install and doctor
implementation instead of creating separate install paths.

Do not rely on npm lifecycle scripts to modify `~/.codex`. Installation into
Codex should happen only when the operator runs `do-it setup` or
`do-it install`.

If the installer finds an existing skill or agent file that was not previously
marked as do-it-managed, it stops instead of overwriting it. Set
`DO_IT_FORCE=1` only when you intentionally want the package to replace those
definitions.

## Collision Note

Older local workflow copies may still exist in other plugin or skill
directories. The installer and doctor manage only the targets declared in
`manifest.json`; they do not remove unrelated local files.

Deployment policy is copy-based. The managed targets under `~/.codex` are
overwritten from this repository; this project is not maintained through a
symlink-based install.

## Workflow Policy

Use `docs/routing-matrix.md` as the public policy source for choosing routing,
agent depth, and closeout gates. The short version:

1. Use `do-it-router` to classify the work as `Light`, `Standard`, or `Heavy`.
2. Use `do-it-planning` and `do-it-slicing` when the work needs a durable plan
   or independently grabbable slices.
3. Run `do-it-grill`, architecture scan, interface drill, or domain-language
   checks only when uncertainty, coupling, or public contracts justify them.
4. Keep implementation narrow and evidence-driven with the delivery, TDD,
   debugging, review, fix, and verification skills.
5. Report only what verification proves.

Subagents are part of the same workflow, not an exception to it. Every delegated
agent receives a narrow slice and defaults to the `Standard` path, even when the
parent is running a `Heavy` phase. Heavy subagent work must be explicitly
assigned. If a delegated agent discovers that its slice needs heavyweight
architecture, interface, or acceptance work that was not assigned, it stops and
reports `BLOCKED: requires heavy escalation` with evidence.

The parent remains responsible for integration, final verification, and closeout
claims.

## Maintenance

See:

- `docs/maintenance.md`
- `docs/routing-matrix.md`
- `docs/upstream-map.md`
- `docs/release.md`

## Acknowledgements

do-it absorbs and rewrites useful workflow ideas from the Superpowers skill
ecosystem into a Codex-first package. Thanks to Superpowers for the original
skill discipline and workflow patterns that informed this rewrite.
