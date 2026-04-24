# do-it Routing Matrix

This document is the public policy source for choosing do-it planning,
implementation, review, and closeout intensity.

The default environment is Codex. In Claude Code or another agent runtime, keep
the same roles and gates, then adapt tool names and delegation mechanics to that
runtime.

## Core Skills

- `do-it-router`: classifies the work into Light, Standard, or Heavy, names
  the minimum useful agent set, and keeps the parent agent responsible for
  scope.
- `do-it-planning`: turns intent, current repo truth, non-goals, acceptance
  criteria, and verification expectations into a durable handoff.
- `do-it-slicing`: breaks a plan into tracer-bullet vertical slices that can be
  implemented, reviewed, and verified independently.
- `do-it-grill`: stress-tests premises, plans, review responses, and closeout
  claims. It can require or challenge `do-it-review-loop` output, but it is not
  the owner for delivered diff or QA review.
- `do-it-architecture-scan`: checks ownership, dependency direction, coupling,
  migration path, rollout risk, and failure isolation.
- `do-it-interface-drill`: checks API, type, schema, CLI, docs, protocol, and
  adapter contracts at the producer/consumer boundary.
- `do-it-domain-language`: stabilizes domain terms and catches contradictions
  between user language, docs, and code.
- `do-it-delivery-loop`: maps, plans, implements, verifies, reviews, fixes,
  re-reviews, and reports with command-traceable evidence.
- `do-it-tdd`, `do-it-debugging`, `do-it-review-loop`,
  `do-it-fix-loop`, and `do-it-verification-gate`: focused quality loops used
  when behavior, root cause, review findings, or completion claims require
  extra discipline.
- `do-it-subagent-orchestration`: constrains delegated agents to explicit
  slices, ownership boundaries, and return schemas.
- `do-it-worktree-isolation` and `do-it-branch-closeout`: optional support for
  isolated work and final integration.
- `do-it-visual-planning`: optional local visual companion for planning
  artifacts; it is not part of the default delivery route.

The do-it roles absorb the useful discipline from the previous workflow family:
mandatory truth checks, explicit planning, isolated delegation, adversarial
review, and evidence-first closeout. The installed names and public routing are
do-it-native.

## Three Tiers

| Tier | Use When | Default Skill Flow | Subagent Behavior | Closeout |
|---|---|---|---|---|
| `Light` | Mechanical edit, small docs update, bounded command/check, obvious single-file fix | `do-it-router -> do-it-delivery-loop -> do-it-verification-gate` | Usually no subagent. If delegated, assign a Light slice with one narrow question or edit. | Local diff review plus targeted verification. |
| `Standard` | Ordinary non-trivial engineering, unclear ownership, normal docs policy changes, bounded bugfix/refactor | `do-it-router -> do-it-planning -> do-it-delivery-loop -> do-it-verification-gate`; add `do-it-tdd`, `do-it-debugging`, `do-it-subagent-orchestration`, `do-it-review-loop`, and `do-it-fix-loop` when applicable | Default delegated slice. The child does not inherit the parent's Heavy route. | Correctness/quality review when risk justifies it, fix-loop for findings, fresh evidence before claims. |
| `Heavy` | Wave, phase, public identity shift, architecture or interface boundary, release/gate, cross-module policy, high-risk failure modes | `do-it-router -> do-it-planning -> do-it-grill -> do-it-slicing -> do-it-interface-drill -> do-it-architecture-scan -> do-it-subagent-orchestration -> do-it-delivery-loop -> do-it-review-loop -> do-it-fix-loop -> do-it-verification-gate -> do-it-branch-closeout` | Parent-owned by default. A child may run Heavy only if the parent explicitly assigns a Heavy slice. | Re-review after fixes, resolved or explicitly deferred important findings, status only from verified facts. |

## Task Class And Tier

Tier describes rigor. Task class describes delivery shape:

- `task`: one bounded outcome or slice, usually Light or Standard unless risk
  forces Heavy.
- `wave`: multiple related task slices with an integration point, usually
  parent-owned Heavy.
- `phase`: durable program, gate, release, or broad policy shift, Heavy by
  default.

Use both labels when they clarify work: for example `tier: Standard,
class: task` for a delegated slice, or `tier: Heavy, class: wave` for the parent
coordinator. Do not use `wave` or `phase` as substitutes for `Standard` or
`Heavy`.

`do-it-domain-language`, `do-it-worktree-isolation`, `do-it-skill-authoring`,
and `do-it-visual-planning` are routed by need rather than by tier:

- use `do-it-domain-language` when overloaded terms, product concepts, or
  business rules affect the plan or review;
- use `do-it-worktree-isolation` when current workspace state, parallel lanes,
  or rollback risk requires isolation;
- use `do-it-skill-authoring` when creating or updating skills;
- use `do-it-visual-planning` only when a local visual planning companion would
  improve a planning discussion.

## Planning Rules

Every implementation-ready handoff should name:

- task class and route
- goal and non-goals
- write ownership and restricted paths
- discovered facts that matter
- success criteria
- implementation mode
- review stack
- verification commands or evidence checks
- whether local notes belong in the private `.do-it/` workspace

Use the smallest planning stack that removes real risk:

- `plan-challenger` for ambiguous scope, public policy, or acceptance risk
- `architect-reviewer` for architecture scan
- `domain-language-reviewer` for overloaded terms, canonical-language drift,
  or domain-model contradictions
- `typescript-pro`, `sql-pro`, `react-specialist`, or
  `documentation-engineer` for interface drill in their domains
- `red-team-reviewer` for state, persistence, security, concurrency, retry,
  replay, or partial-failure risk
- `skill-quality-reviewer` for skill trigger quality, tier behavior, stop
  conditions, and cross-skill consistency
- `install-release-reviewer` for package, manifest, installer, doctor, and
  release readiness

## Implementation Modes

### Mode A: Local / Mechanical

Use for `Light` work where the path and success criteria are obvious. The
parent agent performs the map locally, edits only the owned files, and verifies
the specific requirement.

### Mode B: Focused Delivery Loop

Default for `Standard` work:

1. Make a modification map before production edits.
2. Write or tighten the smallest failing test when behavior is changed.
3. Verify RED for the expected reason when tests apply.
4. Implement the minimal GREEN change.
5. Verify GREEN or run the equivalent docs/tooling check.
6. Refactor only after verification.
7. Run the selected review loop and fix findings before closeout. Use
   `do-it-grill` when the plan, review response, or closeout claim needs
   pressure-testing.

### Mode C: Split RED / GREEN

Use when a behavior contract is risky enough that tests should be authored by a
separate agent before implementation:

1. `code-mapper` maps ownership and branch points.
2. `tdd-red-writer` edits tests only.
3. Parent verifies RED.
4. Implementer owns GREEN.
5. Parent verifies GREEN.
6. `do-it-review-loop` reviews the delivered surface; `do-it-grill` challenges
   the plan or closeout claim when needed.

### Mode D: Heavy Drill

Use for `Heavy` work:

1. Freeze route, non-goals, and acceptance criteria with `do-it-planning`.
2. Use `do-it-grill` to challenge the decision tree before implementation.
3. Use `do-it-slicing` to define lanes and shared-file ownership.
4. Run `do-it-interface-drill`, `do-it-architecture-scan`, and
   `do-it-domain-language` only where their evidence will change the plan.
5. Delegate Standard slices unless a child is explicitly assigned Heavy work.
6. Run expanded review, fix-loop, re-review, and branch closeout.

## Review Stack Rules

- Light tasks may stay local when the diff is obvious and low risk.
- Standard tasks use a focused reviewer or local review when risk is bounded;
  add `code-quality-cleaner` for non-trivial maintainability risk.
- Heavy waves require at least two review lenses even when tests are green.
- Heavy phases default to architecture scan, post-diff interface review,
  correctness review, and one domain/risk reviewer.
- A pre-implementation interface drill can count toward Heavy review only when
  a read-only reviewer rechecks the delivered diff against the chosen contract
  and returns the review schema.
- Release or install work adds `install-release-reviewer`.
- Skill or workflow-bundle work adds `skill-quality-reviewer`.
- Add `spec-compliance-reviewer` when the work is tied to a task card, plan,
  acceptance contract, or explicit write-ownership boundary.
- Heavy review counts only review assignments that were explicitly prompted as
  `tier: Heavy`. Standard reviewer output can inform the parent, but does not
  satisfy a Heavy review gate by itself.
- Prefer read-only reviewer configs for review lenses. Writer specialists such
  as implementation, documentation, test, React, or TypeScript agents may
  support drills or fixes, but they do not replace an independent read-only
  review lens unless the parent explicitly scopes them as read-only and the
  return report satisfies the review schema.

## Token Discipline

- Do not spawn agents for work the parent can verify faster and more accurately
  with local reads.
- Give delegated agents exact scope, files, questions, and stop conditions.
- Prefer one specific reviewer over several overlapping reviewers.
- Keep implementation workers out of shared files unless write ownership is
  explicit.
- The parent agent owns integration, final diff review, and final claims.

## Subagent Protocol

Subagents also run do-it. Delegation changes who performs a slice; it does not
remove the workflow gates.

Every subagent prompt should include:

- the assigned tier: Light, Standard, or explicitly Heavy;
- the route: implementation slice, review lens, architecture drill, interface
  drill, or support task;
- the scope and non-goals;
- write ownership and restricted paths;
- the current facts it may rely on and the facts it must verify itself;
- the expected loop: inspect, plan, execute or review, verify when applicable,
  and report;
- a stop condition for `NEEDS_CONTEXT`, `BLOCKED`, or `STILL_OPEN`;
- the required return shape: changed files or findings, commands or inspections
  run, evidence, facts verified, assumptions, residual risk, and `NOT_CHECKED`.

Delegated implementation defaults to `Standard`. A subagent must not run the
full parent Heavy flow just because the parent is handling a Heavy phase. If it
discovers unassigned architecture, interface, security, or acceptance risk that
would require Heavy work, it stops with:

```text
BLOCKED: requires heavy escalation
Evidence:
- ...
Suggested next parent decision:
- ...
```

Implementation subagents must not revert peer edits, must not create commits
unless explicitly delegated, and must report how their slice should be
integrated. Review subagents stay read-only; fixes belong in a separate
delivery or fix-loop slice.

Use `.do-it/` only for private local planning notes or scratch artifacts. Do not
install it, publish it, or cite it as canonical truth unless the user
explicitly promotes a note into tracked docs.

## Closeout Gate

Before claiming completion:

1. Re-read the request and write-ownership boundary.
2. Inspect the diff for restricted-file edits.
3. Run the relevant verification commands or grep checks.
4. Confirm stale terminology and adapter gaps are either removed or reported.
5. Confirm review findings are fixed, deferred with rationale, or explicitly
   outside scope.
