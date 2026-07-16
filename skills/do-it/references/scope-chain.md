# Scope Chain

Bound work without reading the whole repo. Used by `do-it-code-quality` and path maps.

Leading words: **premise**, **blast radius**, **bounded chain**.

## Premise

For a non-trivial change, keep one sentence in the working context:

> If \<this fact\> is wrong, the change is wrong or unsafe.

Falsify cheaply (`rg`, open the file, narrowest command). User claims about behavior are not facts until local truth agrees.

## Blast Radius

Who breaks if the premise is wrong:

- Callers / consumers of the changed symbol or contract
- Live paths (routes, CLI, events, UI) that reach it
- Tests, generated outputs, docs, install surfaces
- Persistence, auth, or concurrency if touched

Cross-package / interface / release policy → escalate tier or review intensity. One module + obvious check → stay Light.

## Bounded Producer → Consumer Chain

Proof path for **this** change only:

```text
producer -> contract/event/schema -> transport/client -> state/query -> surface/operator action -> verification
```

- Start at the changed producer (or first wrong value under debug).
- Walk forward to the consumer/surface that must still work.
- Walk back only to the first wrong decision or missing wire.
- Stop when the next hop is unrelated to acceptance.

Classes / N/A: [`workflow-kernel.md`](workflow-kernel.md).

## Local → Global Without Whole-Repo Reads

1. Own file + nearest test / caller — always.
2. Direct imports / exports — when the symbol or contract changes.
3. Package or interface boundary — when crossing one.
4. Repo-wide search — rename, shared invariant, or `@anchor` / term grep — never as the default first move.

Prefer one bounded chain over a package tour. No consumer in-task → do not invent the API.

## Quick Checks

- New export/route/event with no in-task consumer? Treat it as an unused surface
  unless the user explicitly asked for the extension point.
- Tests mock away the chain under proof? Test fiction — tighten or add a real-path check.
- Docs/generated output disagree with the contract? Fix both sides or defer explicitly.
