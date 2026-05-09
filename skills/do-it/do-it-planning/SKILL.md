---
name: do-it-planning
description: "Use when intent must become a durable handoff card with current truth, acceptance criteria, risks, path map, and verification expectations."
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

1. Read local instructions and write constraints (CLAUDE.md, `.do-it/CONTEXT.md`).
2. **Read the grill log first.** If `.do-it/grill/<task>.md` exists, factual items must be `confirmed` or `refuted`, and decision items must be `chosen`, `deferred`, or explicitly marked `needs_user_decision`. A `needs_user_decision` item blocks the plan only when it changes execution. Reference the slug in the plan card frontmatter (`grill: <slug>`).
3. Inspect current truth: files, docs, tests, diffs, plans, issues, runtime state, and adjacent patterns.
4. Separate facts from preferences. Ask only for preferences that affect the plan.
5. Classify tier: `Light`, `Standard`, or `Heavy`; add task class
   `task`, `wave`, or `phase` when delivery shape matters.
6. State goal, non-goals, acceptance evidence, and residual unknowns.
7. For Standard/Heavy work, add a failure-mode forecast and the proof path map.
8. Choose an approach and reject plausible alternatives with reasons.
9. Break work into slices when more than one deliverable exists.
10. Name verification commands or evidence checks.
11. Name review depth and fix-loop expectations.
12. Define closeout shape.

## Planning Lenses

- Product: what job or pain is being solved?
- Scope: what is the smallest complete outcome?
- Engineering: which modules and contracts should carry the work?
- Interface: what boundary will another consumer rely on?
- Test: what will fail if the plan is wrong?
- Failure: what is the highest-risk hidden assumption?
- Maintenance: what future churn can be avoided without expanding scope?
- Delegation: which work can be isolated, and which shared files stay parent-owned?

## Planning Boundaries

Use these boundaries to prevent plans from becoming either vague permission
slips or overbuilt process.

- **Always:** name assumptions separately from confirmed facts, and attach the
  evidence needed to confirm or retire each assumption.
- **Always:** identify dependencies as `must precede`, `can run in parallel`,
  or `blocked by user/external action`.
- **Always:** add checkpoints where the next step should pause, review, or
  integrate before more work starts.
- **Ask:** only for choices that local truth cannot answer and that would
  change scope, architecture, product behavior, or release risk.
- **Never:** ask the user where files live, whether tests exist, or what the
  current diff contains before searching locally.
- **Never:** let a lower readiness target imply a higher one; fixture proof is
  not operator proof.

### Dependency Graph

For multi-slice plans, include a compact dependency graph in plain text:

```text
A-1 -> A-2
A-1 -> A-3
A-2 + A-3 -> integration verification
```

Keep it small. It exists to reveal blocked or parallel work, not to model the
entire project.

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

### Research-First Comparison (mandatory when introducing new dependency / datastore / framework / runtime / protocol)

Triggered when the plan would:

- add a new npm/pip/cargo/gem dependency
- introduce a new datastore / queue / cache
- adopt a new framework / runtime / build tool / package manager
- choose a new protocol (auth / API style / transport / serialization)

NOT triggered when: the plan modifies an existing module, fixes a bug, or extends a feature without changing its architectural surface.

When triggered, the plan MUST include a `Research` block with:

1. **Search trail** — at least one explicit search action (WebSearch / docs lookup / GitHub exploration / npm trends), with one-line summary of what was found. "I remember X" is NOT a search.
2. **Candidates** — ≥ 2 alternatives, each with: name, latest version, license, last release date or activity signal, one-line tradeoff.
3. **User confirmation** — either a `Must Resolve in grill` item naming the candidates and asking the user to pick, OR an explicit user reply quoted in the plan. If the user has not picked yet, planning may proceed only with `chosen: PENDING USER CONFIRMATION` markers; implementation cannot start until the user picks.

If the trigger does not fire, this section is omitted (do not pad with "N/A").

Why this exists: training data is months stale and biases toward libraries that were popular 1-2 years ago. Without explicit search, the agent picks from memory and locks the project into outdated choices that the user might not have wanted. The user must be the one to choose architectural-surface introductions.

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
- Treating assumptions as facts because they sound likely.
- Omitting checkpoints, so a long plan keeps executing after the riskiest
  premise should have been rechecked.

## Common Rationalizations

- *"The user already gave a plan."* — Treat it as intent, then re-read current
  files and adjust only where repo truth requires it.
- *"This is just docs, so no dependency map is needed."* — Workflow and install
  docs still have source/generated/install dependencies that can drift.
- *"We can verify at the end."* — Plans need per-slice evidence so failures
  stop near their cause instead of at closeout.

## Red Flags

- The plan has tasks but no acceptance evidence.
- The plan asks broad questions before checking local files.
- Dependencies are implicit in prose and not visible as ordering.
- A risky interface, install, or policy change has no checkpoint before
  generated output or live setup.
- The final evidence names old worker runs instead of fresh current-worktree
  commands.

## Verification

Before treating a plan as ready:

- local facts were inspected and separated from assumptions;
- non-goals and ownership boundaries are explicit;
- Standard/Heavy plans include failure-mode forecast, path map or not-applicable
  reason, readiness target, and final evidence;
- multi-slice plans include dependency order and checkpoints;
- every verification item names the behavior or artifact it proves.
