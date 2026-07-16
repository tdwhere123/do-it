---
name: do-it-router
description: "Use when starting any non-trivial repo task: pick Light / Standard / Heavy tier, then self-select meaning skills — not a fixed pipeline."
---

# Do-It Router

Autonomy first. Choose the smallest useful tier, skills, and workers for the
task at hand; there is no mandatory skill chain or delegation pipeline.

A tier is an advisory risk label, not a permission gate. Direct user intent
and the model's reading of the task take precedence over keyword classification.
Use `do-it-decide` only when a premise, option, or handoff genuinely needs
pressure. Prefer Light when blast radius is local.

## Tiers

| Tier | Meaning |
| --- | --- |
| **Light** | Small, mechanical, docs-only, or genuinely informational. Inspect → act → targeted check. |
| **Standard** | Real behavior or design change. Self-select buckets — never brainstorm→grill→plan by default. |
| **Heavy** | Cross-boundary, interface/release/security/migration, or irreversible closeout. Delegation can be useful at any tier when the task benefits. |

Do not use an optimistic tier label to downplay a known risk.

## Meaning Buckets

| Bucket | Skill | Load when |
| --- | --- | --- |
| Write defense | `do-it-code-quality` | Editing or designing code |
| Review / repair | `do-it-review` | Diff needs correctness; findings need fix + re-review |
| Decide | `do-it-decide` | Premises load-bearing, options unclear, or a plan/handoff is needed |
| Verify / close | `do-it-verify` | Before done/fixed/ready/merge; branch closeout |
| Persistence | `do-it-handbook`, `do-it-context` | Project truth missing or glossary drift |

Refs (load on demand): [`scope-chain.md`](../references/scope-chain.md), [`workflow-kernel.md`](../references/workflow-kernel.md), [`write-quality-families.md`](../references/write-quality-families.md), [`dimensions.md`](../references/dimensions.md).

## First Move

1. Read current truth (files, diffs, tests) — do not ask for readable facts.
2. Decide whether a tier, skill, worker, or parallel slice would materially help.
3. Use only the useful pieces, then proceed. Do not narrate skipped workflow by default.
4. Ask a user question only when a material choice cannot be recovered locally.

## Authorization Boundary

- Answer, explain, review, diagnose, or plan: inspect and report; do not implement unless asked.
- Change, build, or fix: make in-scope local changes and run relevant non-destructive checks.
- Confirm first: external writes, destructive or irreversible actions, material cost, or material scope expansion. A skill or hook reminder is not a hard lock; use the host's sandbox, approval policy, or command rules when enforcement matters.

## Delegation

The parent owns integration. Delegate only when an independent slice materially
improves exploration or review coverage, especially after a direct user request.
Give a worker the goal, its boundary/ownership, and the result or evidence that would
be useful; add more context only when the task needs it. For shared writes, name
one owner. Do not require a fixed contract, agent count, or role matrix. Shared delegation guidance:
[`workflow-kernel.md`](../references/workflow-kernel.md).

## Output

One line: tier + next action.
