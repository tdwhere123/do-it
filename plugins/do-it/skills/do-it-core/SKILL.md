---
name: do-it-core
description: "Use when starting non-trivial repo work or making a done/fixed/ready/merge claim: apply the universal evidence, scope, boundary, recovery, verification, and reporting rules."
---

# Do-It Core

The protocol of record for universal execution behavior. The TSV owns the
canonical rule sentences and hook surfaces; this skill owns their human
workflow. Satellites cite `core §<rule_id>` instead of restating rules, and
`validate:core-consistency` blocks drift.

Tier definitions and capability selection stay in `do-it-router`. Claim-specific
closeout stays in `do-it-verify`. The baseline does not duplicate either
specialist.

## Core Rules

- **r-route** — Pick the smallest tier that fits: Light mechanical, Standard work, Heavy boundary. Direct user intent wins over keyword labels.
  Counters: over-routing, under-routing, ceremony
- **r-evidence** — Work from evidence: read the files, diffs, and tests before claiming how the system works; label assumptions as assumptions, never as facts.
  Counters: silent-assumption, invented-api, contract-drift
- **r-scope** — Keep changes small: every edited line must trace to the request or its contracts; no speculative additions, abstractions, or unrelated fixes.
  Counters: scope-creep, collateral-change, needless-abstraction
- **r-verify** — Before any done, fixed, passing, ready, install, or merge claim: run the narrowest fresh check that exercises the changed path on this worktree and report its exact output; if proof is unavailable, state NOT_VERIFIED with the missing check and next action.
  Counters: unverified-claim, dishonest-green, irrelevant-verification
- **r-uncertainty** — Ask the user only when ambiguity changes correctness, safety, or user intent; resolve low-risk ambiguity from evidence using the narrowest reasonable interpretation.
  Counters: low-risk-paralysis, unattended-guessing
- **r-boundary** — Respect the action boundary: answer, review, diagnose, or plan authorizes no edits; external, destructive, or irreversible actions need explicit confirmation first.
  Counters: action-scope-expansion, implicit-destructive-authorization, publication-expansion
- **r-report** — Report what changed, what was verified, and what remains unverified; name anything dropped, deferred, or reinterpreted.
  Counters: dropped-requirements, process-noise
- **r-recovery** — On failure: diagnose before widening the change; three failed patches mean question the design, not try a fourth.
  Counters: thrashing, cover-up-edit

## Applying The Rules

1. Establish current evidence and the action boundary before choosing work
   (`r-evidence`, `r-boundary`).
2. Route with `do-it-router`; load only the specialist whose trigger is real
   (`r-route`, `r-scope`).
3. Diagnose failure before widening scope (`r-recovery`).
4. Before a status or closeout claim, use `do-it-verify` for claim-specific
   evidence and report the exact remaining uncertainty (`r-verify`, `r-report`).
## Action Boundary

Tied to **r-boundary**:

- Answer, explain, review, diagnose, or plan: inspect and report; do not implement unless asked.
- Change, build, or fix: make in-scope local changes and run relevant non-destructive checks.
- Confirm first: external writes, destructive or irreversible actions, material cost, or material scope expansion. A skill or hook reminder is not a hard lock; use the host's sandbox, approval policy, or command rules when enforcement matters.

## Stop

- `NEEDS_CONTEXT` — decision-changing ambiguity is not resolvable from evidence
  (`r-uncertainty`).
- `BLOCKED` — required evidence or an authorized path is unavailable; never soften it into done/ready/fixed (`r-boundary`, `r-verify`).
- `NOT_VERIFIED` — proof is unavailable; state the missing check and next
  action (`r-verify`).

## Anti-Rationalization

- *"The hook was silent."* — hooks are advisory delivery; silence does not
  suspend the core rules.
- *"A specialist skill replaced the baseline."* — specialists add depth; they
  do not relax evidence, scope, boundary, recovery, or verification.
- *"The tier is Light."* — Light reduces ceremony, not safety or honesty.

## Verification

Before claiming this protocol was followed, identify the evidence used, the
authorized changed surface, the fresh claim-specific check, and any remaining
unknown. Use `do-it-verify` rather than inventing another closeout format.
