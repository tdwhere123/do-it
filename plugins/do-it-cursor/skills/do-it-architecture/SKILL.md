---
name: do-it-architecture
description: "Use when work changes or evaluates load-bearing authority, ownership, public or persisted contracts, dependency boundaries, migration/cutover, recovery, guards, or structural deletion."
---

# Do-It Architecture

Architecture governance for load-bearing decisions: authority, ownership,
contracts, dependency boundaries, cutover, guards, deletion, and drift. Skip
when the work only consumes supplied architecture unchanged.

Read repository truth first — invariants, CONTEXT.md, handbook, contracts, and
guards set facts, terms, and precedence (**core §r-evidence**). Do not elevate
every document to a rule.

## Route First

Choose one task route before applying lenses. Heavy architecture work stays
parent-owned unless a child agent is explicitly assigned that architecture
slice. Apply only lenses whose answers can change the decision; record `N/A`
only when omitting a lens could otherwise hide material risk.

## Lenses

Apply only lenses whose answers can change the decision:

| Lens | Question | Closure |
| --- | --- | --- |
| **L1 Spine** | Which entry, mutation, accepted-state, visible-effect, completion, and recovery points are load-bearing? | Smallest repository-named spine; every new/omitted point justified; changed path or retired path named. |
| **L2 Surfaces** | Is each surface public, persisted, cross-boundary, or private? | Narrowest compatibility promise; consumers and cutover/deprecation known before a break. |
| **L3 Authority** | Per fact and jurisdiction, who decides truth and who may write through which route? | Fact/decision authority, owner, admission, partition/replica, commit/conflict, projection, and recovery dimensions kept independent where applicable. |
| **L4 Ownership** | Who owns each fact, contract, boundary decision, and lifecycle? | Owner, decision rights, escalation, non-ownership, and public/assembly crossing identified; no shared layer merely because two consumers exist. |
| **L5 Negative path** | What happens on applicable denial, failure, partial/stale/cancelled work, timeout, duplicate/order/conflict/partition, uncertain commit, retry/restart/replay? | Trigger, authority, owner, repair/reconciliation, terminal invariant, evidence, and failed-convergence escalation. |
| **L6 Guards** | Which material rules justify enforcement, and can the check detect a violation? | Traceable reason, proportionate falsifiable check or auditable review; exception baseline shrink-only. |
| **L7 Governed path** | Where is the honest path costlier than bypass? | Avoidable friction removed without weakening controlling policy; recurring bypass treated as a routing signal. |
| **L8 Change/deletion** | Does a new noun/layer remove more ambiguity than it adds, and what does it retire? | Net-growth review; smallest replaceable slice and preserved contracts before rewrite; whole replacement only when smaller migration is evidenced riskier. |

Use `do-it-code-quality` for producer→consumer contracts, `do-it-decide` for
decision alternatives and negative-path planning, and `do-it-review` for
severity-ranked findings. Failure-mode rationale for the lenses is progressive
detail: [`references/architecture-rationale.md`](references/architecture-rationale.md).

## Task Routes

Use the narrowest route that fits. Each route terminates **closed** (evidence
supports the decision and its closure conditions) or **open** (viable
alternatives or findings with explicit unknowns).

- **`greenfield_design`** — compare load-bearing options before repository fact
  sources exist. Output: preferred option or unforced alternatives, proposed
  invariants, authority/ownership, compatibility, negative path, and unknowns.
- **`architecture_review`** — assess an RFC, design, or structural diff. Output:
  severity-ordered findings, boundary decisions, missing evidence, and risk.
- **`boundary_change`** — add, widen, move, or delete a contract, schema,
  export, flag, or entry surface. Output: compatibility commitment, consumers,
  migration/deprecation, authority, and verification requirement.
- **`structural_refactor`** — split, merge, relocate, or rewrite a load-bearing
  slice. Output: smallest safe slice, preserved contracts, dependents,
  retirement/deletion path, and checks.

For every route, start from repository evidence and stop when its required
output is either evidenced or explicitly open. Do not manufacture an
architecture dossier for a private reversible choice.

## Stop Conditions

- Authority, ownership, or cutover depends on a material assumption → surface
  it and keep the decision-changing unknown open (**core §r-uncertainty**).
- A proposed new surface has no consumer → stop; needs a consumer or explicit
  deferral (**core §r-scope**).
- The load-bearing spine cannot be mapped from repository truth →
  `NEEDS_CONTEXT` with the missing sources named.

## Common Rationalizations

- *"The change is small; we can break it silently."* — Any public, persisted,
  or cross-boundary surface needs an explicit compatibility or cutover
  strategy (L2).
- *"Everyone owns it."* — Ambiguous ownership is a finding, not a consensus
  model (L4).
- *"The guard never fires, so it works."* — A quiet guard needs a
  planted-violation sensitivity check (L6).
- *"It is just one more concept."* — Net-growth review: it must remove more
  ambiguity than it adds (L8).
- *"The rewrite is cheaper than understanding it."* — Rewrite gravity
  discounts the institutional knowledge it destroys; name the smallest slice
  first (L8).

## Red Flags

- A new top-level concept with no declared jurisdiction or decision rights.
- A rewrite that starts at whole-target replacement without naming a smaller
  slice or its preserved contracts.
- Guards without evidence they can detect a violation, or exception lists that
  only grow.
- Deletion or migration without enumerating dependents and their migration or
  retirement path.

## Verification

- Every applicable lens closed with concrete evidence — file, contract, test,
  owner, or explicit unknown.
- Boundary changes record the compatibility commitment and consumer impact.
- Net-growth review recorded for every new concept.
- Closeout evidence follows `core §r-verify`; use the narrowest fresh check for
  the changed path.

Provenance for each lens (why it exists, what failure mode it closes):
[`references/architecture-rationale.md`](references/architecture-rationale.md).
