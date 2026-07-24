# Workflow Kernel

Shared finding schema, path map chain, and failure-mode classes. Meaning skills point here — do not duplicate full definitions elsewhere.

## When Forecast And Path Map Help

Use a forecast or path map when behavior, interfaces, runtime state, or a
cross-boundary handoff makes it change the route or proof. Keep it as short as
the decision needs; do not complete a form for bounded local work.

Docs-only or mechanical work with obvious local verification normally skips
both. A brief `N/A` note is useful only when another worker or session could
otherwise misread the boundary. Light normally skips unless its assigned slice
has a real risk boundary.

### Tier precedents (forecast / path map)

| Work shape | Tier | Forecast / path map |
| --- | --- | --- |
| Single-file typo, log copy, or comment-only | Light | Not required |
| 1–3 file bounded fix, no interface change | Standard | Usually skip; add a one-line local risk only if it changes proof |
| Cross-package refactor, schema/API, or multi-agent wave | Heavy | Usually map the live path and likely failure modes when they guide ownership or verification |

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

## Path Map Chain

Map the proof path before execution:

```text
producer -> contract/event/schema -> transport/client -> state/query -> surface/operator action -> verification
```

Use the map to choose tests, reviewers, and verification. Field name `Path Map:` in handoffs. Bounded local→global walk: [`scope-chain.md`](scope-chain.md).

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

## Delegation Boundary

The parent owns integration. Delegate when an independent slice is useful; do
not make a fixed contract or a named role a prerequisite for exploration.

Give a worker only what it needs:

- the goal or question to resolve;
- the slice and any write/side-effect boundary;
- the result, uncertainty, or evidence that would help the parent decide.

The worker should return a compact result in its own useful shape and name what
it did not check. Add explicit facts, proof targets, or stop conditions only
when the task has a real ambiguity or risk boundary. Workers do not commit,
merge, revert peer work, or expand into unassigned write boundaries by default.

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

## Useful Fields (Routing / Planning)

For a handoff or durable plan, record only the fields another worker needs:
tier, current facts, a forecast/path map when useful, selected capabilities,
next action, and any real approval boundary.

For final delivery, report the changed surface, relevant fresh evidence, and
residual risk or uncertainty. Do not manufacture a fixed report shape.
