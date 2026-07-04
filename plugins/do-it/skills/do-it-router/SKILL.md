---
name: do-it-router
description: "Use at the start of any non-trivial repo task: choose the Light / Standard / Heavy tier and the minimum useful do-it workflow before planning, editing, delegating, reviewing, or claiming done. 路由 / 分级 / 非平凡任务."
---

# Do-It Router

## Purpose

Front door for do-it-native work: smallest useful workflow, current truth ahead of old plans, route to matching skills. Use do-it terms in handoffs — upstream workflow names are source material, not public names.

## Mandatory Activation

For any non-trivial repository task, the parent agent MUST load this router before planning, editing, delegating, reviewing, verifying, committing, or claiming completion.

Skip only for truly trivial answers or pure status questions that do not plan, edit, review, verify, or close work — state the reason briefly.

After loading, announce selected do-it skills and tier before continuing.

## First Move

1. Read local instructions, user constraints, write ownership.
2. Read `.do-it/runtime/pointer` if present (active slug → `.do-it/{brainstorm,grill,plans}/<slug>.md`). Skip when no `.do-it/`.
3. Inspect current truth: files, docs, diffs, tests, plans, issues, runtime state.
4. Choose tier: `Light`, `Standard`, or `Heavy`.
5. If user asked for a plan first, stop at approval checkpoint.

Do not ask for locally readable facts. Preference questions: one at a time, 2–3 options with benefit/cost/risk and a default; use host question tool when available.

## Integrity

Load [`../references/integrity.md`](../references/integrity.md) when debugging, fixing, reviewing, or verifying. `do-it-debugging`, `do-it-fix-loop`, and `do-it-verification-gate` enforce at their stages; cover-up is Blocking in review.

## Stance

Rigorous without passive: builder's bias (unknown ≠ impossible), conservative claims with active search, two-path framing for hard optimization, no learned helplessness without code/data evidence. Hooks inject compact stance via `subagent-stance.sh`.

## Restraint

Smallest change that earns its keep. Write-time: advisory `write-quality-lint` ([`../references/write-quality-families.md`](../references/write-quality-families.md)). Review-time YAGNI/integrity: `do-it-review-loop`. Done-claims: `verification-gate`.

Decision ladder (6 rungs): need? → stdlib → native → dependency → one line → smallest custom code. Full ladder + anti-skip: [`../references/workflow-kernel.md`](../references/workflow-kernel.md).

## Orthogonal Dimensions

[`../references/dimensions.md`](../references/dimensions.md) — dim table, hook vs agent paths, escape clauses. Tier canonical; Light skips all dims.

## Task Pointer

[`../references/task-pointer.md`](../references/task-pointer.md) — read/write/clear. Pointer is best-effort; verify artifact exists.

## Failure-Mode Forecast And Path Map

Standard/Heavy: required before planning or implementation. Classes, chain, N/A rules, output fields: [`../references/workflow-kernel.md`](../references/workflow-kernel.md).

## Tier Rules

### Light

Small local low-risk work, one acceptance envelope. Flow: inspect → compact plan → act → targeted verification → local review → closeout.

### Standard

Default for subagents. Multi-step, behavior change, review, or design choice. Inline modification map when bounded; durable plan cards for Heavy/explicit plan/handoffs. Review depth by risk. Subagents need write ownership, stop conditions, return evidence, forecast/path map when applicable. Bounded 1–3 file fixes without interface change: one-line forecast/path-map N/A per [`../references/workflow-kernel.md`](../references/workflow-kernel.md) § Tier precedents.

Flow: inspect → classify → narrow drills → inline map or light plan → execute → verify → risk-selected review → fix → closeout.

### Heavy

Parent-only unless subagent explicitly assigned Heavy. Wave, phase, gate, release, multi-agent, cross-boundary risk. Closeout needs review/fix-loop proof.

Flow: scope lock → deep truth scan → drills as needed → slice plan → execution + review gates → integrated verification → closeout.

## Execution Pipeline

Non-trivial order (Light mechanical edits skip most):

1. Read task card / inline map, `invariants.md`, affected code.
2. Freeze scope; map producer → consumer for multi-package/live-path work.
3. Tests first when practical (`do-it-tdd`).
4. Smallest satisfying change; verify with slice commands.
5. `do-it-review-loop` on diff before done; sweep contract/doc drift.

Waves: `do-it-slicing` — parallel only when write sets disjoint; serialize shared barrels. Risky shared files: `do-it-worktree-isolation`.

## Handbook Bootstrap

Standard/Heavy work turn: if `.do-it/handbook/` exists, read relevant files; if `.do-it/CONTEXT.md` exists, read before grill/planning; if **neither**, load `do-it-handbook` lean bootstrap same turn (additive, idempotent). Skip only for explicit one-shot scripts.

Anti-tail: one card one goal; no silent scope expansion; no commit mid fix-loop without re-review; no mocking real collaborator chain unless card says so.

## Route Map

- Diverge vs converge: [`../references/workflow-kernel.md`](../references/workflow-kernel.md) § Diverge vs Converge — brainstorm for options map; grill to converge; `plan-challenger` only as grill sub-lens.
- Plan/handoff: `do-it-planning`. Slices: `do-it-slicing`. Challenge premise: `do-it-grill`.
- API/schema/event/CLI/UI contract: `do-it-interface-drill`. Coupling/ownership: `do-it-architecture-scan`. Module seams: `do-it-codebase-design`.
- Vocabulary/glossary: `do-it-context` § Domain Glossary Mode. Handbook: `do-it-handbook`. Visual compare: `do-it-planning` § Visual Aids (auxiliary).
- Implement/delegate: local or `do-it-subagent-orchestration` after route clear; `do-it-tdd` / `do-it-debugging` when warranted.
- Review: `do-it-review-loop`. Fix: `do-it-fix-loop`. Prove claims: `do-it-verification-gate`.
- Worktree: `do-it-worktree-isolation`. Closeout: `do-it-branch-closeout`. Skills: `do-it-skill-authoring`. Comments: `do-it-comments-discipline`.

Narrowest sequence for the risk.

## Delegation Policy

Parent owns routing, shared files, integration, final verification, claims. Subagent prompt: tier, scope, write ownership, forbidden paths, verified vs must-verify facts, evidence/return shape, forecast/path map when slice can fail through wiring/state/contracts/proof/UX/evidence, stop conditions (`NEEDS_CONTEXT` / `BLOCKED`), do not revert peer edits. Details: `do-it-subagent-orchestration`.

## Output Shape

**User-visible:** one line — tier + next action.

**Internal routing/planning:** tier; driving facts; forecast; path map or N/A; selected skills; next action; stop/approval gate. Full field list: [`../references/workflow-kernel.md`](../references/workflow-kernel.md).

**Final delivery:** changed files; verification; fresh branch/worktree evidence; review/fix-loop status; steps used/skipped with `skipped: <skill-or-hook> because <reason>`; residual risk.

## Common Mistakes

Anti-skip rationalizations and red flags: [`../references/workflow-kernel.md`](../references/workflow-kernel.md) § Global Rationalizations / Red Flags.
