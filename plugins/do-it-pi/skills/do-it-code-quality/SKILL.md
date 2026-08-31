---
name: do-it-code-quality
description: "Use when designing, changing, or debugging code: trace live behavior, locate rightful authority, make the smallest causal closure, stress applicable stateful surfaces, and prove the changed contract."
---

# Do-It Code Quality — Build Kernel

Understand broadly enough to locate causality; edit narrowly enough to close it.
Default **0** subagents; parent owns the contract (`core §r-route`).
<!-- do-it-contract:build.causal-closure -->

## Scope Chain (before edit)
<!-- do-it-contract:build.scope-chain -->

1. **Premise** — one sentence: if this fact is wrong, the change is wrong.
2. **Blast radius** — who breaks (callers, live paths, tests, persistence).
3. **Bounded chain** — producer → contract → transport → state → surface → verify.
4. **Targeted reads** — locate the symbol first, then that range (`core §r-evidence`).

Follow the **causal cone**, not adjacency. Detail:
[`../references/scope-chain.md`](../references/scope-chain.md),
[`../references/causal-change.md`](../references/causal-change.md).
Public/API/schema or cross-package work needs both-side mapping.
Schema/API changes need both sides.
<!-- do-it-contract:build.both-sides -->

## Trace

Name the intended behavior, the live producer→contract→state→surface path, and
the cheapest reliable feedback signal. Make uncertain outcomes falsifiable
before changing them.

## Locate

Find the earliest divergence of intended vs actual behavior, and the semantic
authority of the fact.

- Replace test: would the rule remain true if this layer were replaced?
- Bypass test: can a legitimate mutation path change the fact without passing here?

If authority is duplicated, ambiguous, public/persisted, or recovery-sensitive,
use `do-it-architecture`.

## Change

<!-- do-it-contract:build.patch-or-prepare -->
Make the smallest structurally correct change: authority/root cause + required
contract fallout + the proof path. Follow causality, not nearby cleanup.

**Patch-or-Prepare Gate:** prepare only when the current shape blocks a local
durable provable change. Prepare keeps behavior; Change alters acceptance.
Prefer existing depth; one adapter is not a seam.

The active contract owns intent, boundaries, and acceptance. HOW may adapt when
repository evidence proves a better route; surface settled-decision changes
(`core §r-scope`).

When behavior changes and a durable public seam is practical, establish RED
before GREEN. Otherwise use the best probe and name the proof gap. Tests
observe public behavior; expected truth is independent of the implementation.

## Stress

<!-- do-it-contract:build.stateful-scan -->
When the work is stateful, asynchronous, retried, cached, queued, externally
effectful, or cross-boundary, inspect only applicable surfaces — Identity,
Interleaving, Commit, Amplification, Copies — in
[`../references/stateful-change-scan.md`](../references/stateful-change-scan.md).
Cite `core §r-recovery`. Do not add a skill per face.

## Prove

Re-run the original observation and the affected contract/acceptance on this
worktree (`core §r-verify`). Advisory families:
[`../references/write-quality-families.md`](../references/write-quality-families.md).

## Settle

Consolidate accidental complexity only at a natural boundary inside the changed
cone, and only when behavior preservation is cheap to prove. Once causal
closure is proven, stop.

## Stop

<!-- do-it-contract:build.uncertainty-stop -->
`NEEDS_CONTEXT` / `BLOCKED` when the premise cannot be verified locally or a
new surface has no consumer; boundary and ambiguity rules: `core §r-boundary`,
`core §r-uncertainty`. Evidence before claims: `core §r-evidence`.
