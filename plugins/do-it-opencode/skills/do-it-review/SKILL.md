---
name: do-it-review
description: "Use when a diff needs PR-style review, or findings need atomic repair and same-scope re-review — Standards axis and Spec axis, kept separate."
---

# Do-It Review

Findings-first review, then atomic fix + re-review. Two axes stay separate so neither masks the other.

Leading words: **Standards**, **Spec**, **smell**, **clean**.

## Two Axes (do not merge rankings)

| Axis | Question |
| --- | --- |
| **Standards** | Does the code follow this repo’s conventions + a smell baseline? |
| **Spec** | Does the diff faithfully implement the originating ask / plan / acceptance? |

A change can pass one and fail the other — report both. Prefer parallel reviewer agents when intensity is adversarial so contexts do not pollute each other.

Smell baseline (judgement calls; repo docs override): Mysterious Name, Duplicated Code, Feature Envy, Data Clumps, Primitive Obsession, Repeated Switches, Shotgun Surgery, Divergent Change, Speculative Generality, Message Chains, Middle Man. Skip what tooling already enforces. Lens detail: [`../references/review-lenses.md`](../references/review-lenses.md).

## When To Review

Heavy, interface-breaking, non-local risk, or parent asked. Light mechanical: quick inline check.

| Intensity | When |
| --- | --- |
| **review-quick** | Light+code; Standard local/low risk — parent inline |
| **review-deep** | Standard non-local; Heavy without high-risk lenses — one reviewer |
| **review-adversarial** | Heavy + interface/packages/security/migration — multi-lens / parallel axes |

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

## Fix Then Re-Review

1. Full finding batch before edits (no see-one-fix-one).
2. Cluster shared-root findings; decide batch vs pointwise.
3. Fix atomically; add regression checks when behavior changed.
4. Re-verify finding-specific checks; re-review the repaired surface once.
5. Close Blocking/Important with evidence + a prevention note. Deferral needs explicit user OK or out-of-scope boundary.

## Anti-Rationalization

A named reviewer, a marker, or a claimed review pass is not evidence. Choose depth from concrete failure modes and inspect the changed proof path; accept a finding only with code, diff, contract, or command evidence.

## Clean Criterion

Scope frozen; both axes checked at required depth; evidence fresh; no open Blocking/Important; Opportunities deferred only when named.

## Stop

`NEEDS_CONTEXT` when unreproducible or out of ownership; `BLOCKED` when the same
finding survives one targeted repair + verify. Do not invent other stop statuses
(`STILL_OPEN` is retired — see workflow-kernel).
