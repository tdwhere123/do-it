---
name: do-it-router
description: "Use when starting any non-trivial repo task: pick Light / Standard / Heavy tier, then self-select meaning skills — not a fixed pipeline."
---

# Do-It Router

Smallest useful tier. Load meaning skills on demand. No mandatory skill chain.

A tier adjusts scrutiny; it does not prescribe a sequence. **Tier + bucket choice** is always cheap; `do-it-decide` applies pressure only when a premise, option, or handoff needs it. Prefer Light when blast radius is local.

## Tiers

| Tier | Meaning |
| --- | --- |
| **Light** | Small, mechanical, docs-only, or question-shaped. Inspect → act → targeted check. |
| **Standard** | Real behavior or design change. Self-select buckets — never brainstorm→grill→plan by default. |
| **Heavy** | Cross-boundary, interface/release/security/migration, multi-agent, or irreversible closeout. |

Mis-tiering to dodge gates is a failure.

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
2. Choose tier.
3. Name buckets to load (or `skipped: <bucket> because <reason>`).
4. Proceed. User questions: one at a time, 2–3 options, recommended default.

## Delegation

The parent owns integration. Give each worker: tier + lens, scope/non-goals, write ownership, facts to check, proof target, stop condition, and a structured return. Contract: [`workflow-kernel.md`](../references/workflow-kernel.md).

## Output

One line: tier + next action.
