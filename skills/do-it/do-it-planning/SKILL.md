---
name: do-it-planning
description: "Problem: plans get written without current repo truth, acceptance criteria, or a verification path, so the next agent re-discovers the same questions and rolls the work back. Fix: turn intent + current truth + non-goals + acceptance + failure-mode forecast + path map + verification expectations into a durable handoff card."
---

# Do-It Planning

## Purpose

Use this to turn current truth into an executable plan. A good plan names the goal, non-goals, acceptance evidence, ownership, failure-mode forecast, path map, verification, review depth, and stop conditions.

Do not copy upstream planning formats verbatim. Absorb their discipline and produce do-it-native handoffs.

## Tier Rules

### Light

Use for a bounded task with obvious acceptance:

- inspect the relevant files or docs;
- state the minimal edit or answer path;
- name one verification or evidence check;
- proceed unless the user requested approval first.

### Standard

Default for subagents and ordinary non-trivial planning:

- inspect current code/docs/tests/diffs before asking;
- classify the task;
- compare 2-3 approaches when choices matter;
- produce acceptance checks, failure-mode forecast, path map, slices, verification, review, and closeout criteria.

### Heavy

Parent-only unless explicitly assigned:

- use for wave, phase, release, multi-agent, durable workflow, or cross-boundary planning;
- lock scope, write ownership, non-goals, and integration ownership;
- run grill, interface, architecture, domain-language, or slicing drills as needed;
- stop for approval if the user asked to confirm the plan.

## Planning Sequence

1. Read local instructions and write constraints.
2. Inspect current truth: files, docs, tests, diffs, plans, issues, runtime state, and adjacent patterns.
3. Separate facts from preferences. Ask only for preferences that affect the plan.
4. Classify tier: `Light`, `Standard`, or `Heavy`; add task class
   `task`, `wave`, or `phase` when delivery shape matters.
5. State goal, non-goals, acceptance evidence, and residual unknowns.
6. For Standard/Heavy work, add a failure-mode forecast and the proof path map.
7. Choose an approach and reject plausible alternatives with reasons.
8. Break work into slices when more than one deliverable exists.
9. Name verification commands or evidence checks.
10. Name review depth and fix-loop expectations.
11. Define closeout shape.

## Planning Lenses

- Product: what job or pain is being solved?
- Scope: what is the smallest complete outcome?
- Engineering: which modules and contracts should carry the work?
- Interface: what boundary will another consumer rely on?
- Test: what will fail if the plan is wrong?
- Failure: what is the highest-risk hidden assumption?
- Maintenance: what future churn can be avoided without expanding scope?
- Delegation: which work can be isolated, and which shared files stay parent-owned?

## Required Planning Artifacts

For Standard and Heavy plans, include:

- `Failure-Mode Forecast`: concrete expected failure classes such as live-path
  gap, state-machine gap, contract drift, synthetic proof, operator gap, or
  evidence drift.
- `Path Map`: `producer -> contract/event/schema -> transport/client ->
  state/query -> surface/operator action -> verification`, or a clear reason it
  is not applicable.
- `Readiness Target`: one of `fixture-ready`, `live-event-ready`,
  `operator-ready`, `docs-truth-ready`, or `install-ready`; do not let a
  lower readiness level imply a higher one.
- `Final Evidence`: the branch/worktree and checks that must be fresh at
  closeout; inherited worker or pre-merge evidence is supporting context, not the
  final claim.

## Approach Comparison

Use this when a choice is material:

| Option | Best for | Cost | Risk | Verification |
| --- | --- | --- | --- | --- |
| A | ... | ... | ... | ... |

Recommend one option. Do not present options as neutral if the codebase evidence points to a clear path.

## PRD Handoff Mode

Use this mode when the user asks to turn current context into a PRD, product
brief, implementation brief, or issue-ready specification. Do not run a long
interview if the current conversation and repository truth are enough.

Include:

- problem statement from the user's perspective;
- proposed solution and non-goals;
- user stories or operator stories in numbered form;
- implementation decisions: modules, interfaces, schema/API contracts, workflow
  decisions, and architecture tradeoffs;
- testing decisions: behavior to prove, public interfaces to exercise, prior
  tests or examples to reuse, and checks explicitly not in scope;
- acceptance criteria and verification evidence;
- out-of-scope items;
- open decisions that require user or product input.

Keep file paths and code snippets out of durable PRD prose unless the user asks
for a code-facing plan; they go stale faster than domain decisions.

## Output Shape

- Tier and task class.
- Goal and non-goals.
- Current facts discovered locally.
- Failure-mode forecast and path map.
- Readiness target and final evidence required.
- Open decisions, if any.
- Recommended approach and rejected alternatives.
- Slices or task breakdown.
- Ownership and delegation plan.
- Verification and review gates.
- Stop condition or approval checkpoint.

## Common Mistakes

- Omitting failure-mode forecast or path map for non-trivial behavior, interface, runtime, or surface work.
- Asking where files live before searching.
- Planning from a stale design instead of current code.
- Writing vague steps like "add tests" without naming the behavior to prove.
- Splitting by technical layer when a vertical slice would be testable sooner.
- Letting a subagent plan Heavy work without explicit assignment.
