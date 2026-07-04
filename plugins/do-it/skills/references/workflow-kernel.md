# Workflow Kernel

Single source for failure-mode forecast, path map, and shared anti-skip discipline.
Router, planning, subagent-orchestration, slicing, and review-loop point here — do not duplicate the full definitions elsewhere.

## When Forecast And Path Map Apply

**Standard and Heavy** routes that touch behavior, interfaces, runtime state, or surfaces need both unless clearly N/A.

**N/A** when work is docs-only (no install/release/workflow policy change) or purely mechanical with obvious local verification. State `failure-mode forecast: none identified` and `path map: not applicable` with a one-line reason.

Light tier skips forecast/path map unless the parent explicitly assigns them to a subagent slice.

### Tier precedents (forecast / path map)

| Work shape | Tier | Forecast / path map |
| --- | --- | --- |
| Single-file typo, log copy, or comment-only edit | Light | Not required |
| 1–3 file bounded fix, no interface change | Standard | `failure-mode forecast: none identified (local fix)` + `path map: not applicable (single-module)` |
| Cross-package refactor, schema/API change, or multi-agent wave | Heavy | Full forecast + path map before edits |

Router tier selection still follows hook/skill rules; these precedents govern whether forecast and path map are required once tier is chosen.

## Failure-Mode Forecast Classes

Name concrete classes before planning or implementation — not vague "risk":

| Class | What it catches |
| --- | --- |
| **live-path gap** | Producer, transport, consumer, or surface is not actually wired |
| **state-machine gap** | Stale async completion, deletion, rollback, retry, replay, idempotency, or concurrency changes the outcome |
| **contract drift** | Schema, enum, event, route, CLI, copy, or docs disagree |
| **synthetic proof** | Tests mock away the collaborator chain the task must prove |
| **operator gap** | Capability exists but is not discoverable, actionable, or understandable in the user workflow |
| **evidence drift** | Report, worker result, or pre-merge run is older than the branch or worktree being claimed |

If no class fits: `failure-mode forecast: none identified` plus why.

## Path Map Chain

Map the proof path before execution:

```text
producer -> contract/event/schema -> transport/client -> state/query -> surface/operator action -> verification
```

Use the map to choose drills, tests, reviewers, and verification. Subagent prompts and plan cards use the same chain; field name `Path Map:` in handoffs.

## Decision Ladder (Restraint)

Walk down and stop at the first rung that holds:

1. Does it need to exist? → skip speculative work.
2. Stdlib? → use it.
3. Native platform feature? → use it.
4. Installed dependency? → use it.
5. One line? → one line.
6. Smallest custom code that works.

Never cut safety: trust boundaries, data-loss prevention, security, accessibility, or explicit user features.

## Global Rationalizations (Anti-Skip)

These excuses do not waive gates:

- *"Tests pass, so review / forecast can be shallow."* — Tests are one evidence source; scope, contracts, maintainability, and proof quality still matter.
- *"I'll add the path map after implementation."* — Standard/Heavy behavior work needs forecast and path map before edits.
- *"This is generated output / docs only."* — Generated and workflow docs still drift; verify script path and source of truth.
- *"The subagent will figure out dependencies."* — Parent owns sequencing, shared files, forecast, and path map in the prompt contract.
- *"Likely hard / not worth it without checking."* — Inspect local truth or run the smallest real experiment first.
- *"Heavy ceremony for a one-file edit."* — Reclassify as Light; do not skip gates by mis-tiering.
- *"Verification passed, skip review."* — Verification proves commands ran; review checks scope, contracts, and proof quality.
- *"User already gave a plan — no local read needed."* — Treat as intent; re-read current files before acting.

## Red Flags

- Routing Standard/Heavy work without failure-mode forecast and path map (or explicit N/A).
- Starting planning, edits, subagents, review, verification, commit, or closeout without loading `do-it-router` for non-trivial work.
- Asking the user for facts readable locally.
- Subagent self-promotes to Heavy without explicit parent assignment.
- Review quotes commit messages instead of diff or file evidence.
- New route/command/export accepted without caller, surface, or verification witness.
- Dependency or architectural surface appears without research trail (see `do-it-planning` § Research-First Comparison).
- Pre-merge or worker evidence accepted as final integrated proof.

## Diverge vs Converge

| When | Use | Do not |
| --- | --- | --- |
| Requirement shape unclear; need an options map | `do-it-brainstorm` (diverge) | Converge or pick a final route |
| Premises, necessity, or user decisions still open | `do-it-grill` (converge) | Re-open a full options map |
| Grill needs a sub-lens on scope, acceptance, or route | `plan-challenger` agent (grill sub-lens only) | Substitute for brainstorm or grill |

## Finding Schema

Minimum shape for review and fix-loop returns (merge former `category` into `cause_class`):

```text
severity: Blocking | Important | Opportunity
location: file:line or command evidence
issue: behavior/risk terms
cause_class: short tag (merge former "category" / "cause class")
required_fix: ...
NOT_CHECKED: explicit list of scope/checks not performed (required on review returns even if empty)
```

Pointers: `do-it-review-loop` § Finding Shape; `do-it-comments-discipline` § Output Shape; `do-it-fix-loop`.

## Skip Announcement

When routing skips a skill or mandatory trigger, announce uniformly:

```text
skipped: <skill-or-hook> because <reason>
```

Pointers: `commands/do-it-skip.md`; [`dimensions.md`](dimensions.md) § Mandatory-Trigger Escape Clauses; `do-it-router` § Output Shape.

## Output Fields (Routing / Planning)

When routing or planning, internal decision should include: tier; current facts; failure-mode forecast; path map or N/A reason; selected skills; next action; stop/approval gate. User-visible: one line with tier + next action.

For final delivery: changed files; verification outcome; fresh branch/worktree evidence; review/fix-loop status; steps used/skipped; residual risk.
