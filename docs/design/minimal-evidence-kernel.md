# Minimal Evidence-Carrying Execution Kernel

Architecture freeze for the upgrade from do-it `0.16.0` to a smaller,
recoverable, measurable, personalizable execution kernel.

This document is **S00**. It records current repository truth and the target
decisions that later cards must not silently rewrite. It does not change
runtime behavior.

**Baseline:** `tdwhere123/do-it@8e85add081b2793fb39529e1a57a36155fe03847`
(`0.16.0`). Snapshot artifacts: `evals/behavior/baselines/0.16.0-repo.json`
and `tests/fixtures/baseline/`.

**Product sentence (target):** do-it makes agent work evidence-carrying —
every completion claim traces to a goal, settled decisions, a boundary,
acceptance, and fresh evidence on this worktree.

Labels used below:

- **Current** — true of this baseline commit.
- **Target** — a settled architecture decision. Not yet implemented unless
  marked **already true**.

The full derivation lives in
`.do-it/plans/do-it-minimal-kernel-upgrade/MASTER_PLAN.md`. File ownership
and waves live in `ORCHESTRATION.yaml`. This file is the in-repo invariant
surface.

---

## 1. Current truth (0.16.0)

### 1.1 Inventory

| Kind | Count | Names / notes |
| --- | ---: | --- |
| Runnable skills | 11 | 7 mainline + 1 on-demand + 3 maintenance |
| Generated discovery | 1 | `do-it-skills-index` |
| Agents | 10 | see `agents/*.toml` |
| Core rules | 8 | `r-route` … `r-recovery` in `hooks/data/execution-failure-modes.tsv` |
| Quality families | 16 | `hooks/data/quality-families.tsv` |
| Routing golden rows | 51 | `tests/fixtures/routing-golden.tsv` |

Mainline skills (`scripts/skill-tiers.mjs` `CORE_SKILLS`):
`do-it-core`, `do-it-router`, `do-it-code-quality`, `do-it-review`,
`do-it-decide`, `do-it-verify`, `do-it-architecture`.

Extended: `do-it-retrospective` (on-demand); `do-it-handbook`,
`do-it-context`, `do-it-skill-authoring` (maintenance).

There is **no** `do-it-adaptive` skill. There is **no** durable Task Contract
schema, evidence ledger, or worktree fingerprint primitive.

### 1.2 Size and injection (current)

| Path | Bytes | Lines |
| --- | ---: | ---: |
| `hooks/router.sh` | 29941 | 593 |
| `hooks/lib/common.sh` | 54388 | 1457 |
| `hooks/verification-gate.sh` | 9661 | 240 |
| `hooks/grill-prompt.sh` | 8978 | 198 |
| `hooks/write-quality-lint.sh` | 8529 | — |
| `hooks/behavior-feedback.sh` | 8017 | — |
| `skills/do-it/do-it-core/SKILL.md` | 4430 | 73 |
| `skills/do-it/do-it-decide/SKILL.md` | 2932 | 63 |
| `skills/do-it/do-it-verify/SKILL.md` | 2120 | 52 |
| `skills/do-it/do-it-code-quality/SKILL.md` | 6153 | 108 |
| `skills/do-it/do-it-architecture/SKILL.md` | 6475 | 109 |

SHA-256 pins for the lexical classifier and its golden are in
`tests/fixtures/baseline/source-sha256.txt`.

`prompt-submit.sh` serializes `router.sh` then `grill-prompt.sh` behind one
UserPromptSubmit command. SessionStart (Cursor) injects a compact “do-it is
active…” reminder (`tests/fixtures/baseline/session-start-stdout.txt`).

On this baseline, a Standard work prompt inlines Core rule sentences (auto
advisory mode). Light prompts are silent. Heavy action-shaped
interface/migration/security prompts emit one `skill://do-it-architecture`
pointer. Ordinary Heavy publish/release does not emit that pointer; Heavy
still triggers grill. Representative stdout + session state:
`tests/fixtures/baseline/router-grill-snapshot.jsonl`.

### 1.3 Session keys (current)

Written by hooks on this baseline:

| Key | Writer | Role |
| --- | --- | --- |
| `tier`, `tier_history` | `router.sh` | advisory Light/Standard/Heavy |
| `last_prompt_kind` | `router.sh` | `question` / `work` |
| `no_write_boundary` | `router.sh` | sticky inspect-only |
| `durable_plan_required`, `durable_plan_seen` | `router.sh` | Heavy plan nudge |
| `dim_touches_code`, `dim_crosses_packages`, `dim_breaks_interface`, `dim_needs_tdd`, `dim_needs_review_loop` | `router.sh` | intensity flags |
| `dim_brownfield`, `port_intent` | `router.sh` | extra classifiers |
| `grilled`, `plan_nudged`, `brownfield_nudged` | `grill-prompt.sh` | once-per-session reminders |
| `user_turn` | quality / router | dedup |
| `hook_invocations` | several | diagnostics |
| `subagent_stance_seen` | `subagent-stance.sh` | once-per-session |
| `behavior_feedback_last_hash` | `behavior-feedback.sh` | default-off feedback |

**Target:** retire `tier`, `dim_*`, `grilled`, `durable_plan_*`,
`plan_nudged`, `dim_brownfield`, `brownfield_nudged`, `port_intent` after
behavior non-inferiority (S16). Keep `no_write_boundary`, turn/dedup tokens,
injection hashes, and hook diagnostics.

### 1.4 Host wiring (current)

One workflow kernel; six adapters. Depth is honest, not copied from Claude.

| Host | Prompt classify | Write lint | Done claim | Notes |
| --- | --- | --- | --- | --- |
| Claude | `UserPromptSubmit` → `prompt-submit.sh` | `PostToolUse` Edit\|Write\|MultiEdit\|NotebookEdit | `Stop` | plus default-off narrow `PreToolUse` external-actions profile |
| Codex | same scripts via `install/codex-hooks.json` | same | `Stop` | plugin cannot veto tools |
| Cursor | `beforeSubmitPrompt` via `run-hook.cmd` | `postToolUse` StrReplace\|Write\|EditNotebook | `stop` | `sessionStart` bootstrap |
| OpenCode | `chat.message` TS bridge | `tool.execute.after` | `session.idle` soft | independent npm package |
| Pi | root `before_agent_start` | root `tool_result` edit/write | `agent_end` + next-turn `agent_settled` | independent npm package |
| Kimi | `UserPromptSubmit` (`prompt-submit` + `behavior-feedback`) | `PostToolUse` Edit\|Write only | `Stop` | no custom subagents; `subagent-stance` unwired |

`hooks/run-hook.cmd` allowlist: `session-start`, `behavior-feedback`,
`prompt-submit`, `router`, `grill-prompt`, `subagent-stance`,
`write-quality-lint`, `verification-gate`, `anti-patterns-lint`,
`comments-lint`. Source of truth: `scripts/lib/hook-manifest.mjs`.

No host currently records edit/command observations as an evidence ledger.
`verification-gate.sh` looks for completion language vs this-turn edit plus
an explicit `NOT_VERIFIED`; it does not know acceptance items or freshness
relative to the last edit on this worktree.

### 1.5 What 0.16 already does well (keep)

Already true, must survive the upgrade:

- Single Core voice: TSV ↔ `do-it-core` ↔ hook quotes ↔ bridges
  (`validate:core-consistency`).
- Source vs generated split: edit `skills/do-it/`, `hooks/`, `agents/`;
  rebuild `plugins/*`, `index.json`, dist.
- Fail-open hooks: misconfiguration must not crash ordinary work.
- Action boundary: no-write sticky state; external/destructive confirm-first.
- Quality registry: deterministic patterns in hooks, judgment in skills.
- Review two-axis: Standards vs Spec kept independent.
- Verify honesty vocabulary: `NOT_VERIFIED`, this worktree, fresh evidence
  (discipline exists; evidence *model* does not).
- Honest six-host capability matrix.
- User skip / advisory posture: hooks are not a universal permission gate.

### 1.6 Gaps this upgrade is for

Current (observed):

- Task objects are not first-class. `.do-it/plans/` exists, but session
  state describes workflow posture (`tier`, `grilled`), not goal / decisions
  / boundary / acceptance.
- `router.sh` reconstructs task semantics from natural language (~30 KB).
- Grill is session one-shot (`grilled=1`), not task-aware.
- Verify has a reminder, not an acceptance→evidence map.
- Retrospective records explicit complaints, not objective workflow events.
- Tests prove mechanics (hooks, installer, validators). They do not prove
  that installing do-it improves model behavior vs vanilla.

---

## 2. Target decisions (settled)

These are architecture decisions, not Wave 0 implementation.

### D1. Minimal execution kernel, not a workflow engine

Do not copy brainstorm → spec → plan → tasks → implement → review → archive.
Keep meaning-first skill selection. Extract the task contract and evidence
out of model memory.

### D2. Fixed core skills + variable adaptive overlay

Fixed (versioned) skills remain: core, router, decide, code-quality,
architecture, review, verify. Add a **fixed interpreter** `do-it-adaptive`.
What actually changes per user/project is a short, governed delta profile.
Handbook / context / retrospective / skill-authoring stay infrastructure,
not per-turn capabilities.

### D3. Public skill names stay in v0.17

Do not rename `do-it-code-quality` to `do-it-build` in this upgrade line.
Compatibility first.

### D4. Two-layer task state

- Ordinary tasks: no file; execute from context.
- Durable tasks: `.do-it/plans/<task>.md` is an execution contract, not a
  construction log.
- Runtime stores a pointer, events, and evidence — not a second copy of the
  plan.

### D5. Runtime owns observables only

Runtime may decide: no-write, tool/edit/stop facts, command exit, HEAD /
worktree fingerprint, whether evidence is after the last observed change,
whether a profile exists and is well-formed.

Runtime must not decide: whether a prompt “is architecture”, whether TDD is
required, how many reviewers, or whether a green command proves an
acceptance item.

### D6. Subagents are expensive resolvers

Default 0. At most one fresh-context second look, and only when independent
evidence could change a costly decision, the slice is narrow and verifiable,
or the current context is too anchored to audit itself. Parallel waves only
for disjoint write scopes or explicit user request.

### D7. Evaluate before deleting the lexical router/grill

Migration: `legacy → shadow → thin → remove`. Deletion is gated on behavior
non-inferiority, not on philosophy.

---

## 3. Information planes (target)

| Plane | Owns | Must not store |
| --- | --- | --- |
| Fixed policy | Universal algorithms and honesty/boundary rules | Personality, project facts, task state |
| Adaptive overlay | Deltas vs fixed policy | Copies of Core, raw history, architecture facts |
| Project truth | Terms, stable invariants, architecture facts | Task progress, personal preference |
| Task contract | Goal, settled decisions, boundary, acceptance | Coding dogma, full brainstorm, live progress |
| Runtime state | Active pointer, session flags, observation epoch, injection hashes | A second copy of task semantics |
| Evidence ledger | Observed commands, status, fingerprint, summaries | “This proves A1” |
| Learning ledger | Observations, candidates, counterexamples, eval results | Authority to write Core |

Hot path budget (target):

| Item | Budget |
| --- | --- |
| Session kernel injection | ≤ 100 tokens, once per session |
| Active task pointer | ≤ 20 tokens, once per session or on change |
| Adaptive profile | ≤ 160 tokens, ≤ 8 bullets |
| Standard recurring prompt injection | 0 when nothing hits |
| Automatic subagent | 0; at most 1 targeted second look |
| Durable task contract | usually ≤ 100 lines; not a correctness metric |

Live kernel injection is 125 tokens (`ceil(499/4)` from 499 chars); the
≤100-token row remains the target, not a Thin veto. Beating 0.16
injection medians is **not** a thin-default veto. Live legacy Light is
bootstrap-only; thin always sends the session kernel on turn 1. Cost
face still records `injected_tokens`. Promotion compares behavior (hard
gates, honesty, ceremony, subagents) to live legacy.

---

## 4. Invariants (I1–I12)

Each invariant is **target**. Status records whether 0.16 already satisfies
it.

### I1. Autonomy in reasoning, determinism in state

The model chooses methods, skills, seams, and implementation. Runtime
records events, boundaries, and evidence freshness.

- **Current:** model is already autonomous; runtime records tier/dimensions,
  not task/evidence.
- **Target:** runtime records observables; model keeps semantic choice.

### I2. State ≠ plan

A Task Contract describes the confirmed world and completion conditions. It
does not store pipeline progress. Progress comes from git, runtime events,
and evidence.

- **Current:** plans are free-form markdown; grill/`durable_plan_*` treat
  “a `.md` exists” as progress.
- **Target:** four-core contract; no progress checkboxes.

### I3. Acceptance ≠ verification method

`A1: user can resume after restart` is acceptance. `npm test` is one proof
method. Proof methods may change; acceptance should not drift to match them.

- **Current:** verify skill talks about fresh checks; contracts do not bind
  A-IDs to evidence.
- **Target:** acceptance items are stable; proof is mapped at closeout.

### I4. Observed evidence ≠ proven claim

Runtime may say “command X exited 0 on worktree W”. The model still has to
explain why that covers an acceptance item.

- **Current:** gate treats “edited + done language + no NOT_VERIFIED” as the
  trigger. It does not store observations.
- **Target:** ledger stores candidates; Verify maps them; no auto-proof.

### I5. Settled decision protection

User-confirmed, evidence-determined, or explicitly chosen decisions stay
closed without invalidating evidence.

- **Current:** no first-class decision records; later planner/reviewer can
  reopen anything still in context.
- **Target:** provenance `[user]` / `[evidence]` / `[choice]` / `[assumption]`.

### I6. Follow causality, not adjacency

Allowed edits follow the causal cone, not “nearby and convenient”.

- **Current:** `r-scope` states the rule; there is no shared causal-change
  algorithm across Build/Architecture.
- **Target:** one Trace/Locate/Change/Stress/Prove/Settle loop (S04).

### I7. One semantic authority per fact and jurisdiction

Not “one physical writer”. Each fact has one meaning authority. Boundaries
may enforce, projections may derive, recovery may repair — none of them
re-own the source fact.

- **Current:** architecture skill has eight lenses; authority placement is
  easy to miss in Build.
- **Target:** Architecture five decision surfaces + authority quartet (S06).

### I8. Structure must earn itself

Preparatory refactor only when the current structure makes a correct change
impossible to keep local, durable, and provable.

- **Current:** code-quality skill warns against speculative seams; no named
  patch-or-prepare gate.
- **Target:** explicit gate in the Build kernel (S04).

### I9. Subagents are expensive resolvers

Automatic delegation must name the missing independent evidence or
viewpoint. “Heavy” is not a dispatch reason.

- **Current:** stance hook exists; skills still mention workers; inventory
  is 10 agents.
- **Target:** default 0 / max 1 in kernel + agent contracts (S17). v0.17
  keeps the 10-agent inventory unless S17/S19 evidence says otherwise.

### I10. Adaptive stores delta only

Adaptive must not copy Core, the task contract, CONTEXT, or the handbook.
A core upgrade must not be polluted by personal files.

- **Current:** no adaptive surface.
- **Target:** S12 profile schema + validator; missing profile → 0 tokens.

### I11. No automatic Core mutation

Self-evolution may create candidates. Activating a personal rule needs
governance. Entering Core always needs maintainer review and cross-scenario
evidence.

- **Current:** complaint recorder is default-off; it does not rewrite skills.
- **Target:** observation → candidate → shadow → active → stable/retired
  (S13–S14). Never auto-write Core.

### I12. Every durable rule needs a failure mode and an eval

A rule that cannot say what it prevents, or how its effect is observed, does
not belong on the hot path.

- **Current:** Core TSV has failure modes; skill prose and router clauses
  often do not. No behavior eval harness.
- **Target:** S01 harness + S17 contract anchors; lexical router retired
  only after eval (S16).

---

## 5. Task contract (target shape)

Persist a contract only when at least one of: high cost of a wrong
decision; another session/agent must continue; several settled decisions
must survive; there is a dependency order or independent delivery units;
acceptance is easy to lose in implementation; the user asked for a written
plan. Otherwise finish in chat.

Required headings: `Goal`, `Decisions`, `Boundary`, `Acceptance`. Optional
earned extensions: `Change Map`, `Units`, `Open`, `Rejected`. Empty
sections and `N/A` filler are invalid.

Runtime pointer: `.do-it/runtime/active-task` holds one repo-relative path.
It is not a second task document. Clear it on close/merge/drop.

Schema and fixtures belong to S02 (`schemas/task-contract-v1.md` in the
plan package is the draft).

---

## 6. Migration line

| Version | Default runtime | Main delivery |
| --- | --- | --- |
| 0.17 | Legacy | Decide/Build/Architecture/Review/Verify v2 + eval baseline + Task Contract opt-in |
| 0.18 | Evidence observe; Adaptive observe | ledgers, profile/candidates, host observers |
| 0.19 | Thin default; legacy fallback | kernel-context; router shadow; grill stops injecting |
| 1.0 | Thin only | delete legacy classifier/flags after evidence |

**This worktree** now defaults **thin** ahead of a 0.19 tag (S16 Phase A).
Package version remains `0.16.0`. Rollback: `DO_IT_ROUTER_MODE=legacy`.
The ≤100-token session kernel budget remains the target; live kernel
injection is 125 tokens (`ceil(499/4)` from 499 chars). S16 Phase B
(delete the router) is not authorized.

Compatibility (target, binding):

- v0.17 does not rename the existing 11 public skills; it adds
  `do-it-adaptive`.
- `router.sh` / `grill-prompt.sh` stay as compatible entry points until
  0.19/1.0 gates pass.
- Existing `.do-it/plans/*.md` are not auto-rewritten.
- `.do-it/brainstorm/` and `.do-it/grill/` stop being bootstrapped; user
  content is not auto-deleted.
- Rollback: `DO_IT_ROUTER_MODE=legacy` until 1.0 deletion.
- New observers fail open. Malformed profile → no injection + one bounded
  diagnostic.

Wave ownership (do not start a later wave’s default-runtime switch early):

0. Freeze + eval harness (S00–S01) — this document.
1. Policy + Task Contract; those cards shipped with default runtime still
   legacy (S02–S08). This worktree later defaulted thin ahead of a 0.19 tag.
2. Evidence runtime in `observe` (S09–S11).
3. Adaptive + agent-cost validators (S12–S14, S17).
4. Thin kernel, legacy router in shadow (S15).
5. Manifest/docs/generated, dogfood gates, then gated retirement (S18, S19, S16).

---

## 7. What this freeze does not do

S00 does not:

- rewrite any skill;
- change router, grill, or hook emission;
- add a manifest entry;
- hand-edit `plugins/*`, `dist/*`, or `index.json`;
- run or claim a model behavior A/B (that is S01/S19).

Unrelated dirty files on the parent worktree (for example a local
`.gitignore` edit) are outside this freeze and must not be mixed into the
S00 commit.

---

## 8. Verification of this freeze

Exact commands, exit codes, commit, and worktree are recorded in
`evals/behavior/baselines/0.16.0-repo.json`.

Required checks (S00 card):

- `npm test`
- `npm run lint`
- `npm run smoke:package`
- `git diff --check`

If the 0.16 baseline itself is red, record and fix that failure on its own;
do not fold it into a later upgrade wave.
