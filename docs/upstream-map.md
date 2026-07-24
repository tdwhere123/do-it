# Source And Rewrite Map

This file records where do-it deliberately absorbs outside workflow ideas. It is
not an install manifest; `manifest.json` is the install source of truth.

The source version `0.14.1` defines nine user/runnable do-it-native skill names
plus one generated discovery entry; this is version metadata, not a publication
claim. The skills are meaning buckets (see the migration table in
[`CHANGELOG.md`](../CHANGELOG.md)).

**Lineage principle: convergence is not lineage.** Entries below record genuine
learning or borrowing relationships only. Capabilities do-it evolved
independently — three-tier routing, review's two axes, claim-specific
verification — are not retro-mapped onto upstream lookalikes, and sources that
were not absorbed from get no rows.

## Installed Skills

| Installed Skill | Role | Rewrite Notes |
| --- | --- | --- |
| `do-it-router` | front door and three-tier route selection | Absorbs strict skill-selection discipline, task sizing, and parent coordination. Meaning buckets are self-selected — no mandatory chain. |
| `do-it-code-quality` | write defense (main line) | Absorbs TDD, debugging, comments discipline, deep-module / seam vocabulary, interface/architecture contract checks, and worktree isolation into one write-time skill. |
| `do-it-decide` | pressure-test, diverge, plan, slice | Absorbs grill, brainstorm, planning, and slicing. Standard stays lean; Heavy raises scrutiny when it helps. |
| `do-it-review` | review + atomic fix / re-review | Absorbs review-loop and fix-loop: findings-first batch, then repair until Blocking/Important clear. |
| `do-it-verify` | evidence before claims + closeout | Absorbs claim-specific proof and branch-closeout. The `verification-gate` **hook** remains an advisory reminder. |
| `do-it-context` | canonical terms and model alignment | Absorbs ubiquitous-language / domain-modeling discipline (`.do-it/CONTEXT.md`). |
| `do-it-handbook` | lean handbook + worklog bootstrap | Seeds `.do-it/handbook/` and worklog templates; promotes stable facts without owning per-task review artifacts. |
| `do-it-skill-authoring` | skill creation and maintenance | Absorbs progressive-disclosure skill writing and repo-managed skill validation. |
| `do-it-retrospective` | opt-in local feedback/report loop | Keeps raw incidents local and redacted; turns repeated observations into a proposed, confirmed lesson rather than an automatic rule. |

Delegation has **no installed skill** — bundled agents are optional capability
experts. The parent gives a worker the goal and any needed ownership or
side-effect boundary; `subagent-stance` reinforces autonomous work, useful
evidence or uncertainty, and parent integration. There is no fixed contract,
agent count, or role matrix.

## External Idea Map

The do-it skills are rewrites, not vendored copies. Useful ideas from
`mattpocock/skills` are mapped this way:

| Source Idea | do-it Destination | Absorbed Shape |
| --- | --- | --- |
| `to-spec` | `do-it-decide` | Current-context synthesis, module/test decisions, non-goals, and acceptance criteria. |
| `to-tickets` | `do-it-decide` | Tracer-bullet vertical slices, HITL/AFK split, dependency order. |
| `grill-me`, `zoom-out` (deleted upstream; kept as historical) | `do-it-decide` | Decision-tree interview, recommended answers, and codebase exploration instead of asking answerable questions. |
| `request-refactor-plan` | `do-it-decide`, `do-it-code-quality` | Tiny safe steps, scope/non-scope, alternatives, test coverage. |
| `design-an-interface` | `do-it-code-quality` | Multiple radically different interface shapes before committing to a boundary. |
| `improve-codebase-architecture` | `do-it-code-quality` | Friction-led exploration, shallow-module detection, coupling and testability impact. |
| `tdd` | `do-it-code-quality` | Public-interface behavior tests and one RED/GREEN vertical slice at a time. |
| `triage` | `do-it-code-quality` | Manifestation, code path, root cause, minimal fix, and TDD fix plan. |
| `qa` | `do-it-review`, `do-it-context` | User-facing durable issues, concise reproduction, and project domain language. |
| `ubiquitous-language`, `domain-modeling` | `do-it-context` | Canonical glossary, ambiguity flags, code/docs contradiction checks. |
| `writing-great-skills` | `do-it-skill-authoring` | Concise SKILL.md, progressive disclosure, optional resources, and validation. |
| `resolving-merge-conflicts` | `do-it-code-quality` | Hunk-by-hunk resolution by intent traced to each side's source; never `--abort`; run the project's checks after finishing. |
| `research` | `do-it-decide` | Primary-source citation; durable findings captured into worklog/handbook instead of re-researching. |

Upstream drift: `qa`, `design-an-interface`, `request-refactor-plan`, and
`ubiquitous-language` now live in upstream's `deprecated/` — the absorptions
above remain valid; the sources are retired.

Excluded or adapter-only ideas remain outside the core install flow unless a
future do-it skill explicitly needs them: article editing, exercise scaffolds,
Obsidian vault helpers, pre-commit setup, and runtime-specific guardrail
installers.

Useful ideas from `addyosmani/agent-skills` are absorbed as method rewrites,
not as installed skill names or vendored text:

| Source Idea | do-it Destination | Absorbed Shape |
| --- | --- | --- |
| Skill anatomy: frontmatter, overview, trigger, workflow, rationalizations, red flags, verification | `do-it-skill-authoring` | Minimum skill anatomy for do-it-native skills. |
| Process over prose and progressive disclosure | All `skills/do-it/*/SKILL.md` | Skills stay operational and token-conscious. |
| Anti-rationalization tables | Core workflow skills | Common excuses rewritten as do-it-native red flags or review rules. |
| Evidence over assumption | `do-it-verify`, `do-it-review`, `do-it-decide` | Fresh current-worktree evidence and explicit `NOT_VERIFIED` closeout language. |
| Planning and task breakdown | `do-it-decide` | Assumption/evidence split, HITL/AFK, and task sizing. |
| Incremental implementation and test-led thin slices | `do-it-code-quality`, `do-it-decide` | Tracer-bullet slices, RED/GREEN per behavior, reproduce-localize-reduce-fix-guard. |
| API/interface design | `do-it-code-quality` | Producer/consumer/compatibility owner, additive change preference, migration proof. |
| Code review quality lenses | `do-it-review` | Risk-matched review axes, change-size split, proof-quality review. |
| Code simplification and deprecation mindset | `do-it-code-quality` | Simplicity check, code-as-liability check, removal/deprecation proof. |
| Source-driven context and security posture | `do-it-decide`, `do-it-context`, `do-it-review` | Research-first comparison for new surfaces; untrusted external-context boundary. |
| Performance and release proof discipline | `do-it-code-quality`, `do-it-verify`, `docs/maintenance.md` | Measure/verify before claiming readiness. |
| `observability-and-instrumentation` | `do-it-code-quality`, `do-it-verify` | Named production evidence surface (log / metric / trace) as done-ness; `runs in production` claims need production-side evidence. |
| `documentation-and-adrs`; mattpocock ADR practice | `do-it-handbook` | Optional `decisions.md` promotion — one file, one paragraph per permanently settled route. |
| `doubt-driven-development` | `do-it-decide` | Fresh-context challenge applies in-flight while deciding, not only on finished diffs. |

Useful ideas from `gsd-build/get-shit-done` and `gsd-build/gsd-2` are absorbed
as do-it-native decision support, not as a replacement state machine:

| Source Idea | do-it Destination | Absorbed Shape |
| --- | --- | --- |
| Discuss-phase captures implementation decisions before planning | `do-it-decide` | Diverge briefly, pressure-test load-bearing premises, write shortest useful plan. |
| Assumptions discussion mode | `do-it-decide` | Read repo truth first; ask only when preference gates the route. |
| Decision coverage | `do-it-decide`, `do-it-review`, `spec-compliance-reviewer` | Requirements and decisions trace into a plan slice, delivered surface, or explicit deferral when that coverage matters. |
| Plan checker and source-audit gaps | `do-it-review` | Missing coverage, unwired implementation, unused surfaces, and synthetic proof become findings. |
| Fresh context per task | parent delegation guidance, `docs/routing-matrix.md` | Give a worker its goal and needed ownership boundary; let it return useful evidence or uncertainty. |

## Installed Agents

Ten agents in `0.14.1`:

| Agent | do-it Role | Notes |
| --- | --- | --- |
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

- Host-native delivery is primary: Codex and Claude Code are marketplace-first;
  Cursor uses local copy / Team Import while public listing is pending; OpenCode
  and Pi ship independent npm packages with local or vendored fallbacks.
  Optional CLI `do-it setup` remains for managed doctor / migration.
- Each host should reuse the same do-it roles and translate only mechanics:
  skill invocation, subagent dispatch, file tools, sandbox controls, and
  verification commands.
- Bundled agents are optional capability experts, not a required pipeline.
  Parent prompts give a useful goal and only the ownership or side-effect
  context the slice needs; the parent integrates the result.
- Source-inspired text must be rewritten before installation. Do not vendor raw
  workflow copies into the public package.
