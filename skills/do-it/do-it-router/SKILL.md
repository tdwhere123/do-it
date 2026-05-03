---
name: do-it-router
description: "Problem: agents jump from request straight to code, dragging Light tasks through Heavy ceremony or hauling Heavy work across stale truth without classification. Fix: classify the request as Light/Standard/Heavy, name the minimum useful skill+agent set, forecast likely failure modes, and pin the parent agent's scope before any planning or implementation."
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
2. Inspect current truth that could change the answer: files, docs, diffs, tests, plans, issues, task cards, or runtime state.
3. Choose a tier: `Light`, `Standard`, or `Heavy`.
4. If the user asked for a plan first, stop at an approval checkpoint.

Do not ask the user for facts that can be read locally. Ask only preference or priority questions that can change the route.

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

## Route Map

- Need a plan or design handoff: `do-it-planning`.
- Need independent vertical work slices: `do-it-slicing`.
- Need to challenge a premise, plan, or closeout claim: `do-it-grill`.
- Need to design an API, schema, event, CLI, UI contract, module seam, or handoff: `do-it-interface-drill`.
- Need coupling, ownership, modularity, or testability analysis: `do-it-architecture-scan`.
- Need names, domain model, glossary, or code/docs/user terminology alignment: `do-it-domain-language`.
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
