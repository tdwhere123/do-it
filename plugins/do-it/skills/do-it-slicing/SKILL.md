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
- Verification command or evidence.
- Review lens needed.
- Stop conditions for `NEEDS_CONTEXT` or `BLOCKED`.

## Slicing Sequence

1. Inspect current modules, tests, docs, and planned interfaces.
2. Find the tracer-bullet path.
3. Split remaining work by user-visible behavior or contract, not by convenience layers.
4. Isolate shared files under parent ownership when multiple workers are involved.
5. Put high-risk contracts, migrations, async behavior, or security checks early.
6. Keep each slice independently reviewable.
7. Identify final integration and broad verification as parent-owned.

## Output Shape

| Slice | Marker | Owner | Goal | Verification | Dependencies |
| --- | --- | --- | --- | --- | --- |
| C-1 | AFK | worker | ... | ... | none |

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
