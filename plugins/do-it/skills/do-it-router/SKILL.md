---
name: do-it-router
description: "Use when any non-trivial repo task needs Light, Standard, or Heavy tier selection, failure-mode forecast, path map, and the minimum useful do-it workflow before action. 路由 / 分级 / 非平凡任务."
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

Do not ask the user for facts that can be read locally. Ask only preference or priority questions that can change the route. When you must ask, use the host's question tool if available, ask one decision at a time, and provide 2-3 options with benefit/cost/risk and a recommended default.

## Integrity

Load [`../references/integrity.md`](../references/integrity.md) when debugging,
fixing, reviewing, or verifying — it binds the parent and every subagent.
`do-it-debugging`, `do-it-fix-loop`, and `do-it-verification-gate` enforce it
at their stages; reviewers treat a cover-up as a Blocking finding.

## Stance

do-it agents should be rigorous without becoming passive. The default posture is:

- **Builder's bias:** unknown is not impossible. Before saying a path cannot work,
  inspect the local truth or run the smallest real experiment that could prove or
  falsify it.
- **Conservative claims, active search:** be strict about evidence and completion,
  but keep looking for a cheaper, deeper, or higher-leverage route until the
  task budget says to stop.
- **Two-path framing for hard work:** name a reliable baseline path and a
  breakthrough path when optimization, algorithms, quality, or architecture
  improvement is the task.
- **No learned helplessness:** "likely hard", "not possible", or "probably not
  worth it" is not a conclusion without code, data, benchmark, or source
  evidence.

Hooks inject a compact version of this stance into subagent contexts via
`subagent-stance.sh`; parent agents inherit it here.

## Restraint

do-it favors the smallest change that earns its keep — fast *and* good, not more
ceremony. Write-time checks live in the advisory `write-quality-lint` hook
(closed-set families in [`../references/write-quality-families.md`](../references/write-quality-families.md));
review-time YAGNI and integrity lenses live in `do-it-review-loop`. Hard
done-claims stay in `verification-gate`.

When extending do-it or planning a project change:

- Prefer advisory nudges over write-blocking gates.
- Thin or reuse an existing skill before adding a new one; ask "will this keep
  growing?" before adding a rule.
- Before deleting code that looks unused, read git history and original intent.
- Match process to risk: small work stays Light; only real risk earns planning,
  review, and proof.

### The decision ladder

Walk down these rungs and stop at the first that holds:

1. **Does it need to exist?** → skip speculative work.
2. **Stdlib?** → use it.
3. **Native platform feature?** → use it.
4. **Installed dependency?** → use it.
5. **One line?** → one line.
6. Smallest custom code that works.

`do-it-grill` opens with rung 1; `do-it-brainstorm` maps options; write-quality-lint
flags skipped rungs at edit time. Never cut safety: trust boundaries, data-loss
prevention, security, accessibility, or explicit user features.

## Orthogonal Dimensions

Load [`../references/dimensions.md`](../references/dimensions.md) for the full
dim table, hook vs agent consumption paths, mandatory-trigger escape clauses,
and consumer table. Tier remains canonical; Light skips all dims.

## Task Pointer

Load [`../references/task-pointer.md`](../references/task-pointer.md) for
read/write/clear protocol. `.do-it/runtime/pointer` is a best-effort slug hint
— always verify the matching artifact exists before trusting it.

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

## Handbook Bootstrap Trigger

Before planning or editing on a Standard or Heavy work turn, check whether the
project has any durable do-it context:

- If `.do-it/handbook/` exists, read the files relevant to the change
  (`invariants.md`, `glossary.md`, `architecture.md`) before editing.
- If `.do-it/CONTEXT.md` exists, read it before grill or planning.
- If **neither** exists, load `do-it-handbook` and run its lean bootstrap in the
  same turn. This creates the placeholder skeleton (`README.md`,
  `invariants.md`, `architecture.md`, `glossary.md`, `worklog-template.md`)
  plus `.gitkeep` files for `.do-it/grill/`, `.do-it/plans/`,
  `.do-it/brainstorm/`, and `.do-it/worklog/`. The bootstrap is additive and
  idempotent — existing files are never overwritten.

The bootstrap is not optional ceremony: without a shared handbook, every
subsequent session re-derives the same project terms, invariants, and
architecture frame. Skip it only when the user explicitly says the project
is a one-shot script with no future sessions.

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
- Need a shared vocabulary for deep modules, seams, and whether an abstraction earns its keep: `do-it-codebase-design`.
- Need names, domain model, glossary, or code/docs/user terminology alignment: `do-it-context` (§ Domain Glossary Mode).
- Need a durable project handbook (invariants, architecture, glossary, worklog template): `do-it-handbook`. Bootstrap it when a Standard or Heavy work turn touches code and neither `.do-it/handbook/` nor `.do-it/CONTEXT.md` exists yet; downstream skills (`do-it-grill`, `do-it-planning`, `do-it-architecture-scan`) read those files when present. The bootstrap is additive only — it creates placeholder templates and never overwrites existing files.
- Need optional visual comparison or diagrams: `do-it-planning` § Visual Aids. Auxiliary; does not participate in the core tier flow.
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

Use the narrowest sequence that covers the risk. A small API rename may need only Standard interface drill plus delivery. A phase plan may need Heavy planning, slicing, grill, interface, architecture, and vocabulary passes.

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
