---
name: do-it-decide
description: "Use when a decision, plan, dependency, or handoff could change what gets built: find the highest-value unknown, resolve it cheaply, commit only settled decisions and acceptance."
---

# Do-It Decide

Decide before building only where a wrong decision is expensive. Do not spend
more cognition than the decision is worth (`core §r-route`).

Leading words: **decision surface**, **cheapest resolver**, **decision boundary**, **readiness**.

Bounded reversible work with the route already determined: inspect, act, check.
Do not manufacture a plan file, interview, or worker.

## 1. Find the decision-changing unknown
<!-- do-it-contract:decide.find-unknown -->

State the outcome and the one uncertainty that can change scope, user-visible
behavior, authority, reversibility, or proof. Read facts; do not ask the user
for information the environment can provide (`core §r-evidence`).

When the user may not know what to consider, run a brief **blind-spot** pass.
When they can recognize but not verbalize the answer, use a reference,
materially different options, or the cheapest useful prototype — not an
interview. Unknown types: [`decision-resolvers.md`](../references/decision-resolvers.md).

## 2. Cheapest reliable resolver
<!-- do-it-contract:decide.cheap-resolver -->

Use the cheapest reliable resolver:
repo evidence → reference → one user decision → research → experiment/prototype
→ at most one fresh-context second look. Subagents are last, not default.

Ask **one** question at a time; wait for the answer. Each question: 2–3 options
that differ on a load-bearing axis, tradeoffs, recommended default. If the user
cannot evaluate the options, teach the real trade-off and recommend a default;
do not extract a guess (`core §r-uncertainty`).

## 3. Dominant route or decision boundary
<!-- do-it-contract:decide.dominant-or-boundary -->

Do not generate cosmetic variants. Alternatives must differ on a load-bearing
axis: framing, seam, authority, flow, dependency, reversibility, optimization
target, or scope.

If one route satisfies every must with less concept growth and no hidden caller
cost, choose it. Otherwise state the **decision boundary**: the fact under which
each viable route wins. Do not average two live routes into a hybrid score.

## Settled decisions
<!-- do-it-contract:decide.settled-protection -->

`[user]` / `[evidence]` / `[choice]` stay closed until new evidence invalidates
their basis. `[assumption]` stays labeled and open. Do not reopen a settled
decision to look thorough (`core §r-scope`).

## 4. Readiness
<!-- do-it-contract:decide.readiness -->

Start implementation when remaining unknowns are cheap, reversible, or better
resolved by execution. Keep deciding only when an unknown can still change
Goal, user-visible behavior, key authority/boundary, an irreversible choice,
Acceptance, or whether a credible proof path exists.
Gate: [`task-contract.md`](../references/task-contract.md) § Readiness.

Do not enact the plan until shared understanding is confirmed (or the user
explicitly skips).

## 5. Minimal contract
<!-- do-it-contract:decide.minimal-contract -->

Default: resolve in chat and proceed. Write a durable file only when another
session/worker must continue, the decision is costly to reverse, several settled
decisions must survive context, units have real dependencies, acceptance may
drift, or the user asks for a written plan.

Required sections: Goal, Decisions, Boundary, Acceptance. Optional only when
they change execution: Change Map, Units, Open, one-line Rejected rationale.
Template: [`task-contract.md`](../references/task-contract.md).

## Delegation

Default **0** subagents. At most **one** targeted second look, and only when it
could change a costly route. No fixed stage or agent count. A risk label is not
a reason to pressure-test or dispatch.
Budget: [`workflow-kernel.md`](../references/workflow-kernel.md) § Delegation Budget.

## Stop

Pause when a user-owned preference still gates the route (`core §r-uncertainty`).
Do not expand scope silently (`core §r-scope`).

## Anti-skip

- *"A high-risk label means a long interview."* — It does not. Resolve the
  unknown that changes the route.
- *"A plan file makes this organized."* — Chat is the default; durable
  contracts are earned.
- *"Ask the user; it is faster than reading."* — Readable facts are not
  questions (`core §r-evidence`).
