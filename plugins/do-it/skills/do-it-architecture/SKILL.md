---
name: do-it-architecture
description: "Use when authority, ownership, public or persisted contracts, dependency boundaries, migration/cutover, recovery, guards, or structural deletion can change the safe route."
---

# Do-It Architecture

Load-bearing authority, ownership, contracts, cutover, recovery, and
guards. Skip when the work only consumes supplied architecture unchanged.

Read repository truth first (`core §r-evidence`). Do not elevate every
document to a rule. Default **0** subagents
([`../references/workflow-kernel.md`](../references/workflow-kernel.md)).

## Route First

Choose one task route before applying surfaces. Architecture work stays
parent-owned unless a child is assigned that slice. Apply only surfaces
whose answers can change the decision.

## Decision Surfaces
<!-- do-it-contract:architecture.decision-surfaces -->

| Surface | Question | Closure |
| --- | --- | --- |
| **Spine & Surfaces** | Which entry → mutation → accepted state → visible effect → completion/recovery points are load-bearing, and is each surface public, persisted, cross-boundary, or private? | Smallest repository-named spine; narrowest compatibility promise; consumers known before a break. |
| **Authority & Ownership** | Who decides meaning, who may write, who projects, who recovers — and who owns the lifecycle? | Semantic / admission / projection / recovery kept independent; owner, rights, and non-ownership named. |
| **Failure & Recovery** | What happens on denial, duplicate, race, replay, cancel, timeout, partial/uncertain commit, stale copy, retry/restart? | Trigger, recovery owner, terminal invariant, and evidence — or an explicit finding. |
| **Change & Cutover** | What is the compatibility promise, who consumes it, and what retires? | Consumers, migration/deprecation, rollback, and deletion path before a break or rewrite. |
| **Governance** | Which material rules need a check, is the honest path costlier than bypass, and does a new noun earn its keep? | Falsifiable guard or auditable review; avoidable friction removed; net-growth before a new concept. |

Eight-lens detail:
[`references/architecture-rationale.md`](references/architecture-rationale.md).
On-demand negative-path scan:
[`../references/stateful-change-scan.md`](../references/stateful-change-scan.md).
Do not copy those faces here.

### Authority quartet
<!-- do-it-contract:architecture.authority-quartet -->

One semantic authority ≠ one physical writer.

| Role | Question |
| --- | --- |
| **Semantic** | Who decides meaning and legal states? |
| **Admission** | Who blocks illegal input or mutation? |
| **Projection** | Who maintains a derived view without redefining the source? |
| **Recovery** | Who judges committed, retry, repair, or reconcile? |

Place validation, defaulting, normalization, cache, and retry with this
quartet — not by file kind. Mechanism may sit where execution is cheap;
policy stays with the owner of end-to-end intent.

- **Replace test:** if this layer were replaced, would the rule still hold? If yes, it is not semantic authority.
- **Bypass test:** is there a legal mutation path that skips this layer? If yes, it cannot enforce the invariant alone.

## Task Routes

Narrowest route that fits. Each ends **closed** (evidence supports the
decision) or **open** (alternatives or findings with named unknowns).

- **`greenfield_design`** — compare load-bearing options before repository fact sources exist. Preferred option or unforced alternatives; proposed invariants, authority, compatibility, negative path, unknowns.
- **`architecture_review`** — assess an RFC, design, or structural diff. Severity-ordered findings, missing evidence, risk.
- **`boundary_change`** — add, widen, move, or delete a contract, schema, export, flag, or entry. Compatibility, consumers, migration, authority, verification.
- **`structural_refactor`** — split, merge, relocate, or rewrite a load-bearing slice. Smallest safe slice, preserved contracts, dependents, retirement, checks.

Do not manufacture an architecture dossier for a private reversible choice.
<!-- do-it-contract:architecture.no-private-dossier -->

Use `do-it-code-quality` for producer→consumer contracts, `do-it-decide` for
alternatives, and `do-it-review` for severity-ranked findings.

## Findings

- A proposed new surface has no consumer → stop; needs a consumer or explicit deferral (`core §r-scope`).
- A copy, cache, or projection becomes a second authority → finding; repair the source or name the projection as derived.
- Uncertain commit has no recovery owner or path → finding (`core §r-recovery`).
- Authority, ownership, or cutover hangs on a material assumption → keep that unknown open (`core §r-uncertainty`).
- The load-bearing spine cannot be mapped from repository truth → `NEEDS_CONTEXT` with the missing sources named.

## Verification

- Applicable surfaces closed with file, contract, test, owner, or explicit unknown.
- Boundary changes record compatibility and consumer impact.
- Closeout follows `core §r-verify`; use the narrowest fresh check for the changed path.
