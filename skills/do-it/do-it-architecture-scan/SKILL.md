---
name: do-it-architecture-scan
description: "Use when a change touches multiple packages or surfaces and you need to audit ownership, dependency direction, coupling, migration, rollout risk, or failure isolation before planning."
---

# Do-It Architecture Scan

## Purpose

Use this to integrate architecture thinking into delivery without letting refactor appetite block useful work. Architecture opportunities are expected, but they block only when they create correctness, safety, verification, or delivery risk.

## When To Use

Use before planning or finalizing work that touches:

- package, module, or ownership boundaries;
- public APIs, events, schemas, migrations, or protocol contracts;
- state, persistence, replay, retries, or async ordering;
- UI state and backend truth boundaries;
- phase, wave, or long-lived workflow policy;
- subagent orchestration, handoff boundaries, or shared-file ownership;
- large files, duplicated logic, or repeated review churn.

For a tiny local edit, run the same lens briefly and avoid a separate architecture report.

## Tier Rules

### Light

Use inline for a local edit. Check nearest owner, call path, tests, and whether the change introduces coupling or an untestable branch.

### Standard

Default for subagents and ordinary non-trivial scans. Map the owning boundary, friction points, shallow opportunities, deep opportunities, coupling, and testability.

### Heavy

Parent-only unless explicitly assigned. Use for wave, phase, cross-package, persistence, security, workflow policy, or repeated review-fix churn. Include current-state evidence and a delivery recommendation.

## Scan Sequence

1. Inspect current implementation, tests, docs, plans, and changed files in scope.
2. Identify the owning boundary and consumers.
3. Map the main data/control flow.
4. Record codebase friction: confusing ownership, repeated edits, hard-to-test paths, broad files, hidden state, or review churn.
5. Look for correctness and delivery risks first.
6. Then separate shallow opportunities from deep module opportunities.
7. Classify each item as `Blocking`, `Important`, or `Opportunity`.
8. Recommend the smallest action that preserves delivery momentum.

## What To Look For

- Ownership ambiguity: no clear module owns a behavior or contract.
- Leaky boundary: callers need internal knowledge to use the API safely.
- Split truth: docs, tests, and runtime disagree.
- Hidden coupling: changes in one area require surprising edits elsewhere.
- Broad abstraction: indirection exists before there is real variation.
- Under-modeled state: lifecycle, failure, or partial completion is implicit.
- Test mismatch: tests prove implementation details instead of behavior.
- Review churn source: repeated findings point to unclear design, not isolated mistakes.
- Delegation mismatch: agents share hidden state, write the same files, or cannot verify their outputs.

## Simplicity And Liability Checks

Architecture review should reduce future risk, not create ornamental structure.

- Simplicity check: can the current task be made correct with a smaller local
  repair that preserves the existing ownership model?
- Code-as-liability check: new abstractions, adapters, generators, and modes
  add maintenance cost; require real variation, risk isolation, or repeated
  duplication before adding them.
- Removal check: deleting or deprecating code needs reference evidence and a
  migration or rollback path when users, generated outputs, or install surfaces
  may still depend on it.
- Failure isolation check: a boundary is useful only if it makes failures easier
  to observe, contain, test, or roll back.

## Opportunity Levels

- Shallow module opportunity: local extraction, name cleanup, helper reuse, test seam, or file split that reduces immediate friction without changing ownership.
- Deep module opportunity: new ownership boundary, data model correction, package split, persistence contract, async protocol, or cross-cutting policy change.

Do not recommend a deep opportunity as part of the current task unless it is required for correctness, safety, verification, or review-loop closure.

## Coupling And Testability

Check:

- Which modules must change together?
- Which callers know too much about internals?
- Which state transitions are hard to observe?
- Which tests would fail for the intended behavior?
- Which tests are brittle because they assert implementation detail?
- Which seams allow targeted verification without a full-system run?

## Blocking Standard

Architecture is blocking only when it can cause:

- incorrect behavior;
- data loss or state corruption;
- security or trust-boundary failure;
- unverifiable delivery;
- repeated failures in the same fix loop;
- a contract that consumers cannot use safely.

Otherwise, record it as an opportunity or a follow-up. Do not hold the main task hostage for broad cleanup.

## Stop Conditions

Stop and return `Needs more evidence`, `BLOCKED`, or reroute when:

- the owning boundary or consumer cannot be identified from current repo truth;
- evidence points to an interface contract that needs `do-it-interface-drill`
  before architecture recommendations are safe;
- the issue is a user/product scope decision, not an architecture fact;
- the scan would require editing outside the assigned ownership or changing
  install/release policy that the parent did not assign;
- verification cannot prove whether a proposed boundary improves correctness,
  safety, delivery, or failure isolation.

## Recommendation Rules

- Prefer local repair over redesign when it closes the risk.
- Prefer explicit boundaries over clever generalization.
- Preserve existing conventions unless they are the source of the defect.
- Name rejected alternatives when they are plausible and costly.
- If a better architecture is out of scope, say what would prove it is worth doing later.

## Output Shape

Use this compact shape:

- Scope scanned.
- Current architecture facts.
- Codebase friction.
- `Blocking` findings, if any.
- `Important` findings, if any.
- Shallow opportunities.
- Deep opportunities, explicitly non-blocking unless tied to correctness or delivery risk.
- Coupling and testability notes.
- Recommended delivery action.
- Verification or review needed.

## Integration With Delivery

During delivery:

- run an architecture scan before edits for heavy work;
- rerun it after review if fixes touched boundaries;
- include deferred opportunities in closeout only when they are actionable and not confused with completion blockers.

## Common Mistakes

- Proposing a rewrite before finding the current owner.
- Blocking delivery on a cleaner shape that does not affect correctness.
- Ignoring a boundary flaw because tests happen to pass.
- Treating duplicated code as a defect without showing why it matters.
- Forgetting to re-check docs or tests when architecture truth changes.
- Adding an abstraction before there is real variation or a repeated change
  cost.
- Calling code dead without checking runtime, generated, install, and docs
  references.

## Common Rationalizations

- *"This design is not ideal, so we should fix it now."* — Architecture blocks
  only when it threatens correctness, safety, verification, or delivery.
- *"A shared abstraction will make future work easier."* — Future ease is not a
  reason unless current evidence shows repeated variation or coupling.
- *"Deleting code is always simplification."* — Deleted paths can be hidden
  contracts; prove they are unused or provide migration.

## Red Flags

- Recommendation starts with a rewrite and no current owner map.
- The scan lists opportunities but no delivery recommendation.
- A deep module opportunity is treated as blocking without a concrete failure
  path.
- The proposed architecture makes verification harder.
- Docs, tests, generated outputs, or install surfaces are not rechecked after a
  boundary changes.

## Verification

An architecture scan is usable when:

- owning boundary, consumers, and main data/control flow are identified;
- findings distinguish `Blocking`, `Important`, and `Opportunity`;
- simplicity, liability, removal, and failure-isolation checks were applied;
- any blocking recommendation names the correctness, safety, verification, or
  delivery risk it prevents;
- deferred opportunities are explicitly non-blocking and actionable later.
