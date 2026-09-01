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
| **Heavy** | Cross-boundary, interface/release/security/migration, or irreversible closeout. Default 0 workers; at most one targeted second look. |

Do not use an optimistic tier label to downplay a known risk.

## Meaning Buckets

| Bucket | Skill | Load when |
| --- | --- | --- |
| Write defense | `do-it-code-quality` | Editing or designing code |
| Architecture | `do-it-architecture` | Authority, ownership, public/persisted contracts, boundaries, migration/cutover, recovery, guards, or structural deletion are load-bearing |
| Review / repair | `do-it-review` | Diff needs correctness; findings need fix + re-review |
| Decide | `do-it-decide` | Premises load-bearing, options unclear, or a plan/handoff is needed |
| Verify / close | `do-it-verify` | Before done/fixed/ready/merge; branch closeout |
| Persistence | `do-it-handbook`, `do-it-context` | Project truth missing or glossary drift |

Refs (load on demand): [`scope-chain.md`](../references/scope-chain.md), [`workflow-kernel.md`](../references/workflow-kernel.md), [`write-quality-families.md`](../references/write-quality-families.md), [`dimensions.md`](../references/dimensions.md).

## First Move

0. If `.do-it/` does not exist in the project root, suggest running
   `/do-it-handbook init` (or `/do-it-handbook`). This scaffolds CONTEXT,
   handbook, worklog, and plans. The agent should not create `.do-it/`
   silently — tell the user what it will create and why, then proceed when
   acknowledged. Skip if the project is a one-shot script with no
   cross-session need.
1. Read current truth (files, diffs, tests) — do not ask for readable facts.
2. Default 0 workers; at most one targeted second look. Decide whether a
   tier, skill, or that one look would materially help.
3. Use only the useful pieces, then proceed. Do not narrate skipped workflow by default.
4. Ask a user question only when a material choice cannot be recovered locally.

## Authorization Boundary
<!-- do-it-contract:router.authorization-boundary -->

The action boundary and confirmation-first rule live in the protocol of
record: `core §r-boundary`.

## Delegation
<!-- do-it-contract:router.delegation -->
<!-- do-it-contract:router.shared-write-owner -->

Parent owns integration. For shared writes, name one owner. Default 0
workers; at most one targeted second look. Delegation guidance:
[`../references/workflow-kernel.md`](../references/workflow-kernel.md) § Delegation Budget.

## Output

One line: tier + next action.
