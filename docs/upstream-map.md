# Source And Rewrite Map

This file records where do-it deliberately absorbs outside workflow ideas. It is
not an install manifest; `manifest.json` is the install source of truth.

The public package now installs only do-it-native skill names. Older workflow
copies are kept out of the install surface so stale names, paths, and
runtime-specific assumptions do not leak into new Codex installs.

## Installed Skills

| Installed Skill | Role | Rewrite Notes |
|---|---|---|
| `do-it-router` | front door and three-tier route selection | Absorbs strict skill-selection discipline, task sizing, token-budget awareness, and parent-agent coordination into a Codex-first router. |
| `do-it-planning` | durable plan or PRD handoff | Absorbs plan writing, PRD synthesis, non-goal capture, acceptance criteria, and test decision capture. |
| `do-it-slicing` | vertical-slice breakdown | Absorbs tracer-bullet issue planning, dependency ordering, and HITL/AFK marking while keeping do-it local-first unless issue creation is explicitly requested. |
| `do-it-grill` | plan, review-response, and closeout pressure test | Absorbs adversarial questioning, decision-tree challenge, zoom-out checks, review response skepticism, and closeout honesty. It challenges review-loop output rather than owning delivered diff review. |
| `do-it-brainstorm` | requirement-shape discovery before grill | Absorbs multi-perspective divergence into a product + architecture core flow: product boundary, core goal, option tradeoffs, architecture foundation, extension modules, and explicit grill handoff. |
| `do-it-architecture-scan` | architecture risk and opportunity scan | Absorbs codebase-improvement heuristics while keeping opportunities non-blocking unless correctness or delivery risk is real. |
| `do-it-interface-drill` | interface and boundary design | Absorbs interface-design drills for APIs, schemas, CLIs, events, UI contracts, and agent handoffs. |
| `do-it-context` § Domain Glossary Mode | canonical term and model alignment | Absorbs ubiquitous-language and domain-model discipline for overloaded terms, glossary updates, and contradictions between code/docs/user language. (Folded in from the former `do-it-domain-language` skill.) |
| `do-it-tdd` | behavior-first RED/GREEN loop | Absorbs behavior-via-public-interface testing and one-test-at-a-time tracer-bullet TDD. |
| `do-it-debugging` | root-cause investigation | Absorbs systematic debugging and issue triage: reproduce, trace, find root cause, then plan durable RED/GREEN fixes. |
| `do-it-subagent-orchestration` | delegated slice protocol | Absorbs parallel-agent dispatch and subagent-driven development, but defaults child agents to Standard slices instead of inheriting Heavy parent flows. |
| `do-it-review-loop` | correctness, quality, multi-perspective, and QA review | Absorbs review-request, multi-perspective review, and QA-session habits: durable behavior language, reviewer routing, and evidence-backed findings. |
| `do-it-fix-loop` | review-feedback repair | Absorbs receiving-review discipline: verify the feedback, fix root cause, rerun evidence, and re-review. |
| `do-it-verification-gate` | evidence-before-claims closeout | Absorbs legacy verification discipline and makes success claims depend on fresh commands or explicit evidence. |
| `do-it-worktree-isolation` | workspace isolation | Absorbs git-worktree setup and current-worktree safety into a do-it support skill. |
| `do-it-branch-closeout` | branch/PR/merge finish | Absorbs development-branch finish checks, commit/PR evidence, and cleanup choices. |
| `do-it-planning` § Visual Aids | optional planning companion | Absorbs the older visual brainstorming helper as an optional `.do-it/visual` support path, not a core workflow gate. (Folded in from the former `do-it-visual-planning` skill; the browser companion was retired.) |
| `do-it-skill-authoring` | skill creation and maintenance | Absorbs progressive-disclosure skill writing and repo-managed skill validation. |

## External Idea Map

The do-it skills are rewrites, not vendored copies. Useful ideas from
`mattpocock/skills` are mapped this way:

| Source Idea | do-it Destination | Absorbed Shape |
|---|---|---|
| `to-prd` | `do-it-planning` | Current-context synthesis, module/test decisions, non-goals, and acceptance criteria. |
| `to-issues` | `do-it-slicing` | Tracer-bullet vertical slices, HITL/AFK split, dependency order, independently grabbable work. |
| `grill-me`, `zoom-out` | `do-it-grill` | Decision-tree interview, recommended answers, and codebase exploration instead of asking answerable questions. |
| `request-refactor-plan` | `do-it-planning`, `do-it-slicing`, `do-it-architecture-scan` | Tiny safe steps, scope/non-scope, alternatives, test coverage, and refactor RFC shape. |
| `design-an-interface` | `do-it-interface-drill` | Multiple radically different interface shapes before committing to a boundary. |
| `improve-codebase-architecture` | `do-it-architecture-scan` | Friction-led exploration, shallow-module detection, deep-module candidates, coupling and testability impact. |
| `tdd` | `do-it-tdd` | Public-interface behavior tests and one RED/GREEN vertical slice at a time. |
| `triage-issue` | `do-it-debugging` | Manifestation, code path, root cause, minimal fix, and TDD fix plan. |
| `qa` | `do-it-review-loop`, `do-it-domain-language` | User-facing durable issues, concise reproduction, and project domain language. |
| `ubiquitous-language`, `domain-model` | `do-it-domain-language` | Canonical glossary, ambiguity flags, code/docs contradiction checks, and lightweight ADR triggers. |
| `write-a-skill` | `do-it-skill-authoring` | Concise SKILL.md, progressive disclosure, optional resources, and validation. |

Excluded or adapter-only ideas remain outside the core install flow unless a
future do-it skill explicitly needs them: article editing, exercise scaffolds,
Obsidian vault helpers, pre-commit setup, and runtime-specific guardrail
installers.

Useful ideas from `addyosmani/agent-skills` are absorbed as method rewrites,
not as installed skill names or vendored text:

| Source Idea | do-it Destination | Absorbed Shape |
|---|---|---|
| Skill anatomy: frontmatter, overview, trigger, workflow, rationalizations, red flags, verification | `do-it-skill-authoring` | Minimum skill anatomy for do-it-native skills, with trigger-first descriptions, tiers/process, stop conditions, anti-skip checks, red flags, and evidence. |
| Process over prose and progressive disclosure | All `skills/do-it/*/SKILL.md` | Skills stay operational and token-conscious; heavy references remain outside the main entry point only when needed. |
| Anti-rationalization tables | Core workflow skills | Common excuses are rewritten as do-it-native rationalizations, red flags, or review/failure-handling rules. |
| Evidence over assumption | `do-it-verification-gate`, `do-it-review-loop`, `do-it-planning` | Fresh current-worktree evidence, verification-of-verification, assumption tracking, and explicit `NOT_VERIFIED` closeout language. |
| Planning and task breakdown: assumptions, small tasks, dependencies | `do-it-planning`, `do-it-slicing` | Assumption/evidence split, Always/Ask/Never boundaries, dependency graph, checkpoint, HITL/AFK, and task sizing. |
| Incremental implementation and test-led thin slices | `do-it-tdd`, `do-it-debugging`, `do-it-slicing` | Tracer-bullet slices, RED/GREEN per behavior, reproduce-localize-reduce-fix-guard loop, and per-slice verification. |
| API/interface design: contract-first, Hyrum's Law, error semantics, boundary validation | `do-it-interface-drill` | Producer/consumer/compatibility owner, additive change preference, consistent errors, boundary validation, and migration proof. |
| Code review quality gates and change sizing | `do-it-review-loop` | Five-axis review, change-size split, dependency/dead-code checks, generated-output checks, and proof-quality review. |
| Code simplification and deprecation mindset | `do-it-architecture-scan` | Simplicity check, code-as-liability check, removal/deprecation proof, and failure-isolation review. |
| Source-driven context and security posture | `do-it-planning`, `do-it-context`, `do-it-review-loop` | Research-first comparison for new surfaces, context hierarchy, untrusted external-context boundary, and current-source evidence for dependency/protocol choices. |
| Performance and release proof discipline | `do-it-architecture-scan`, `do-it-verification-gate`, `docs/maintenance.md` | Measure/verify before claiming readiness; package/install claims require temp-home, doctor, build, or pack evidence. |

Useful ideas from `gsd-build/get-shit-done` and `gsd-build/gsd-2` are absorbed
as do-it-native gates, not as a replacement state machine:

| Source Idea | do-it Destination | Absorbed Shape |
|---|---|---|
| Discuss-phase captures implementation decisions before planning | `do-it-brainstorm`, `do-it-grill`, `do-it-planning` | Brainstorm maps options and tradeoffs, grill asks one decision at a time with context/options/recommendation, and planning checks every decision is covered or explicitly deferred. |
| Assumptions discussion mode | `do-it-grill` | Read repo truth first, state concrete assumptions with evidence, and ask the user to confirm or correct the one assumption that changes execution. |
| Decision coverage gates | `do-it-planning`, `do-it-review-loop`, `spec-compliance-reviewer` | Requirements, grill decisions, and brainstorm handoff items must trace into a plan slice, delivered surface, verification witness, or explicit user-confirmed deferral. |
| Plan checker and source-audit gaps | `do-it-review-loop`, `do-it-fix-loop` | Missing coverage, unwired implementation, unused delivered surfaces, and synthetic proof become review findings; in-scope Blocking/Important findings are repaired now unless the user confirms deferral. |
| Fresh context per task | `do-it-subagent-orchestration`, `docs/routing-matrix.md` | Keep subagent slices bounded with exact facts, ownership, stop conditions, and return schemas instead of carrying broad parent context into every worker. |

## Installed Agents

| Agent | do-it Role | Notes |
|---|---|---|
| `architect-reviewer` | architecture scan | Reviews boundaries, dependency direction, rollout risk, and durable design tradeoffs. |
| `architecture-strategist` | brainstorm architecture core | Maps foundation, extension modules, stage closure, boundaries, and verification route before grill convergence. |
| `ceo-reviewer` | supplemental business brainstorm lens | Reviews board-level value, market window, revenue path, pivot cost, and opportunity cost only when task-fit. |
| `code-mapper` | path map | Builds ownership, call-path, branch-point, and unknown maps before edits. |
| `code-quality-cleaner` | maintainability review lens | Finds redundancy, dead paths, avoidable abstraction, brittle tests, and cleanup risk. |
| `domain-language-reviewer` | domain review lens | Checks canonical terms, domain model contradictions, aliases, and naming drift. |
| `documentation-engineer` | docs interface drill | Keeps docs faithful to tooling, install flow, adapters, and operator workflows. |
| `end-user-advocate` | supplemental end-user brainstorm lens | Reviews real-use conditions, pain points, mental-model mismatch, workarounds, and recovery only when task-fit. |
| `install-release-reviewer` | install/release review lens | Reviews package metadata, manifest inventory, installer/doctor behavior, and release docs. |
| `ops-sre` | supplemental operations brainstorm lens | Reviews deploy, rollback, observability, migration, scale, and on-call implications only when task-fit. |
| `plan-challenger` | plan grill | Challenges assumptions, scope, acceptance criteria, alternatives, and route sizing. |
| `product-strategist` | brainstorm product core | Maps product boundary, core goal, requirement shape, and option tradeoffs before grill convergence. |
| `react-specialist` | React interface drill | Handles component behavior, state flow, rendering, effects, and accessibility. |
| `red-team-reviewer` | adversarial review lens | Reviews security, state, persistence, concurrency, replay, and failure modes. |
| `reviewer` | correctness review lens | Performs PR-style correctness, regression, security, contract, and test review. |
| `sql-pro` | SQL interface drill | Reviews query semantics, migrations, transactions, storage contracts, and performance risk. |
| `spec-compliance-reviewer` | scope review lens | Checks changes against the written task, plan, acceptance criteria, and ownership boundary. |
| `skill-quality-reviewer` | skill quality review lens | Reviews skill trigger clarity, tier behavior, stop conditions, schemas, and cross-skill consistency. |
| `test-automator` | test drill | Adds or assesses durable regression coverage, fixtures, and harness behavior. |
| `tdd-red-writer` | RED-only contract drill | Writes failing tests only, then stops before implementation. |
| `typescript-pro` | TypeScript interface drill | Designs or edits types, APIs, package contracts, and compiler-driven fixes. |
| `ux-designer` | supplemental UX brainstorm lens | Reviews flow, discoverability, accessibility, visual hierarchy, and copy only when task-fit. |

## Adapter Notes

- Codex global setup and Claude Code are first-class install targets; Codex
  plugin marketplace discovery is generated under `plugins/do-it/` and should
  be paired with global setup when enforced hooks are required. Other agent
  runtimes (Cursor, OpenCode, Copilot CLI, Gemini) can be added via a new
  `manifest.targets.<name>` block. See `docs/maintenance.md` for target and
  plugin maintenance rules.
- Each host should reuse the same do-it roles and translate only mechanics:
  skill invocation (Claude uses hooks instead of slash commands), subagent
  dispatch, file tools, sandbox controls, and verification commands.
- Subagents should receive a do-it slice contract: route, write ownership,
  current facts, verification expectation, stop condition, and return shape.
- Source-inspired text must be rewritten before installation. Do not vendor raw
  workflow copies into the public package.
