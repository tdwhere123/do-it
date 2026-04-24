# Workflow Routing Matrix

This document is the policy source for choosing planning, implementation,
review, and closeout intensity across task sizes.

Agent-based variants are optional overlays. When delegation is unavailable or
not allowed, run the same lens locally instead of inventing a second workflow.

## Task Classes

| Class | Typical Shape | Default Planning Skill | Default Implementation Mode | Default Review Stack |
|---|---|---|---|---|
| `task` | One bounded behavior, bugfix, or documentable deliverable | `decision-first-brainstorming` when intent is still unstable; otherwise direct handoff | local/mechanical for trivial edits, otherwise single-agent TDD | local review for trivial edits; `reviewer + code-quality-cleaner` for non-trivial work |
| `wave` | Several related deliverables or one coordinated integration slice | `decision-first-brainstorming` with architecture and acceptance stress tests | single-agent TDD unless dual-agent triggers fire | at least `reviewer + code-quality-cleaner` |
| `phase` | Cross-wave boundary, release/gate, workflow policy, or durable system change | `decision-first-brainstorming` with domain/risk lenses | selective dual-agent TDD for plan-driven implementation | `reviewer + code-quality-cleaner + architect-reviewer + one domain/risk reviewer` |

## Planning Rules

Every implementation-ready handoff should name:

- task class
- goal and non-goals
- success criteria
- discovered facts that matter
- chosen approach and rejected alternatives when relevant
- implementation mode
- review stack

Use these lenses to size the planning stack:

- `plan-challenger` or equivalent local challenge for non-trivial scope,
  maintenance, or ambiguity risk
- `architect-reviewer` for ownership, package-boundary, or long-term coupling
  questions
- one domain/risk lens for UI, types/API, SQL/storage, or security/failure-mode
  heavy work

## Implementation Modes

### Mode A: Local / Mechanical

Use for tiny, low-risk edits where routing through a larger workflow would only
add latency.

### Mode B: Single-Agent TDD

Default for ordinary non-trivial work:

1. make a modification map first
2. write or tighten the smallest failing test when practical
3. verify RED for the expected reason
4. implement the minimal GREEN change
5. verify GREEN
6. refactor only while staying green

### Mode C: Dual-Agent TDD

Use when one or more are true:

- the behavior change crosses multiple files or boundaries
- bug root cause is unclear
- protocol, API, state, persistence, or UI-state contracts are changing
- regression risk is high enough that RED should lock the contract first
- test harness or fixture work is substantial on its own

When delegation is available, the typical split is:

1. `code-mapper`
2. `tdd-red-writer` for RED only
3. controller verifies RED
4. implementer owns GREEN
5. controller verifies GREEN
6. review stack

## Review Stack Rules

- `task`: trivial edits may stay local; non-trivial work defaults to
  `reviewer + code-quality-cleaner`
- `wave`: keep at least the same two-reviewer stack even when tests are green
- `phase`: default four-reviewer pack
- add `spec-compliance-reviewer` before the quality stack when the work is
  tightly tied to a task card, plan, or acceptance contract and scope drift is a
  real risk

Domain/risk reviewer selection:

- `red-team-reviewer` for state, persistence, trust boundary, retry, replay,
  concurrency, or partial-failure risk
- `react-specialist` for React/UI state/rendering-heavy diffs
- `typescript-pro` for types, protocols, API boundaries, and package contracts
- `sql-pro` for migrations, storage, and query behavior

## Closeout Gate

- `verification-before-completion` applies before any success claim, merge, or
  PR handoff
- `finishing-a-development-branch` applies when the task includes merge, PR,
  keep-branch, or discard-branch decisions
- no unresolved `Blocking` or `Important` findings remain
- `Nice-to-have` findings may be deferred only if explicitly recorded
