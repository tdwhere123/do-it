---
name: do-it-code-quality
description: "Use when writing or designing code: name premise and blast radius, deepen modules at seams, TDD at agreed seams, diagnose before patching, and keep producer→consumer contracts honest."
---

# Do-It Code Quality

Main defense **while writing**. Prefer depth, locality, and real feedback over ceremony.

Leading words (use them): **deep module**, **seam**, **tracer bullet**, **red before green**, **scope chain**.

## Scope Chain (before edit)

1. **Premise** — one sentence: if this fact is wrong, the change is wrong.
2. **Blast radius** — who breaks (callers, live paths, tests, persistence).
3. **Bounded chain** — producer → contract → transport → state → surface → verify. Do not tour the whole repo.

Detail: [`../references/scope-chain.md`](../references/scope-chain.md).

## Deep Modules

Prefer **deep modules**: small **interface**, rich **implementation**, at a clean **seam** (Feathers).

| Term | Meaning |
| --- | --- |
| Depth | Behavior callable per unit of interface the caller must learn |
| Leverage | Callers get more capability per learned interface |
| Locality | Change/bugs/verification concentrate in one place |
| Adapter | Concrete thing that satisfies an interface at a seam |

- **Deletion test:** remove the module — if complexity vanishes, it was a pass-through; if it reappears across N callers, it earned its keep.
- **One adapter = hypothetical seam; two adapters = real seam.** No speculative seams.
- **Interface is the test surface.** Accept dependencies; do not construct them inside.
- **Inline / delete** thin wrappers and Phase-2 scaffolding.

## Comments — Anchors, Not Narrative

Comments answer what the next reader must know that code cannot say.

**Allowed:** tool docstrings; `// @anchor:<id>`; `// see also: <path>`; `// invariant: ...`; real tool directives with a reason.

**Forbidden:** what-comments, history/fix narrative, ticket refs, tombstones, orphan TODOs (need `TODO(@owner): <closing condition>`).

## TDD (behavior changes)

When changing behavior and a RED test is practical:

1. Agree the **seams** under test (public boundaries) — do not test internals.
2. **Red before green** — smallest failing test, right failure reason, then smallest green.
3. One **tracer bullet** per cycle (vertical slice). No horizontal “all tests then all code”.

**Anti-patterns (reject):**

- Implementation-coupled tests (private methods, mock soup of collaborators)
- Tautological asserts (`expect(f(a,b)).toBe(a+b)`)
- **Test fiction** — mocks that prove a double, not the live contract
- Speculative generality for needs the task does not have

Mechanical/docs edits may skip RED — state why.

## Debugging

Symptom → reproduce → one hypothesis → falsify with the smallest check → fix the cause → regression proof. Three failed patches → question the design before another try.

## Builder Stance

Optimize from evidence, not assumed limits. **Unknown is not impossible**: establish a measured baseline, preserve a correct fallback, then test a plausible breakthrough path. Before investing deeply, run the **cheapest falsifier** that could disprove the key premise; promote the idea only when observed results beat the baseline on the metric that matters.

A feature bound for production is not done until its **evidence surface** is named — the log line, metric, or trace that will show it alive or failing there.

## Boundaries & Worktrees

Use a separate worktree only for genuinely parallel, risky, or conflicting work — not a bounded one-thread change. The parent owns shared files and integration.

Merge conflicts resolve **hunk by hunk, by intent**: trace each side to its source (commit, PR, issue) and preserve both intents where possible; where they truly collide, follow the merge's stated goal and note the trade-off. Never escape via `--abort` or wholesale `--ours`/`--theirs`. Finish the operation, then run the project's checks.

Public/API/schema or cross-package work needs both-side mapping: ownership and dependency direction, compatibility/rollback effect, producer → consumer proof path, and the smallest boundary check. Stop when a proposed new surface has no consumer.

## Contracts

Map the proof path. Do not invent APIs/exports/events without an in-task consumer. Schema/API changes need both sides.

## Metacognition Stops

Rewrite when you notice: `as any` / `@ts-ignore`, over-mock, swallowed errors, unused exports, cover-up edits.

Advisory hook families: [`../references/write-quality-families.md`](../references/write-quality-families.md).

## Stop

`NEEDS_CONTEXT` / `BLOCKED` when premise cannot be verified locally, the fix crosses unassigned boundaries, or a new surface has no consumer.
