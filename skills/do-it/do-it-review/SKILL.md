---
name: do-it-review
description: "Use when a diff needs PR-style review, or findings need atomic repair and same-scope re-review — Standards axis and Spec axis, kept separate."
---

# Do-It Review

Findings-first review, then atomic fix + re-review. Standards and Spec stay
independent so neither masks the other.

Leading words: **Standards**, **Spec**, **smell**, **clean**.

## Two Axes (do not merge rankings)
<!-- do-it-contract:review.two-axes -->

| Axis | Question |
| --- | --- |
| **Spec** | Against the active contract (or a minimal extracted acceptance if there is no file): Goal, Decisions, Boundary, Acceptance, and named deferrals. |
| **Standards** | Causal authority, contract fallout, stateful failures, and proof quality on the changed cone. |

A change can pass one and fail the other — report both. Do not average them
into one score.

Load the Task Contract when present
([`../references/task-contract.md`](../references/task-contract.md)). If there
is no file, extract a minimal acceptance from the user ask and current Goal;
do not manufacture a plan file to start review (`core §r-scope`).

Smell baseline (judgement; repo docs override): Mysterious Name, Duplicated
Code, Feature Envy, Data Clumps, Primitive Obsession, Repeated Switches,
Shotgun Surgery, Divergent Change, Speculative Generality, Message Chains,
Middle Man. Skip what tooling already enforces. Lens detail:
[`../references/review-lenses.md`](../references/review-lenses.md).

## Review Order

1. Freeze this contract and the diff scope.
2. **Spec** — itemize Goal, Decisions, Boundary, Acceptance, and deferrals.
3. **Standards** — causal authority, contract fallout, stateful failures, proof quality.
4. One complete finding batch, severity-ordered.
5. Atomic repair.
6. Same-scope re-review once.

## Depth

<!-- do-it-contract:review.inline-default -->
Default inline review. At most one independent reviewer when independence
could change the call (expensive wrong merge, current context too anchored,
or a narrow verifiable second look). No fixed multi-reviewer pipeline.
"Heavy" is not a dispatch reason (`core §r-route`). Extra lenses load only
when a concrete failure mode needs them.

## Severity

- **Blocking** — wrong, unsafe, unverifiable, or out of scope
- **Important** — likely regression, rework, ownership confusion
- **Opportunity** — useful cleanup; not required for clean

## Finding Shape

[`../references/workflow-kernel.md`](../references/workflow-kernel.md) § Finding Schema:

```text
severity / location / issue / cause_class / required_fix / NOT_CHECKED
```

One complete batch, severity-ordered. Not clean while Blocking/Important remain.
<!-- do-it-contract:review.not-clean-open-findings -->

## Fix Then Re-Review

1. Full finding batch before edits (no see-one-fix-one).
2. Cluster shared-root findings; decide batch vs pointwise.
3. Fix atomically; add regression checks when behavior changed.
4. Re-verify finding-specific checks; re-review the repaired surface once.
5. Close Blocking/Important with evidence + a prevention note. Deferral needs
   explicit user OK or an out-of-scope boundary.

## Anti-Rationalization

A named reviewer, a marker, or a claimed review pass is not evidence
(`core §r-verify`). Accept a finding only with code, diff, contract, or
command evidence. A Standards pass does not close a Spec miss.

## Clean Criterion

Scope frozen; both axes checked independently at required depth; evidence
fresh on this worktree; no open Blocking/Important; Opportunities deferred
only when named.

## Stop

`NEEDS_CONTEXT` when unreproducible or out of ownership; `BLOCKED` when the
same finding survives one targeted repair + verify. Do not invent other stop
statuses (`STILL_OPEN` is retired — see workflow-kernel).
