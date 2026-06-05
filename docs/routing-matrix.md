# do-it Routing Matrix

This document is the public policy source for choosing do-it planning,
implementation, review, and closeout intensity.

The default environment is Codex. In Claude Code or another agent runtime, keep
the same roles and gates, then adapt tool names and delegation mechanics to that
runtime.

## Orthogonal Dimensions

In addition to the single-axis tier label (`Light` / `Standard` / `Heavy`),
the router writes five independent boolean dimensions to session state.
The tier value remains the canonical input every existing skill keys off.
Dimensions are **additive signals** that narrow *intensity*: downstream skills
and hooks SHOULD read them as mandatory triggers in the table below, but the
router never coerces tier from them.

| Dimension | Hits when | Active consumer |
|---|---|---|
| `dim_touches_code` | prompt names a file path, extension, fenced snippet, or curated technical noun | `hooks/grill-prompt.sh` — Standard-tier implicit triggers (uncertainty / long-input) are suppressed when this is 0, treating the turn as discussion |
| `dim_crosses_packages` | ≥ 2 distinct top-level path segments named in the prompt | `do-it-architecture-scan` skill — mandatory trigger when set |
| `dim_breaks_interface` | prompt mentions breaking change, schema rewrite, API rewrite, endpoint rename / delete / deprecate, or interface contract change | `do-it-interface-drill` skill — mandatory trigger; `hooks/verification-gate.sh` — requires the inline-review marker to name `interface` / `contract` / `schema` / `api` |
| `dim_needs_tdd` | prompt names behaviour-modifying intent (`implement`, `实现`, `add feature`, `fix bug`, `修复 bug`, `添加功能`) **and** also names a code object (path / extension / fenced snippet / technical noun) | `do-it-tdd` skill — mandatory trigger when set |
| `dim_needs_review_loop` | tier is Heavy OR `dim_breaks_interface=1` | `do-it-review-loop` skill — mandatory trigger; `hooks/verification-gate.sh` — requires a `review-loop` / `review-quick` / `review-deep` / `review-adversarial` mention in the recent transcript before a "done" claim passes |

DIM values live in per-session state. Two consumption paths:

- **Hook layer (program path).** Hooks read via `do_it_session_state_get "$SESSION_ID" <key>` from `hooks/lib/common.sh`, which resolves the state path through the documented 5-level env-var search (`CLAUDE_PLUGIN_DATA` → `DO_IT_HOOK_DATA` → `CODEX_HOME/do-it-data` → repo `.do-it/runtime/` → `${TMPDIR}/do-it-sessions`). Never hard-code a path.
- **Agent layer (prose path).** Agents do not query state at runtime; they judge mandatory triggers from prompt content using the rules in `do-it-router` § Reading dimensions. Hook-emitted system-reminders carry the gate-relevant signals (e.g. interface attestation requirement, review-loop trace requirement). Each SKILL's mandatory trigger has an explicit Light-tier escape clause documented at `do-it-router` § Mandatory-trigger escape clauses.

Missing state degrades to tier-only behavior — hooks never block on absence.

Compatibility: tier is preserved (Light / Standard / Heavy) as the derived
classifier; all existing skill triggers continue to key off it. Light
classifications skip dimension evaluation entirely (every dim stays 0) so the
discussion / mechanical-edit fast path keeps zero overhead.

Dimensions live under per-session state at `<session_dir>/state.json` (jq
present) or `state.kv` (jq absent). DEBUG mode (`DO_IT_DEBUG=1`) writes router
traces to stderr through `do_it_debug`; it does not emit routine router
`additionalContext`.

### Skill Combinations By Dimension (Reference Only)

The router does NOT prescribe a fixed combination — these are illustrative
expectations downstream skills may satisfy independently:

- `tier=Light`: silent router, no skill recommendation
- `tier=Standard, touches_code=1, needs_tdd=0`: grill only on uncertainty /
  explicit / long; local review by default, one focused reviewer only for named
  non-local risk
- `tier=Standard, needs_tdd=1`: grill + planning (light) + tdd + targeted review
- `tier=Heavy, breaks_interface=1`: grill + planning + interface-drill + adversarial review-loop
- `tier=Heavy, crosses_packages=1`: grill + planning + architecture-scan + adversarial review-loop

These combinations are not enforced in code. Each skill's own `description`
and decision-tree owns the actual trigger semantics; dimensions just give
those triggers a cheaper-than-keyword input.

## Skill Index Loading

The router is state-only: it classifies the prompt and writes routing state, but
does not emit routine Standard/Heavy banners. Agents load `skills/_index.md`
on-demand when they need to pick a skill. The generated index is a compact
bucketed map (~3 KB) of every installed do-it skill grouped into:

- 主线 (router 推荐) — front-line skills routed by tier
- 按需触发 — domain / risk-specific skills loaded only when needed
- Handbook & 维护 — durable infrastructure skills

The agent loads the index on-demand via the Skill tool when it actually
needs to pick a skill, instead of paying the catalogue cost on every prompt.
The index is a generated artifact: `node scripts/build-skills-index.mjs`
rebuilds it from each `skills/do-it/<name>/SKILL.md` frontmatter and
`manifest.json`.

## 0.5.1 Routing Changes

- **Heavy promotion still requires ≥2 heavy signals.** A single mention of
  `schema` / `migration` / `api change` / `breaking change` no longer pulls
  the full Heavy ceremony in by itself; it caps at Standard. Two or more
  heavy signals escalate to Heavy.
- **Question / discussion mode is automatic Light and no longer sticky.** When the prompt ends
  with `?` / `？` / `吗` / `呢`, or matches phrases like `你觉得`,
  `怎么看`, `as how do`, `should i`, `whether to`, the router classifies
  Light, suppresses the grill template, and bypasses the verification gate for
  that turn only unless the prompt explicitly asks to grill / re-grill. The
  next non-question prompt restores normal gate and grill checks through
  `last_prompt_kind=work`.
- **Same-session grill de-duplication still applies to real grills.** Once `do-it-grill` has fired in a
  session, subsequent prompts will not re-emit the template unless the user
  explicitly says `重新 grill` / `re-grill` / `再 pressure-test` /
  `重新审视`, or escapes the workflow.
- **Standard grill is decision-triggered.** Intent verbs such as `implement`,
  `fix`, or `修改` promote to Standard but no longer trigger grill by
  themselves. Standard auto-grills only on uncertainty words, explicit grill
  requests, or long input that also has a planning/topical hint.
- **Long input requires length plus topic.** A long paste without a
  requirement/plan/spec hint does not trigger grill by length alone.
- **Plan gates are Heavy or explicit.** Standard source edits may proceed with
  an inline modification map. `.do-it/plans/*` and source-write plan gates are
  hard requirements only for Heavy work or explicit durable-plan requests.
- **Single CJK intent verbs no longer trigger.** `做`, `改`, `加`, `写`,
  `修`, `审`, `搭` (1-character) are gone from the default intent verbs;
  use specific 2-character compounds (`修改`, `修复`, `添加`, …) for clear
  classification.
- **ASCII word-boundary matching.** `fix` no longer matches `prefix`;
  `add` no longer matches `address`. Drop the trailing-space hacks from
  any project-level `keywords.local.sh` overrides — they are no longer
  required.

## Core Skills

- `do-it-router`: classifies the work into Light, Standard, or Heavy, names
  the minimum useful agent set, forecasts likely failure modes, and keeps the
  parent agent responsible for scope.
- `do-it-planning`: turns intent, current repo truth, non-goals, acceptance
  criteria, failure-mode forecast, path map, readiness target, and verification
  expectations into a durable handoff.
- `do-it-slicing`: breaks a plan into tracer-bullet vertical slices that can be
  implemented, reviewed, and verified independently.
- `do-it-grill`: stress-tests premises, plans, review responses, and closeout
  claims. It can require or challenge `do-it-review-loop` output, but it is not
  the owner for delivered diff or QA review.
- `do-it-brainstorm`: explores requirement shape before grill converges. It
  runs product and architecture core lenses by default, maps product boundary,
  core goal, option tradeoffs, architecture foundation, extension modules, and
  `Must Resolve In Grill` items, then hands convergence to `do-it-grill`.
- `do-it-context`: maintains the project's canonical `.do-it/CONTEXT.md` —
  one-line definitions for terms, invariants, and relationships that
  downstream skills (grill, planning, review) read before debating semantics.
  Its § Domain Glossary Mode stabilizes domain terms and catches contradictions
  between user language, docs, and code.
- `do-it-grill` § Grill Log Artifact: writes the per-task `.do-it/grill/<task>.md`
  artifact (`kind`, falsifier, status, evidence). Read by `do-it-planning` and
  `do-it-verification-gate` so unresolved facts or execution-blocking
  decisions block closeout.
- `do-it-architecture-scan`: checks ownership, dependency direction, coupling,
  migration path, rollout risk, and failure isolation.
- `do-it-interface-drill`: checks API, type, schema, CLI, docs, protocol, and
  adapter contracts at the producer/consumer boundary.
- `do-it-tdd`, `do-it-debugging`, `do-it-review-loop`,
  `do-it-fix-loop`, and `do-it-verification-gate`: focused quality loops used
  when behavior, root cause, review findings, or completion claims require
  extra discipline.
- `do-it-subagent-orchestration`: constrains delegated agents to explicit
  slices, ownership boundaries, and return schemas.
- `do-it-worktree-isolation` and `do-it-branch-closeout`: optional support for
  isolated work and final integration.

The do-it roles absorb the useful discipline from the previous workflow family:
mandatory truth checks, failure-mode forecasting, explicit planning, isolated
delegation, adversarial review, prevention-backed fix loops, and
evidence-first closeout. The installed names and public routing are
do-it-native.

## Three Tiers

> Tier is one axis. The router also writes 5 orthogonal `dim_*` flags into session state (see [Orthogonal Dimensions](#orthogonal-dimensions) above) — downstream skills may read either tier, dimensions, or both. Tier remains authoritative for the default flows below; dimensions narrow the *intensity* (e.g. review-quick vs review-adversarial — see `do-it-review-loop`).

| Tier | Use When | Default Skill Flow | Subagent Behavior | Closeout |
|---|---|---|---|---|
| `Light` | Mechanical edit, small docs update, bounded command/check, obvious single-file fix | `do-it-router -> local edit/check -> do-it-verification-gate when files changed` | Usually no subagent. If delegated, assign a Light slice with one narrow question or edit. | Local diff review plus targeted verification. |
| `Standard` | Ordinary non-trivial engineering, unclear ownership, normal docs policy changes, bounded bugfix/refactor | `do-it-router -> inline modification map or light plan -> execute -> do-it-verification-gate`; add `do-it-grill`, `do-it-tdd`, `do-it-debugging`, `do-it-subagent-orchestration`, `do-it-review-loop`, and `do-it-fix-loop` only when risk justifies them | Default delegated slice. The child does not inherit the parent's Heavy route. | Local or one focused review lens when risk justifies it, fix-loop for findings, fresh evidence before claims. |
| `Heavy` | Wave, phase, public identity shift, architecture or interface boundary, release/gate, cross-module policy, high-risk failure modes | `do-it-router -> do-it-planning -> do-it-grill -> do-it-slicing -> targeted interface/architecture/domain drills -> do-it-subagent-orchestration -> execution -> right-sized review-loop -> do-it-fix-loop -> do-it-verification-gate -> do-it-branch-closeout when merging` | Parent-owned by default. A child may run Heavy only if the parent explicitly assigns a Heavy slice. | Re-review after fixes, resolved or explicitly deferred important findings, status only from verified facts. |

## Task Class And Tier

Tier describes rigor. Task class describes delivery shape:

- `task`: one bounded outcome or slice, usually Light or Standard unless risk
  forces Heavy.
- `wave`: multiple related task slices with an integration point, usually
  parent-owned Heavy.
- `phase`: durable program, gate, release, or broad policy shift, Heavy by
  default.

Use both labels when they clarify work: for example `tier: Standard,
class: task` for a delegated slice, or `tier: Heavy, class: wave` for the parent
coordinator. Do not use `wave` or `phase` as substitutes for `Standard` or
`Heavy`.

`do-it-worktree-isolation` and `do-it-skill-authoring` are routed by need rather
than by tier:

- use `do-it-worktree-isolation` when current workspace state, parallel lanes,
  or rollback risk requires isolation;
- use `do-it-skill-authoring` when creating or updating skills.

Vocabulary work (overloaded terms, product concepts, business rules) routes to
`do-it-context` § Domain Glossary Mode; visual comparison routes to
`do-it-planning` § Visual Aids.

## Planning Rules

Every implementation-ready handoff should name:

- task class and route
- goal and non-goals
- write ownership and restricted paths
- discovered facts that matter
- success criteria
- failure-mode forecast
- path map or `not applicable` reason
- readiness target (`fixture-ready`, `live-event-ready`, `operator-ready`, `docs-truth-ready`, or `install-ready`)
- truth plane (`source-repo`, `task-worktree`, `integration-worktree`,
  `temp-install`, `live-codex`, `live-claude`, `package-artifact`,
  `host-behavior`, or `external-blocked`)
- Evidence Ledger rows for Heavy, release/install, multi-agent, or explicit
  durable-plan work
- implementation mode
- review stack
- final-branch/worktree verification commands or evidence checks
- whether local notes belong in the private `.do-it/` workspace

Use the smallest planning stack that removes real risk:

- `plan-challenger` for ambiguous scope, public policy, or acceptance risk
- `architect-reviewer` for architecture scan
- `domain-language-reviewer` for overloaded terms, canonical-language drift,
  or domain-model contradictions
- `typescript-pro`, `sql-pro`, `react-specialist`, or
  `documentation-engineer` for interface drill in their domains
- `red-team-reviewer` for state, persistence, security, concurrency, retry,
  replay, or partial-failure risk
- `skill-quality-reviewer` for skill trigger quality, tier behavior, stop
  conditions, and cross-skill consistency
- `install-release-reviewer` for package, manifest, installer, doctor, and
  release readiness

## Implementation Modes

### Mode A: Local / Mechanical

Use for `Light` work where the path and success criteria are obvious. The
parent agent performs the map locally, edits only the owned files, and verifies
the specific requirement.

### Mode B: Focused Delivery Loop

Default for `Standard` work:

1. Make a modification map, failure-mode forecast, and proof path map before production edits.
2. If comments will be authored or changed, load `do-it-comments-discipline`
   before editing; `comments-lint` is advisory backup, not the first gate.
3. Write or tighten the smallest failing test when behavior is changed.
4. Verify RED for the expected reason when tests apply.
5. Implement the minimal GREEN change.
6. Verify GREEN or run the equivalent docs/tooling check.
7. Refactor only after verification.
8. Run local review or one focused review lens only when the risk justifies it,
   then fix findings before closeout. Use `do-it-grill` when the plan, review
   response, or closeout claim needs pressure-testing.

### Mode C: Split RED / GREEN

Use when a behavior contract is risky enough that tests should be authored by a
separate agent before implementation:

1. `code-mapper` maps ownership and branch points.
2. `tdd-red-writer` edits tests only.
3. Parent verifies RED.
4. Implementer owns GREEN.
5. Parent verifies GREEN.
6. `do-it-review-loop` reviews the delivered surface; `do-it-grill` challenges
   the plan or closeout claim when needed.

### Mode D: Heavy Drill

Use for `Heavy` work:

1. Freeze route, non-goals, acceptance criteria, readiness target, and final evidence with `do-it-planning`.
2. Use `do-it-grill` to challenge the decision tree, failure-mode forecast, and path map before implementation.
3. Use `do-it-slicing` to define lanes and shared-file ownership.
4. Run `do-it-interface-drill`, `do-it-architecture-scan`, and
   `do-it-context` § Domain Glossary Mode only where their evidence will change the plan.
5. Delegate Standard slices unless a child is explicitly assigned Heavy work.
6. Run expanded review, fix-loop, re-review, and branch closeout.

## Review Stack Rules

- Light tasks and docs-only edits stay local when the diff is obvious and low
  risk.
- Standard tasks use local review by default; add at most one focused reviewer
  when a concrete failure mode is not locally reviewable.
- Every non-trivial review starts with decision and proof-path coverage:
  request/plan/grill decisions -> producer -> contract -> transport/client ->
  consumer/surface -> verification. Missing coverage, unwired implementation,
  unused delivered surface, hidden truth-plane drift, or synthetic proof is a
  review finding when it can make the work wrong, unused, or unverifiable.
- Heavy release, workflow, or policy work defaults to two lenses: one
  skill/policy quality lens and one install/release readiness lens.
- Add more than two lenses only for migration, security, broad public
  interfaces, state/persistence, or phase-scale architecture risk.
- A pre-implementation interface drill can count toward Heavy review only when
  a read-only reviewer rechecks the delivered diff against the chosen contract
  and returns the review schema.
- Release or install work adds `install-release-reviewer`.
- Skill or workflow-bundle work adds `skill-quality-reviewer`.
- Add `spec-compliance-reviewer` when the work is tied to a task card, plan,
  acceptance contract, or explicit write-ownership boundary.
- Heavy review counts only review assignments that were explicitly prompted as
  `tier: Heavy`. Standard reviewer output can inform the parent, but does not
  satisfy a Heavy review gate by itself.
- Prefer read-only reviewer configs for review lenses. Writer specialists such
  as implementation, documentation, test, React, or TypeScript agents may
  support drills or fixes, but they do not replace an independent read-only
  review lens unless the parent explicitly scopes them as read-only and the
  return report satisfies the review schema.

## Documentation Strategy

- Mixed code/docs tasks are code-first: implement behavior, verify it, review
  the diff, then update docs to match the proven behavior.
- Docs-only work usually stays local. Add one `documentation-engineer` only
  when the documentation surface is broad enough that a second writer/reviewer
  materially reduces drift.
- Do not run parallel documentation review lanes for ordinary docs cleanup.
  Documentation must lag reality, not lead it.

## Token Discipline

- Do not spawn agents for work the parent can verify faster and more accurately
  with local reads.
- Give delegated agents exact scope, files, questions, and stop conditions.
- Prefer one specific reviewer over several overlapping reviewers.
- Keep implementation workers out of shared files unless write ownership is
  explicit.
- The parent agent owns integration, final diff review, and final claims.

## Subagent Protocol

Subagents also run do-it. Delegation changes who performs a slice; it does not
remove the workflow gates.

Every subagent prompt should include:

- the assigned tier: Light, Standard, or explicitly Heavy;
- the route: implementation slice, review lens, architecture drill, interface
  drill, or support task;
- the scope and non-goals;
- write ownership and restricted paths;
- the current facts it may rely on and the facts it must verify itself;
- the failure-mode forecast, path map, and readiness target for the slice;
- the truth plane and initial lane status for the slice;
- the integrity stance and output budget from `do-it-subagent-orchestration`;
- the expected loop: inspect, plan, execute or review, verify when applicable,
  and report;
- a stop condition for `NEEDS_CONTEXT`, `BLOCKED`, or `STILL_OPEN`;
- the required return shape: changed files or findings, commands or inspections
  run, evidence, facts verified, assumptions, residual risk, and `NOT_CHECKED`.

Delegated implementation defaults to `Standard`. A subagent must not run the
full parent Heavy flow just because the parent is handling a Heavy phase. If it
discovers unassigned architecture, interface, security, or acceptance risk that
would require Heavy work, it stops with:

```text
BLOCKED: requires heavy escalation
Evidence:
- ...
Suggested next parent decision:
- ...
```

Implementation subagents must not revert peer edits, must not create commits
unless explicitly delegated, and must report how their slice should be
integrated. Review subagents stay read-only; fixes belong in a separate
delivery or fix-loop slice.

Use `.do-it/` only for private local planning notes or scratch artifacts. Do not
install it, publish it, or cite it as canonical truth unless the user
explicitly promotes a note into tracked docs.

## Closeout Gate

Before claiming completion:

1. Re-read the request and write-ownership boundary.
2. Inspect the diff for restricted-file edits.
3. Run the relevant verification commands or grep checks.
4. Confirm final-branch/current-worktree evidence supports the exact readiness claim.
5. Confirm evidence proves the exact truth plane being claimed; source,
   package, temp install, live install, and host behavior are separate claims.
6. Summarize any Evidence Ledger rows and keep `NOT_VERIFIED`, `BLOCKED`, or
   `DEFERRED_BY_USER` visible.
7. Confirm subagent lane states are `integrated` or reported as residual risk.
8. Confirm stale terminology and adapter gaps are either removed or reported.
9. Confirm Blocking/Important fixes include prevention hooks.
10. Confirm review findings are fixed, deferred with rationale, or explicitly
   outside scope.
11. Confirm any in-scope Blocking or Important issue discovered during review was
   fixed now, unless the user explicitly confirmed deferral or the fix crossed
   an unassigned boundary.
12. State which brainstorm, grill, subagent, review, and verification steps were
   used or skipped, with the reason when the route made them relevant.
