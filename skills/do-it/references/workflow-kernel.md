# Workflow Kernel

Shared finding schema, path map chain, and failure-mode classes. Meaning skills point here — do not duplicate full definitions elsewhere.

## When Forecast And Path Map Apply

**Standard / Heavy** work that touches behavior, interfaces, runtime state, or surfaces needs both unless clearly N/A.

**N/A:** docs-only (no install/release/workflow policy) or mechanical with obvious local verification. State `failure-mode forecast: none identified` and `path map: not applicable` with a one-line reason.

Light skips unless a parent assigns them to a slice.

### Tier precedents (forecast / path map)

| Work shape | Tier | Forecast / path map |
| --- | --- | --- |
| Single-file typo, log copy, or comment-only | Light | Not required |
| 1–3 file bounded fix, no interface change | Standard | `none identified (local fix)` + `path map: not applicable (single-module)` |
| Cross-package refactor, schema/API, multi-agent wave | Heavy | Full forecast + path map before edits |

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

## Parent Delegation Contract

The parent owns integration. A delegated slice must state:

- tier + route/lens;
- scope and non-goals;
- write ownership and restricted paths;
- supplied facts versus facts the worker must verify;
- acceptance/proof target and stop condition.

Return one compact result:

```text
status: DONE | NEEDS_CONTEXT | BLOCKED
paths: changed or inspected
proof: command/inspection result, or NOT_CHECKED
residual risk: ...
```

Workers do not commit, merge, revert peer work, or expand into unassigned boundaries by default.

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

## Output Fields (Routing / Planning)

Internal: tier; current facts; failure-mode forecast; path map or N/A; selected meaning buckets; next action; stop/approval gate.

Final delivery: changed files; verification; fresh branch/worktree evidence; review status; steps used/skipped; residual risk.
