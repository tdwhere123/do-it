---
name: do-it-decide
description: "Use when premises or options must be pressure-tested, a short plan/handoff is needed, or a large plan must be sliced — grill facts locally, ask decisions one at a time."
---

# Do-It Decide

Align before you build. Standard stays short; Heavy earns pressure-test. No mandatory brainstorm→grill→plan chain.

Leading words: **grill**, **tracer bullet**, **path map**.

## Modes

| Mode | When |
| --- | --- |
| **Grill** | Heavy default; Standard only if a load-bearing premise or user preference gates the route |
| **Diverge** | Requirement or architecture shape is genuinely unclear |
| **Plan card** | Handoff, multi-step Standard, or Heavy needs durable acceptance/verify notes |
| **Slice** | More than one independently deliverable unit |

Skip for Light mechanical work and pure questions.

## Grill Rules

Interview relentlessly on **decisions**; never on readable **facts**.

1. Necessity first — does this need to exist?
2. One load-bearing premise at a time; falsify with local files (`path:line`) before asking.
3. Ask **one** question at a time; wait for the answer. Multiple simultaneous questions confuse.
4. For each question: 2–3 options, tradeoffs, **recommended default**.
5. Do not enact the plan until shared understanding is confirmed (or the user explicitly skips).

## Diverge Briefly

Surface real alternatives (skip → stdlib/native → existing → minimal custom). Do not invent fog. Hand route-changing choices to grill.

## Research-First Surfaces

For a new dependency, datastore, framework/runtime, protocol, or other permanent external surface: inspect repository constraints, compare at least two viable candidates, and record compatibility, maintenance/activity, license, operational fit, and a recommendation. Ask the user only when a preference changes the selected route; never memory-pick a permanent dependency.

## Shortest Plan Card

Only fields that change execution:

- Goal / non-goals
- Current truth (facts vs assumptions)
- Acceptance evidence
- Failure-mode forecast + path map (or N/A) — [`../references/workflow-kernel.md`](../references/workflow-kernel.md)
- Verification commands
- Review depth / stop / ownership when delegating

Durable file only when another session or worker must read it.

## Slice Only When Large

Thin vertical tracer bullets. Each slice: ownership, deps, acceptance, AFK/HITL. Parallel only with disjoint writes. Parent owns shared files and integration.

## Stop

Pause when preference gates the route. Do not expand scope silently.
