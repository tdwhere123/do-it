---
name: do-it-slicing
description: "Use when a large plan needs independent vertical slices with explicit ownership, verification, review, rollback, and stop conditions."
---

# Do-It Slicing

## Purpose

Use this to turn a plan into independently deliverable slices. Prefer tracer-bullet vertical slices that move through the real system and prove the riskiest path early.

## Tier Rules

### Light

Use for 2-3 small steps in one local task. Keep the slice list brief and execute in order.

### Standard

Default for subagents and ordinary non-trivial task breakdown. Each slice needs ownership, dependencies, verification, and a `HITL` or `AFK` marker.

### Heavy

Parent-only unless explicitly assigned. Use for wave, phase, integration, or multi-agent work. Parent owns shared files, cross-slice contracts, sequencing, and final integration.

## Tracer-Bullet Rule

The first implementation slice should be the thinnest end-to-end path that proves the main architecture works. Avoid "all backend first" or "all UI first" unless the task is explicitly single-layer.

A good vertical slice includes enough of:

- data/input;
- domain behavior;
- interface or API;
- user or caller surface;
- verification.

It may be ugly or incomplete, but it must be real and testable.

## HITL And AFK Marking

Mark every slice:

- `AFK`: the worker can complete it without human input after dispatch.
- `HITL`: the slice requires a human decision, external credential, manual environment action, approval, product judgment, or ambiguous tradeoff.

Do not mark a slice `AFK` if it depends on an unanswered preference question. Do not pause for `HITL` if the answer can be discovered locally.

## Slice Fields

Each Standard or Heavy slice should include:

- ID and title.
- Tier and `AFK` or `HITL`.
- Goal and acceptance evidence.
- Write ownership and forbidden paths.
- Inputs and outputs.
- Dependencies and ordering.
- Estimated size: `thin`, `normal`, or `too large`; split any `too large`
  slice before dispatch unless the parent explicitly owns it.
- Checkpoint: the evidence or review event that must happen before dependent
  slices continue.
- Verification command or evidence.
- Review lens needed.
- Truth plane and readiness target for claims that cross source, worktree,
  package, temp install, live install, or host behavior.
- Parent-owned lane status for delegated slices: `assigned`, `running`,
  `done_with_evidence`, `integrated`, or `blocking`.
- Stop conditions for `NEEDS_CONTEXT` or `BLOCKED`.

## Slicing Sequence

1. Inspect current modules, tests, docs, and planned interfaces.
2. Find the tracer-bullet path.
3. Split remaining work by user-visible behavior or contract, not by convenience layers.
4. Isolate shared files under parent ownership when multiple workers are involved.
5. Put high-risk contracts, migrations, async behavior, or security checks early.
6. Keep each slice independently reviewable.
7. Identify final integration and broad verification as parent-owned.

## Dependency And Checkpoint Rules

- A slice may depend on another slice's verified output, not on its intention.
- Parallel slices must have disjoint write ownership or a parent-owned
  integration file.
- User or external decisions make the dependent slice `HITL`.
- Every risky contract gets an early checkpoint before downstream workers build
  against it.
- Every generated or install surface gets a final parent-owned sync check after
  source edits land.

## Output Shape

| Slice | Marker | Owner | Lane status | Goal | Verification | Dependencies |
| --- | --- | --- | --- | --- | --- | --- |
| C-1 | AFK | worker | assigned | ... | ... | none |

Then include:

- tracer-bullet slice;
- shared-file policy;
- parent integration duties;
- review/fix-loop gates;
- risks left outside the slice plan.

## Common Mistakes

- Splitting by layer so no slice proves behavior.
- Assigning two agents to the same shared file without a parent integration plan.
- Calling a preference-dependent slice `AFK`.
- Making slices too large for one worker to verify.
- Deferring the riskiest contract until the end.
- Treating "independent" as "can be worked on simultaneously" without checking
  write ownership and integration order.
- Omitting checkpoint evidence, so a later slice builds on an unproven contract.

## Common Rationalizations

- *"Backend first is cleaner."* — If the user value crosses layers, the first
  slice should prove the thinnest real path, even if it is incomplete.
- *"The worker can figure out dependencies."* — The parent owns sequencing and
  shared-file risk; workers should not infer hidden gates.
- *"This slice is big but straightforward."* — If one worker cannot verify it
  end-to-end, split it or keep it parent-owned.

## Red Flags

- A slice has no explicit verification command or evidence.
- Two slices can edit the same file without a parent integration rule.
- A downstream slice starts before the producer contract is checked.
- Most slices are named by technical layer instead of behavior or contract.
- `HITL` work is hidden inside an `AFK` dispatch.

## Verification

Before dispatching or accepting a slice plan:

- the tracer-bullet slice is identified;
- each slice has owner, write scope, dependencies, checkpoint, and stop
  condition;
- no parallel slice pair has conflicting write ownership;
- high-risk contracts, migrations, async behavior, security, generated output,
  or install surfaces have early or final parent checkpoints;
- every slice can be reviewed independently.
- delegated lanes have parent-owned status and no final claim depends on a lane
  that is not `integrated`.
