# Source And Rewrite Map

This file records where do-it deliberately absorbs outside workflow ideas. It is
not an install manifest; `manifest.json` is the install source of truth.

The public package installs only do-it-native skill names. As of `0.14.0`, those
are meaning buckets (see migration table in [`CHANGELOG.md`](../CHANGELOG.md)).

## Installed Skills

| Installed Skill | Role | Rewrite Notes |
|---|---|---|
| `do-it-router` | front door and three-tier route selection | Absorbs strict skill-selection discipline, task sizing, and parent coordination. Meaning buckets are self-selected — no mandatory chain. |
| `do-it-code-quality` | write defense (main line) | Absorbs TDD, debugging, comments discipline, deep-module / seam vocabulary, interface/architecture contract checks, and worktree isolation into one write-time skill. |
| `do-it-decide` | pressure-test, diverge, plan, slice | Absorbs grill, brainstorm, planning, and slicing. Standard stays lean; Heavy earns ceremony. |
| `do-it-review` | review + atomic fix / re-review | Absorbs review-loop and fix-loop: findings-first batch, then repair until Blocking/Important clear. |
| `do-it-verify` | evidence before claims + closeout | Absorbs verification-gate **skill** and branch-closeout. The `verification-gate` **hook** remains. |
| `do-it-context` | canonical terms and model alignment | Absorbs ubiquitous-language / domain-model discipline (`.do-it/CONTEXT.md`). |
| `do-it-handbook` | lean handbook + worklog bootstrap | Seeds `.do-it/handbook/` and worklog templates; promotes stable facts without owning per-task review artifacts. |
| `do-it-skill-authoring` | skill creation and maintenance | Absorbs progressive-disclosure skill writing and repo-managed skill validation. |

Delegation has **no installed skill** — parent plain-text contract +
`subagent-stance` hook.

## External Idea Map

The do-it skills are rewrites, not vendored copies. Useful ideas from
`mattpocock/skills` are mapped this way:

| Source Idea | do-it Destination | Absorbed Shape |
|---|---|---|
| `to-prd` | `do-it-decide` | Current-context synthesis, module/test decisions, non-goals, and acceptance criteria. |
| `to-issues` | `do-it-decide` | Tracer-bullet vertical slices, HITL/AFK split, dependency order. |
| `grill-me`, `zoom-out` | `do-it-decide` | Decision-tree interview, recommended answers, and codebase exploration instead of asking answerable questions. |
| `request-refactor-plan` | `do-it-decide`, `do-it-code-quality` | Tiny safe steps, scope/non-scope, alternatives, test coverage. |
| `design-an-interface` | `do-it-code-quality` | Multiple radically different interface shapes before committing to a boundary. |
| `improve-codebase-architecture` | `do-it-code-quality` | Friction-led exploration, shallow-module detection, coupling and testability impact. |
| `tdd` | `do-it-code-quality` | Public-interface behavior tests and one RED/GREEN vertical slice at a time. |
| `triage-issue` | `do-it-code-quality` | Manifestation, code path, root cause, minimal fix, and TDD fix plan. |
| `qa` | `do-it-review`, `do-it-context` | User-facing durable issues, concise reproduction, and project domain language. |
| `ubiquitous-language`, `domain-model` | `do-it-context` | Canonical glossary, ambiguity flags, code/docs contradiction checks. |
| `write-a-skill` | `do-it-skill-authoring` | Concise SKILL.md, progressive disclosure, optional resources, and validation. |

Excluded or adapter-only ideas remain outside the core install flow unless a
future do-it skill explicitly needs them: article editing, exercise scaffolds,
Obsidian vault helpers, pre-commit setup, and runtime-specific guardrail
installers.

Useful ideas from `addyosmani/agent-skills` are absorbed as method rewrites,
not as installed skill names or vendored text:

| Source Idea | do-it Destination | Absorbed Shape |
|---|---|---|
| Skill anatomy: frontmatter, overview, trigger, workflow, rationalizations, red flags, verification | `do-it-skill-authoring` | Minimum skill anatomy for do-it-native skills. |
| Process over prose and progressive disclosure | All `skills/do-it/*/SKILL.md` | Skills stay operational and token-conscious. |
| Anti-rationalization tables | Core workflow skills | Common excuses rewritten as do-it-native red flags or review rules. |
| Evidence over assumption | `do-it-verify`, `do-it-review`, `do-it-decide` | Fresh current-worktree evidence and explicit `NOT_VERIFIED` closeout language. |
| Planning and task breakdown | `do-it-decide` | Assumption/evidence split, HITL/AFK, and task sizing. |
| Incremental implementation and test-led thin slices | `do-it-code-quality`, `do-it-decide` | Tracer-bullet slices, RED/GREEN per behavior, reproduce-localize-reduce-fix-guard. |
| API/interface design | `do-it-code-quality` | Producer/consumer/compatibility owner, additive change preference, migration proof. |
| Code review quality gates | `do-it-review` | Five-axis review, change-size split, proof-quality review. |
| Code simplification and deprecation mindset | `do-it-code-quality` | Simplicity check, code-as-liability check, removal/deprecation proof. |
| Source-driven context and security posture | `do-it-decide`, `do-it-context`, `do-it-review` | Research-first comparison for new surfaces; untrusted external-context boundary. |
| Performance and release proof discipline | `do-it-code-quality`, `do-it-verify`, `docs/maintenance.md` | Measure/verify before claiming readiness. |

Useful ideas from `gsd-build/get-shit-done` and `gsd-build/gsd-2` are absorbed
as do-it-native gates, not as a replacement state machine:

| Source Idea | do-it Destination | Absorbed Shape |
|---|---|---|
| Discuss-phase captures implementation decisions before planning | `do-it-decide` | Diverge briefly, pressure-test load-bearing premises, write shortest useful plan. |
| Assumptions discussion mode | `do-it-decide` | Read repo truth first; ask only when preference gates the route. |
| Decision coverage gates | `do-it-decide`, `do-it-review`, `spec-compliance-reviewer` | Requirements and decisions trace into a plan slice, delivered surface, or explicit deferral. |
| Plan checker and source-audit gaps | `do-it-review` | Missing coverage, unwired implementation, unused surfaces, and synthetic proof become findings. |
| Fresh context per task | parent delegation contract, `docs/routing-matrix.md` | Keep subagent slices bounded with exact facts, ownership, stop conditions, and return schemas. |

## Installed Agents

Ten agents after `0.14.0` merges:

| Agent | do-it Role | Notes |
|---|---|---|
| `architecture-strategist` | decide / architecture lens | Maps foundation, extension modules, boundaries, and verification route. |
| `product-strategist` | decide / product lens | Maps product boundary, core goal, requirement shape, and option tradeoffs. |
| `plan-challenger` | decide / grill sub-lens | Challenges assumptions, scope, acceptance criteria, and route sizing. |
| `code-mapper` | write / path map | Builds ownership, call-path, branch-point, and unknown maps before edits. |
| `code-quality-cleaner` | write / YAGNI + maintainability | Finds redundancy, dead paths, avoidable abstraction, and cleanup risk. |
| `tdd-red-writer` | write / RED-only contract | Writes failing tests only, then stops before implementation. |
| `reviewer` | review / correctness | PR-style correctness, regression, contract, and test review. |
| `red-team-reviewer` | review / adversarial | Security, state, persistence, concurrency, replay, and failure modes. |
| `spec-compliance-reviewer` | review / scope | Checks changes against the written task, plan, acceptance, and ownership. |
| `documentation-engineer` | docs | Keeps docs faithful to tooling, install flow, adapters, and operator workflows. |

Former supplemental lenses (CEO, UX, end-user, ops, domain-language,
install/release, skill-quality, language specialists, …) are absorbed into the
retained set or retired from the default install.

## Adapter Notes

- Plugin-first delivery is primary: Codex, Claude Code, and Cursor use their
  marketplaces; OpenCode uses an `opencode.json` plugin entry. Codex plugin hooks
  are trusted under `/hooks`. Optional CLI `do-it setup` remains for doctor /
  migration.
- Each host should reuse the same do-it roles and translate only mechanics:
  skill invocation, subagent dispatch, file tools, sandbox controls, and
  verification commands.
- Subagents should receive a do-it slice contract: route, write ownership,
  current facts, verification expectation, stop condition, and return shape.
- Source-inspired text must be rewritten before installation. Do not vendor raw
  workflow copies into the public package.
