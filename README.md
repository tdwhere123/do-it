# do-it

[English](./README.md) | [中文](./README.zh-CN.md)

Professional coding judgment for Codex, Claude Code, Cursor, Pi, and Grok Build.
do-it supplies task-fit skills, independent specialists, compact
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
| Pi | `pi install npm:@tdwhere/do-it-pi` |
| Grok Build | [Generated bundle installation](./docs/install.md#grok-build) |

[Installation details](./docs/install.md) cover host setup and smoke checks.
The 0.18.1 source update is unreleased; marketplace or npm installation may
serve an earlier version. Codex specialists require the separate native-agent
setup described in that guide. OpenCode and Kimi Code repository support is
retired; local applications and user configuration remain untouched.
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
| `do-it-audit` | Explicit deep audits with file coverage and independent causal synthesis |
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

## Deep audit on request

Explicitly request `do-it-audit` through the host's native skill entry or ask,
for example: "Use do-it-audit for the whole repository" or "Deep-audit the
storage subsystem for recovery and data integrity." Scope and risk focus are
separate choices; already stated choices do not require another interview.

On a host with subagent support, the parent initiates independent correctness,
architecture, and maintainability review after establishing scope and inventory.
Specialists receive bounded module or contract slices and their own perspective;
agent counts follow the work. Dead code, redundant mechanisms, and safe
simplification receive substantive attention alongside functional defects.

Coverage distinguishes file assignment, substantive inspection, and cross-module
checks. Valid evidence is reused, and generated copies or assets receive suitable
consistency or integrity checks. A fresh independent context tests the combined
findings and causal explanations before repair recommendations, using targeted
source checks rather than repeating the whole audit. Reports lead with diagnosis;
missing coverage, delegation capability, or synthesis is stated honestly.
Inspection is read-only by default, with no automatic fixes or report files.
Ordinary review keeps its existing scope. This is skill guidance, not a new
command framework or runtime permission gate.

## Runtime

The default path delivers compact context and checks added source lines for
useful quality signals. These checks are advisory. Real host permissions remain
the mechanism for enforcing configured access and side effects.

Workflow classification, lexical router/grill reminders, completion-language
gates, automatic active-task takeover, and custom adaptive personalization have
been retired. Native host instructions or memory own persistent preferences.
Existing profiles, memory, task documents, and runtime pointers remain untouched.
[Migration guidance](./docs/simplification-migration.md) explains compatibility.

Evidence collection is explicitly opt-in diagnostics. Pi invokes the
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
in `hooks/`. Core’s marked bootstrap excerpt generates hook context; indexes
preserve the complete skill descriptions. Pi agents are generated from
`agents/*.toml` with adapter metadata and coordination wording; Pi `extensions/`
remain maintained source. See [architecture](./docs/architecture.md). Installers,
validators, tests, and host details live in their corresponding directories.

See [maintenance](./docs/maintenance.md), [release policy](./docs/release.md), and
[contribution rules](./CONTRIBUTING.md). Changes should solve observed real-world
problems. do-it draws ideas from [mattpocock/skills](https://github.com/mattpocock/skills),
[addyosmani/agent-skills](https://github.com/addyosmani/agent-skills), and
[get-shit-done](https://github.com/gsd-build/get-shit-done); it ships its own
professional guidance. The [architecture comparison](./docs/architecture.md#upstream-comparison)
records five additional upstream sources and the concrete ideas adopted for 0.18.1. Thanks to the Linux.do community for real-world feedback.
