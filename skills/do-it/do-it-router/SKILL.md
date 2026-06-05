---
name: do-it-router
description: "Use when any non-trivial repo task needs Light, Standard, or Heavy tier selection, failure-mode forecast, path map, and the minimum useful do-it workflow before action."
---

# Do-It Router

## Purpose

Use this as the front door for do-it-native work. It selects the smallest useful workflow, keeps current truth ahead of old plans, and routes to the planning or design skill that matches the risk.

Upstream workflows are source material, not public names. Use do-it terms in handoffs and reports.

## Mandatory Activation

For any non-trivial repository task, the parent agent MUST load this router before
planning, editing, delegating, reviewing, verifying, committing, or claiming
completion.

This includes planning, slicing, implementation, debugging, review, fix-loop,
verification, branch closeout, wave/phase work, task-card work, docs-truth work,
interface design, architecture review, and multi-agent work.

The router may be skipped only for truly trivial answers or pure status questions
that do not plan, edit, review, verify, or close work. When skipped, state the
reason briefly.

After loading the router, announce the selected do-it skills and tier before
continuing.

## First Move

Before routing:

1. Read local instructions, user constraints, and write ownership.
2. Read `.do-it/runtime/pointer` if it exists — it names the active task slug, and the matching `.do-it/{brainstorm,grill,plans}/<slug>.md` files carry the current task state. Skip this step only when no `.do-it/` directory is present (fresh project).
3. Inspect current truth that could change the answer: files, docs, diffs, tests, plans, issues, task cards, or runtime state.
4. Choose a tier: `Light`, `Standard`, or `Heavy`.
5. If the user asked for a plan first, stop at an approval checkpoint.

Do not ask the user for facts that can be read locally. Ask only preference or priority questions that can change the route.

## Integrity

A failure, error, surprising result, or red flag is a clue to investigate — not an obstacle to make disappear. When something does not work:

1. Trace it to a root cause before changing anything. A symptom you cannot explain is not understood.
2. Never make a symptom vanish without explaining it. These are cover-ups, not fixes:
   - swallowing an exception or emptying a `catch`;
   - weakening, loosening, or deleting an assertion so a check passes;
   - deleting, skipping, or `xfail`-ing a failing test instead of fixing the cause;
   - commenting out failing code or returning early past it;
   - adding a fallback or default that hides why the primary path failed;
   - editing the evidence (expected output, snapshot, fixture) instead of the behavior.
3. Report honestly. State what was verified, what was not, and what is still broken. "I could not verify X" or "this still fails because Y" is a correct, useful answer; a false "done" is a defect.

This principle binds the parent agent and every subagent. `do-it-debugging`, `do-it-fix-loop`, and `do-it-verification-gate` enforce it at their stages; reviewers treat a cover-up as a Blocking finding.

## Orthogonal Dimensions

In addition to the single tier label, the router writes 5 boolean dimensions into per-session state. They narrow *intensity*, not tier itself: a Standard task can still be `breaks_interface=1` and a downstream skill MAY upgrade its review or drill posture accordingly.

| Dimension | Set when |
|---|---|
| `dim_touches_code` | prompt names a file path, extension, fenced snippet, or curated technical noun |
| `dim_crosses_packages` | ≥ 2 distinct top-level path segments named in the prompt |
| `dim_breaks_interface` | prompt mentions breaking change, schema/API rewrite, endpoint rename/delete/deprecate, or interface contract change |
| `dim_needs_tdd` | prompt names behaviour-modifying intent (`implement`, `实现`, `add feature`, `fix bug`, `修复 bug`, `添加功能`) **and** also names a code object (path / extension / fenced snippet / technical noun) |
| `dim_needs_review_loop` | tier is Heavy OR `dim_breaks_interface=1` |

Tier remains the canonical input. Light classifications skip dimension evaluation entirely (every dim stays 0). The router never coerces tier from dimensions.

### Reading dimensions

DIM values live in per-session state written by the router. Two consumption paths exist; agents and skills must use the right one for their layer.

**Hook layer (program path).** Hooks invoked by the host (router, grill-prompt, verification-gate, comments-lint, anti-patterns-lint) read DIM values via `do_it_session_state_get "$SESSION_ID" <key>` defined in `hooks/lib/common.sh`. The helper resolves the state path through the documented 5-level env-var search (`CLAUDE_PLUGIN_DATA` → `DO_IT_HOOK_DATA` → `CODEX_HOME/do-it-data` → repo `.do-it/runtime/` → `${TMPDIR}/do-it-sessions`). New hooks must call this helper and never hard-code a path.

**Agent layer (prose path).** Agents do **not** query DIM state at runtime. The `dim_*` keys are hook-internal signals. Agents satisfy a SKILL's "mandatory trigger when dim_X=1" line by judging from the **prompt content** they were given:

- if the user's prompt names a path/extension/code object → treat `dim_touches_code` as 1;
- if the prompt names ≥2 top-level package segments → treat `dim_crosses_packages` as 1;
- if the prompt mentions breaking change / schema-rewrite / endpoint rename/delete/deprecate / interface change → treat `dim_breaks_interface` as 1;
- if the prompt names behaviour-modifying intent (`implement` / `实现` / `add feature` / `fix bug` / `修复 bug` / `添加功能`) **and** also names a code object → treat `dim_needs_tdd` as 1 (the code-object requirement narrows the trigger so it does not fire on docs/config edits — see Mandatory-trigger escape clauses below);
- if tier is Heavy OR `dim_breaks_interface` is 1 → treat `dim_needs_review_loop` as 1.

The hook layer enforces some of these via Stop hook (`hooks/verification-gate.sh` blocks on missing interface attestation or missing review-loop trace). The agent layer interprets the same signals from prompt content; the two layers agree by design.

### Mandatory-trigger escape clauses

A SKILL listing a mandatory DIM trigger can still skip it when its own Light-tier escape clause applies. The most important cases:

- `do-it-tdd` (`dim_needs_tdd=1`): if the change is mechanical, docs-only, generated output, or config where an executable RED test is not useful (matches the skill's Light tier), state the reason in the route announcement and proceed without TDD. The trigger is a default, not a forced ceremony.
- `do-it-interface-drill` (`dim_breaks_interface=1`): if the changed interface is a private helper inside one file and no consumer depends on it, the Light-tier inline version of interface-drill is sufficient.
- `do-it-architecture-scan` (`dim_crosses_packages=1`): if the cross-package mention is purely textual (e.g. paths inside docs/README), inline architecture-scan suffices.

Always name the escape reason. A silent skip of a mandatory trigger is a review finding.

### Consumer table

| Dim | Hook consumers | Skill consumers |
|---|---|---|
| `dim_touches_code` | `hooks/grill-prompt.sh` (suppresses Standard implicit grill on discussion turns) | — |
| `dim_crosses_packages` | — | `do-it-architecture-scan` mandatory trigger (with the escape clause above) |
| `dim_breaks_interface` | `hooks/verification-gate.sh` (requires inline-review marker to name `interface`/`contract`/`schema`/`api`) | `do-it-interface-drill` mandatory trigger; `do-it-review-loop` runs adversarial intensity |
| `dim_needs_tdd` | — | `do-it-tdd` mandatory trigger (with the escape clause above) |
| `dim_needs_review_loop` | `hooks/verification-gate.sh` (requires review-loop trace before a "done" claim) | `do-it-review-loop` mandatory trigger — applies **only to done-claim turns**, not to planning/grill turns |

## Task Pointer

`.do-it/runtime/pointer` is a single-line **best-effort hint** holding the active task slug. It exists to help a fresh turn recover quickly; it is never authoritative.

Protocol:

| Action | Owner | Shape |
|---|---|---|
| Read | `do-it-planning` when it needs to extend instead of fork a task; `do-it-router` § First Move when an active task exists | `cat .do-it/runtime/pointer` — one line, no trailing newline |
| Write | `do-it-planning` when creating `.do-it/plans/<slug>.md`; `do-it-brainstorm` when creating `.do-it/brainstorm/<slug>.md` | `mkdir -p .do-it/runtime && printf '%s' "<slug>" > .do-it/runtime/pointer` |
| Clear | `do-it-branch-closeout` when the branch is merged, discarded, or otherwise closed | `mkdir -p .do-it/runtime && printf '%s' "<closed>" > .do-it/runtime/pointer` (or `rm` the file) |

Rules:

- Pointer contains the slug only — ASCII-only, no spaces, no timestamps, no stage info. Stage and status live inside the artifact's own frontmatter.
- `<closed>` is the sentinel for "no active task" so a new turn knows to ignore stale state.
- `.do-it/runtime/` is already gitignored — the pointer is local-only.
- A read consumer MUST verify the referenced `.do-it/{brainstorm,grill,plans}/<slug>.md` exists before trusting the pointer. The pointer can be stale after a branch switch, a manual deletion, or a concurrent session — none of these flip the pointer, so the artifact-existence check is the real source of truth.
- Concurrent writes to the pointer file are not coordinated; one-line slug writes fit within the OS atomic-write window, but if two skills race, the loser's slug simply gets overwritten. The verify-by-artifact rule above is what keeps this safe.
- Never write a pointer that does not match an existing `.do-it/{brainstorm,grill,plans}/<slug>.md` file.

## Required Risk Forecast

For every Standard or Heavy route, name the likely review-failure modes before
planning or implementation. Use concrete classes, not vague "risk":

- live-path gap: producer, transport, consumer, or surface is not actually wired;
- state-machine gap: stale async completion, deletion, rollback, retry, replay,
  idempotency, or concurrency can change the outcome;
- contract drift: schema, enum, event, route, CLI, copy, or docs disagree;
- synthetic proof: tests mock away the collaborator chain the task must prove;
- operator gap: a capability exists but is not discoverable, actionable, or
  understandable in the user workflow;
- evidence drift: a report, worker result, or pre-merge run is older than the
  branch or worktree being claimed.

If no class fits, state `failure-mode forecast: none identified` and why.

## Required Path Map

For Standard or Heavy work that touches behavior, interfaces, runtime state, or
surfaces, map the proof path before execution:

`producer -> contract/event/schema -> transport/client -> state/query -> surface/operator action -> verification`

Use the map to choose drills, tests, reviewers, and verification. If the work is
docs-only or mechanical, state why a path map is not applicable.

## Tier Rules

### Light

Use for small, local, low-risk work with one acceptance envelope.

- one small deliverable or question;
- one owner or a tiny file set;
- no unclear architecture, interface, product, or release boundary;
- local verification is enough.

Flow: inspect -> compact plan -> act or answer -> targeted verification or evidence -> local review -> closeout.

### Standard

Use for ordinary non-trivial work. This is the default tier for subagents unless the parent explicitly assigns another tier.

- multi-step task, behavior change, review, or design choice;
- use an inline modification map when the work is bounded; durable plan cards are for Heavy work, explicit plan requests, or handoffs that must survive the session;
- review depth is selected by risk, not by a fixed `grill -> planning -> review` chain;
- subagent work needs explicit write ownership, stop conditions, return evidence, and any required failure-mode forecast or path map.

Flow: inspect -> classify -> use the narrow design drills needed -> inline map or light plan -> execute -> verify -> local or focused review by risk -> fix important findings -> closeout.

### Heavy

Use only in the parent agent unless a subagent is explicitly assigned Heavy.

- wave, phase, gate, release, or durable workflow policy;
- multi-agent orchestration or shared-file integration;
- cross-boundary interface, data model, storage, security, async, replay, migration, or architecture risk;
- closeout requires review/fix-loop proof.

Flow: scope lock -> deep truth scan -> grill/interface/architecture/domain drills as needed -> slice plan -> execution and right-sized review gates -> integrated verification -> closeout.

## Execution Pipeline

Once the route is set, execute non-trivial work in this order (Light-tier
mechanical edits skip most of it):

1. Read the task card / inline map, the relevant `invariants.md`, and the
   affected existing code before editing.
2. Freeze scope from the card's Allowed Scope; map producer -> consumer for
   multi-package or live-path work.
3. Write or update tests first when practical (`do-it-tdd`).
4. Implement the smallest change that satisfies the card, then verify with its
   own commands.
5. Run `do-it-review-loop` on the diff before marking done; sweep changed
   contracts for doc/code drift.

For a wave (cards that land together) see `do-it-slicing`: run independent cards
in parallel only when their **write sets do not overlap**; serialize shared
barrel/index files. For phase or risky shared-file work, isolate with
`do-it-worktree-isolation` and merge back only after the integrated branch is
review-clean.

### Anti-tail discipline

- **One card, one goal** — if a card grows a second goal, split it.
- **No silent scope expansion** — a file outside Allowed Scope means update the
  scope explicitly or open a backlog issue.
- **No commit during a fix loop without re-running review** — partial fixes ship
  under the cover of "addressed".
- **No mocking the real collaborator chain** in integration tests unless the
  card says so.

## Route Map

- Need a plan or design handoff: `do-it-planning`.
- Need independent vertical work slices: `do-it-slicing`.
- Need to challenge a premise, plan, or closeout claim: `do-it-grill`.
- Need to design an API, schema, event, CLI, UI contract, module seam, or handoff: `do-it-interface-drill`.
- Need coupling, ownership, modularity, or testability analysis: `do-it-architecture-scan`.
- Need names, domain model, glossary, or code/docs/user terminology alignment: `do-it-domain-language`.
- Need a durable project handbook (invariants, architecture, code map, glossary, backlog): `do-it-handbook`. Suggest it when work spans many files or several sessions and `.do-it/handbook/` does not yet exist; downstream skills (`do-it-grill`, `do-it-planning`, `do-it-architecture-scan`) read those files when present.
- Need optional visual comparison or diagrams: `do-it-visual-planning`. This is auxiliary and does not participate in the core tier flow.
- Need implementation: execute locally or delegate a bounded slice after the route is clear; add `do-it-tdd` or `do-it-debugging` when the behavior or root cause warrants it.
- Need behavior-first implementation or regression coverage: `do-it-tdd`.
- Need root-cause diagnosis before fixing: `do-it-debugging`.
- Need delegated workers or reviewers: `do-it-subagent-orchestration`.
- Need diff, task, or QA finding review: `do-it-review-loop`.
- Need to repair review findings or regressions: `do-it-fix-loop`.
- Need to prove a completion, install, merge, or fix claim: `do-it-verification-gate`.
- Need isolated workspace or parallel lane setup: `do-it-worktree-isolation`.
- Need branch, PR, merge, or cleanup closeout: `do-it-branch-closeout`.
- Need to create or rewrite skills: `do-it-skill-authoring`.
- Authoring or reviewing comments on a code edit: `do-it-comments-discipline`. The parent agent should apply it before writing comments; the PostToolUse `comments-lint` hook is advisory backup, and a Standard or Heavy review pass that touches comments should load it for the comments lens.

Use the narrowest sequence that covers the risk. A small API rename may need only Standard interface drill plus delivery. A phase plan may need Heavy planning, slicing, grill, interface, architecture, and domain-language passes.

## Delegation Policy

The parent owns routing, shared files, integration, final verification, and final claims. Subagents own only their delegated slice.

Every subagent prompt should include:

- tier, task, and exact ownership;
- facts it may rely on and facts it must verify;
- forbidden paths or shared files;
- expected evidence and return shape;
- failure-mode forecast and path map when the slice can fail through live wiring, state, contract drift, synthetic proof, operator UX, or evidence drift;
- stop conditions for `NEEDS_CONTEXT` or `BLOCKED`;
- reminder that other agents may be editing the codebase and unrelated edits must not be reverted.

## Output Shape

For routing or planning:

- tier;
- current facts that drove it;
- failure-mode forecast for Standard/Heavy work;
- path map or `not applicable` reason;
- selected do-it skills;
- next action;
- stop condition or approval gate.

For final delivery:

- changed files;
- verification run and outcome;
- final-branch or current-worktree evidence for completion claims;
- review/fix-loop status;
- workflow steps used/skipped: brainstorm, grill, subagent, review, and
  verification, with reasons for skipped relevant steps;
- assumptions, skipped checks, or residual risk.

## Common Mistakes

- Starting planning, edits, subagents, review, verification, commit, or closeout
  without first loading `do-it-router` for matching non-trivial repository work.
- Routing Standard/Heavy work without a failure-mode forecast and path map.
- Asking the user for facts that can be read locally.
- Letting a subagent self-promote to Heavy without explicit assignment.
- Applying Heavy workflow to a one-file mechanical edit.
- Skipping review because verification passed.
- Treating architecture opportunities as blockers without correctness or delivery risk.
- Letting adapter terminology override do-it names, Codex tools, or repository instructions.
