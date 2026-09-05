# do-it

[English](./README.md) | [中文](./README.zh-CN.md)

Professional coding judgment for Codex, Claude Code, Cursor, OpenCode, Pi, and
Kimi Code. do-it supplies task-fit skills, independent specialists, compact
context, and useful deterministic checks. The model chooses methods.

Core stays small: preserve the user's goal, settled decisions, and authorization
boundary; work from current facts and distinguish assumptions; fix the causal
owner with necessary scope; support claims with relevant evidence and name gaps.
Its self-check questions are optional thinking aids, not a required interview,
workflow, or report.

## Install

| Host | Command |
| --- | --- |
| Codex | `codex plugin marketplace add tdwhere123/do-it && codex plugin add do-it@tdwhere-do-it` |
| Claude Code | `/plugin marketplace add tdwhere123/do-it` → `/plugin install do-it@do-it` |
| Cursor | `npm run install:cursor-local` → Reload Window |
| OpenCode | `opencode plugin @tdwhere/do-it-opencode -g` |
| Pi | `pi install npm:@tdwhere/do-it-pi` |
| Kimi Code | `/plugins install https://github.com/tdwhere123/do-it` |

[Installation details](./docs/install.md) cover host setup and smoke checks.
Talk normally after installation. No task tier, mandatory router entry, or
.do-it scaffold is required. Reuse existing instructions and project documents;
write lightweight task notes only when they help continuity.

## Professional perspectives

Choose a skill directly when its description helps the work:

| Skill | Useful judgment |
| --- | --- |
| `do-it-core` | Stable principles for intent, facts, causal scope, and claims |
| `do-it-code-quality` | Causal ownership, contract fallout, and stateful failures |
| `do-it-architecture` | Authority, boundaries, compatibility, migration, and recovery |
| `do-it-decide` | Decision-changing uncertainty and meaningful alternatives |
| `do-it-review` | Requirements and implementation quality as distinct lenses |
| `do-it-verify` | Relevant evidence and the practical limits of delivery claims |
| `do-it-context` | Project terminology and factual consistency |
| `do-it-handbook` | Stable knowledge worth preserving in existing project docs |
| `do-it-retrospective` | On-demand reflection on observed outcomes |
| `do-it-skill-authoring` | Succinct triggers, unique judgment, and necessary boundaries |

`do-it-router` remains only as an explicit compatibility alias for discovery.

Independent agent contexts matter: they can gather fresh evidence and reach
conclusions without inheriting the parent's anchoring. Pass goals, scope,
settled decisions, and source facts; label parent opinions as hypotheses.
Meaningful specialist roles retain read-only or scoped-write restrictions. The
parent integrates results and verifies the combined work. Use independence when
it adds concrete value, with no blanket worker quota or forced delegation stage.

## Runtime

The default path delivers compact context and checks added source lines for
useful quality signals. These checks are advisory. Real host permissions remain
the mechanism for enforcing configured access and side effects.

Workflow classification, lexical router/grill reminders, completion-language
gates, automatic active-task takeover, and custom adaptive personalization have
been retired. Native host instructions or memory own persistent preferences.
Existing profiles, memory, task documents, and runtime pointers remain untouched.
[Migration guidance](./docs/simplification-migration.md) explains compatibility.

Evidence collection is explicitly opt-in diagnostics. Pi/OpenCode invoke the
observer only with `DO_IT_EVIDENCE_MODE=observe`; other hosts can explicitly
register or invoke it. Diagnostic events do not prove task acceptance. Report
actual relevant verification and its gaps; green tests alone do not establish
that the whole user goal is satisfied.

Write-quality numeric overrides remain data-only at
`.do-it/write-quality.local.tsv` beside the edited repository. Environment
values take precedence. See [quality families](./skills/do-it/references/write-quality-families.md).

## Development

```bash
npm run build:generated
npm run lint
npm test
```

Source skills live in `skills/do-it/`, agent roles in `agents/`, and hook owners
in `hooks/`. Host bundles are regenerated; maintained OpenCode `src/`, Pi
`extensions/` and host-specific agents are source exceptions. Installers,
validators, tests, and host details live in their corresponding directories.

See [maintenance](./docs/maintenance.md), [release policy](./docs/release.md), and
[contribution rules](./CONTRIBUTING.md). Changes should solve observed real-world
problems. do-it draws ideas from [mattpocock/skills](https://github.com/mattpocock/skills),
[addyosmani/agent-skills](https://github.com/addyosmani/agent-skills), and
[get-shit-done](https://github.com/gsd-build/get-shit-done); it ships its own
professional guidance. Thanks to the Linux.do community for real-world feedback.
