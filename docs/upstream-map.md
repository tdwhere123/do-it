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
| `do-it-architecture-scan` | architecture risk and opportunity scan | Absorbs codebase-improvement heuristics while keeping opportunities non-blocking unless correctness or delivery risk is real. |
| `do-it-interface-drill` | interface and boundary design | Absorbs interface-design drills for APIs, schemas, CLIs, events, UI contracts, and agent handoffs. |
| `do-it-domain-language` | canonical term and model alignment | Absorbs ubiquitous-language and domain-model discipline for overloaded terms, glossary updates, and contradictions between code/docs/user language. |
| `do-it-tdd` | behavior-first RED/GREEN loop | Absorbs behavior-via-public-interface testing and one-test-at-a-time tracer-bullet TDD. |
| `do-it-debugging` | root-cause investigation | Absorbs systematic debugging and issue triage: reproduce, trace, find root cause, then plan durable RED/GREEN fixes. |
| `do-it-subagent-orchestration` | delegated slice protocol | Absorbs parallel-agent dispatch and subagent-driven development, but defaults child agents to Standard slices instead of inheriting Heavy parent flows. |
| `do-it-review-loop` | correctness, quality, multi-perspective, and QA review | Absorbs review-request, multi-perspective review, and QA-session habits: durable behavior language, reviewer routing, and evidence-backed findings. |
| `do-it-fix-loop` | review-feedback repair | Absorbs receiving-review discipline: verify the feedback, fix root cause, rerun evidence, and re-review. |
| `do-it-verification-gate` | evidence-before-claims closeout | Absorbs legacy verification discipline and makes success claims depend on fresh commands or explicit evidence. |
| `do-it-worktree-isolation` | workspace isolation | Absorbs git-worktree setup and current-worktree safety into a do-it support skill. |
| `do-it-branch-closeout` | branch/PR/merge finish | Absorbs development-branch finish checks, commit/PR evidence, and cleanup choices. |
| `do-it-visual-planning` | optional planning companion | Absorbs the older visual brainstorming helper as an optional `.do-it/visual` support path, not a core workflow gate. Marked `optional: true` in `manifest.json` from 0.4.0; install with `--with-optional`. |
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

## Installed Agents

| Agent | do-it Role | Notes |
|---|---|---|
| `architect-reviewer` | architecture scan | Reviews boundaries, dependency direction, rollout risk, and durable design tradeoffs. |
| `code-mapper` | path map | Builds ownership, call-path, branch-point, and unknown maps before edits. |
| `code-quality-cleaner` | maintainability review lens | Finds redundancy, dead paths, avoidable abstraction, brittle tests, and cleanup risk. |
| `domain-language-reviewer` | domain review lens | Checks canonical terms, domain model contradictions, aliases, and naming drift. |
| `documentation-engineer` | docs interface drill | Keeps docs faithful to tooling, install flow, adapters, and operator workflows. |
| `install-release-reviewer` | install/release review lens | Reviews package metadata, manifest inventory, installer/doctor behavior, and release docs. |
| `plan-challenger` | plan grill | Challenges assumptions, scope, acceptance criteria, alternatives, and route sizing. |
| `react-specialist` | React interface drill | Handles component behavior, state flow, rendering, effects, and accessibility. |
| `red-team-reviewer` | adversarial review lens | Reviews security, state, persistence, concurrency, replay, and failure modes. |
| `reviewer` | correctness review lens | Performs PR-style correctness, regression, security, contract, and test review. |
| `sql-pro` | SQL interface drill | Reviews query semantics, migrations, transactions, storage contracts, and performance risk. |
| `spec-compliance-reviewer` | scope review lens | Checks changes against the written task, plan, acceptance criteria, and ownership boundary. |
| `skill-quality-reviewer` | skill quality review lens | Reviews skill trigger clarity, tier behavior, stop conditions, schemas, and cross-skill consistency. |
| `test-automator` | test drill | Adds or assesses durable regression coverage, fixtures, and harness behavior. |
| `tdd-red-writer` | RED-only contract drill | Writes failing tests only, then stops before implementation. |
| `typescript-pro` | TypeScript interface drill | Designs or edits types, APIs, package contracts, and compiler-driven fixes. |

## Adapter Notes

- Codex and Claude Code are first-class install targets as of 0.4.0; other
  agent runtimes (Cursor, OpenCode, Copilot CLI, Gemini) can be added via a
  new `manifest.targets.<name>` block. See `docs/maintenance.md` →
  "Claude Code Target" → "Adding a target".
- Each host should reuse the same do-it roles and translate only mechanics:
  skill invocation (Claude uses hooks instead of slash commands), subagent
  dispatch, file tools, sandbox controls, and verification commands.
- Subagents should receive a do-it slice contract: route, write ownership,
  current facts, verification expectation, stop condition, and return shape.
- Source-inspired text must be rewritten before installation. Do not vendor raw
  workflow copies into the public package.
