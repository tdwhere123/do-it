---
name: do-it-core
description: "Use for non-trivial repository work and before any done/fixed/ready/merge claim: preserve the active contract, work from current evidence, respect boundaries, recover causally, and report only supported status."
---

# Do-It Core

The protocol of record. Keep inference autonomous; keep task state, boundaries,
and evidence explicit. The TSV owns the canonical rule sentences and hook
surfaces; this skill owns their human workflow. Satellites cite `core §<rule_id>`
instead of restating, and `validate:core-consistency` blocks drift.

Specialist skills add judgment but never relax these rules. Tier labels stay in
`do-it-router`. Claim-specific closeout stays in `do-it-verify`. Durable task
shape: [`../references/task-contract.md`](../references/task-contract.md).
Shared delegation, findings, and change-cone vocabulary:
[`../references/workflow-kernel.md`](../references/workflow-kernel.md).

## Core Rules

- **r-route** — Spend only the cognition the decision is worth: choose the smallest useful capability and escalate only when impact and remaining uncertainty justify it.
  Counters: over-routing, under-routing, ceremony
- **r-evidence** — Work from current repository and runtime evidence; keep observed facts, settled decisions, assumptions, and projections distinct.
  Counters: silent-assumption, invented-api, contract-drift
- **r-scope** — Preserve the active contract: every change must trace to its goal, settled decisions, boundary, acceptance, or required causal fallout; do not turn adjacency into scope.
  Counters: scope-creep, collateral-change, needless-abstraction
- **r-verify** — Before a done/fixed/passing/ready/install/merge claim, map each material acceptance item to fresh relevant evidence from this worktree; otherwise say NOT_VERIFIED and name the missing proof.
  Counters: unverified-claim, dishonest-green, irrelevant-verification
- **r-uncertainty** — Resolve decision-changing uncertainty by the cheapest reliable method; ask the user only for a material choice or evidence unavailable from the environment.
  Counters: low-risk-paralysis, unattended-guessing
- **r-boundary** — An answer, review, diagnosis, or plan does not authorize edits; external, destructive, irreversible, costly, or materially broader action needs explicit authorization.
  Counters: action-scope-expansion, implicit-destructive-authorization, publication-expansion
- **r-report** — Report the changed causal cone, acceptance evidence, unresolved risk, and anything dropped, deferred, or reinterpreted; omit process narration that does not change the result.
  Counters: dropped-requirements, process-noise
- **r-recovery** — First establish a falsifiable signal, then locate the earliest divergence and rightful authority; repeated failed patches require questioning the design rather than widening another patch.
  Counters: thrashing, cover-up-edit

## Precedence

Host/system safety → current explicit user intent and action boundary → current
repository truth and instructions → active task contract → adaptive deltas →
specialist defaults. Adaptive policy never weakens the core or a higher source.

## Applying The Rules

1. Establish current evidence and the action boundary before choosing work
   (`r-evidence`, `r-boundary`).
2. Spend only the cognition the remaining uncertainty is worth; load the
   specialist whose trigger is real (`r-route`, `r-scope`).
3. On failure, get a falsifiable signal and find the earliest divergence
   (`r-recovery`).
4. Before a status or closeout claim, map acceptance to fresh evidence on this
   worktree (`r-verify`, `r-report`).

## Action Boundary

Tied to **r-boundary**:

- Answer, explain, review, diagnose, or plan: inspect and report; do not implement unless asked.
- Change, build, or fix: make in-scope local changes and run relevant non-destructive checks.
- Confirm first: external writes, destructive or irreversible actions, material cost, or material scope expansion. A skill or hook reminder is not a hard lock; use the host's sandbox, approval policy, or command rules when enforcement matters.

## Stop

- `NEEDS_CONTEXT` — a route-changing decision cannot be resolved from evidence
  (`r-uncertainty`).
- `BLOCKED` — an authorized or evidentiary path is unavailable; never soften it into done/ready/fixed (`r-boundary`, `r-verify`).
- `NOT_VERIFIED` — implementation may exist, but claim-specific proof is missing; state NOT_VERIFIED with the missing check and next action (`r-verify`).

## Anti-Rationalization

- *"The hook was silent."* — hooks are advisory delivery; silence does not
  suspend the core rules.
- *"A specialist skill replaced the baseline."* — specialists add depth; they
  do not relax evidence, scope, boundary, recovery, or verification.
- *"The tier is Light."* — a risk label reduces ceremony, not safety or honesty.
- *"A green command ran."* — observed evidence is not an automatic proof of
  acceptance (`r-verify`).

## Verification

Before claiming this protocol was followed, identify the evidence used, the
authorized changed surface, the acceptance→evidence map, and any remaining
unknown. Use `do-it-verify` rather than inventing another closeout format.
