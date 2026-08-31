# Workflow Kernel

Shared vocabulary for Task Contract, delegation budget, findings, and the
causal change cone. Meaning skills point here — do not duplicate full
definitions elsewhere.

## Task Contract

The durable work object is Goal / Decisions / Boundary / Acceptance.
Shape, persist criteria, provenance, and readiness:
[`task-contract.md`](task-contract.md).

Do not store live progress in the contract. Progress comes from git, runtime
events, and evidence. Cite `core §r-scope` rather than restating it.

## Delegation Budget
<!-- do-it-contract:delegation.zero-default -->

Default **0** subagents. At most **one** fresh-context second look, and only
when at least one holds:

1. a wrong call is expensive and independent evidence could change the route;
2. the question compresses to a narrow, verifiable, usually read-only slice;
3. the current context is too anchored to audit its own premise.

"Heavy" is not a dispatch reason. Parallel workers only for disjoint write
scopes or an explicit user request.

The parent owns integration, shared files, and the completion claim. A worker
must not commit, merge, push, tag, publish, revert peer work, or expand its
write scope.
<!-- do-it-contract:delegation.child-write-boundary -->

Give a worker only: the question or goal, the slice and write/side-effect
boundary, and the evidence that would help the parent decide. The worker
returns a compact result and names what it did not check.

## Change Cone

Allowed edits follow causal fallout from the active contract, not adjacency.
Map the proof path when behavior, interfaces, runtime state, or a
cross-boundary handoff would change the route or proof:

```text
producer -> contract/event/schema -> transport/client -> state/query -> surface/operator action -> verification
```

Bounded local→global walk: [`scope-chain.md`](scope-chain.md). Docs-only or
mechanical work with obvious local verification normally skips the map.

## Failure-Mode Forecast Classes

Name concrete classes — not vague "risk":

| Class | What it catches |
| --- | --- |
| **live-path gap** | Producer, transport, consumer, or surface not actually wired |
| **state-machine gap** | Stale async, deletion, rollback, retry, replay, idempotency, concurrency |
| **contract drift** | Schema, enum, event, route, CLI, copy, or docs disagree |
| **synthetic proof** | Tests mock away the collaborator chain the task must prove |
| **operator gap** | Capability exists but is not discoverable/actionable in the user workflow |
| **evidence drift** | Report or pre-merge run older than the branch/worktree being claimed |

If none fit: `failure-mode forecast: none identified` plus why.

## Decision Ladder (Restraint)

Stop at the first rung that holds:

1. Need it? → skip speculative work
2. Stdlib?
3. Native platform feature?
4. Installed dependency?
5. One line?
6. Smallest custom code that works

Never cut safety: trust boundaries, data-loss, security, accessibility, or explicit user features.

## Evidence-Driven Optimization

Unknown is not impossible, but possibility is not proof. Record the current baseline and success metric, keep the known-correct path available, and probe the breakthrough hypothesis with the cheapest falsifier first. Scale investment only when the observation survives that test and materially improves the baseline.

## Finding Schema

Minimum shape for review and fix returns (merge former `category` into `cause_class`):

```text
severity: Blocking | Important | Opportunity
location: file:line or command evidence
issue: behavior/risk terms
cause_class: short tag
required_fix: ...
NOT_CHECKED: explicit list of scope/checks not performed (required even if empty)
```

## Skip Announcement

```text
skipped: <skill-or-hook> because <reason>
```

## Useful Fields

For a handoff or durable contract, record only what another executor needs:
goal, settled decisions, boundary, acceptance, and any real approval limit.

For final delivery, report the changed cone, acceptance evidence, and residual
risk. Do not manufacture a fixed report shape.
