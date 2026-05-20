---
name: do-it-subagent-orchestration
description: "Use when delegated agents need exact scope, write ownership, forbidden paths, must-verify facts, stop condition, and return schema."
---

# Do-It Subagent Orchestration

## Purpose

Use this to delegate without losing scope control. Subagents run a bounded
do-it loop inside their slice; the parent owns integration, conflicts, and final
claims.

## Tiers

### Light

Use one read-only helper for a narrow search, map, or review lens. Parent keeps
all writes.

### Standard

Use for normal delegated implementation, review, debugging, or docs-truth
slices. This is the default for every subagent unless the parent prompt says
otherwise.

### Heavy

Use for multi-lane waves, phase work, gate closeout, or cross-boundary
coordination. Heavy is parent-only by default. A child may use Heavy only when
the parent explicitly writes `tier: Heavy` and narrows the child scope.

## Dispatch Rules

- Do not delegate before the parent understands current truth enough to bound the slice, forecast likely failure modes, and map any required proof path.
- Do not parallelize workers that can write the same file or hidden shared state.
- Keep shared files, final integration, branch closeout, and completion claims under the parent unless explicitly assigned.
- Review agents use read-only configs. If fixes are needed, return findings to
  the parent or route a separate delivery/fix slice.
- A child report is evidence to inspect, not proof to trust blindly.

## Required Prompt Contract

Every subagent prompt must include:

- `tier`: Light, Standard, or explicit Heavy.
- `scope`: exact task and non-goals.
- `write ownership`: allowed directories/files, or `read-only`.
- `forbidden paths`: files, dirs, generated outputs, or user-owned edits to avoid.
- `current truth`: facts the parent verified and the child may rely on.
- `failure-mode forecast`: expected failure classes the child must actively cover or refute.
- `path map`: producer -> contract/event/schema -> transport/client -> state/query -> surface/operator action -> verification, or `not applicable`.
- `readiness target`: fixture-ready, live-event-ready, operator-ready, docs-truth-ready, or install-ready.
- `must-verify facts`: facts the child must check itself before acting or reporting.
- `stop condition`: when to return `NEEDS_CONTEXT`, `BLOCKED`, or `STILL_OPEN` instead of improvising.
- `integrity stance`: a failure is a clue to trace, not to hide. The child investigates root causes and reports honestly — it never swallows an error, weakens a check, skips a test, or claims unverified work is done (see `do-it-router` § Integrity).
- `output_budget`: token cap for the structured response, selected from the default budget table below.
- `return schema`: the exact shape the parent needs.

Include this guardrail unless Heavy is explicitly assigned:

`You are a Standard-tier subagent. Do not expand into parent-level Heavy flow, broad planning, branch closeout, manifest/docs edits, or unrelated cleanup.`

## Token Budget

Free-form subagent output is the most common way the parent's context gets
polluted. do-it keeps response budgets in this skill instead of in
`agents/*.toml`, because Codex agent TOML only accepts the host-supported schema
keys. The orchestrator must choose the matching budget below, propagate that cap
into the child prompt, and enforce it on return.

### Caller responsibility

When dispatching a subagent, the parent must:

- Select `output_budget` from the default budget table by exact agent name or
  class. If no class matches, use 1500 tokens.
- Insert this line into the prompt verbatim, with N filled in:
  `Your structured response must fit within ~N tokens. If you approach budget,
  switch to a summarized return: keep status, blocking findings, and evidence
  pointers; mark truncated sections explicitly; do not pad.`
- Treat the budget as a hard ceiling on the structured return, not a target.
  Tool calls, internal reasoning, and file reads do not count.

### Default budgets

| Agent class | Budget |
|---|---|
| reviewer / red-team / spec-compliance / skill-quality / code-quality / domain-language / install-release / architect / architecture-taste-reviewer / ceo lenses | 1500 |
| product-strategist / ux-designer / end-user-advocate / ops-sre / plan-challenger / architecture-strategist | 2000 |
| react-specialist / typescript-pro / sql-pro / test-automator / tdd-red-writer / documentation-engineer | 2500 |
| code-mapper | 3000 |

### Subagent self-check

Subagents must estimate their own response size before finalizing:

- At ~80% of budget, switch to summary mode: keep status, severity-ordered
  findings, evidence pointers (file:line), and residual risk. Drop restated
  context, repeated reasoning, and verbose framing.
- If the structured return cannot fit even in summary mode, return status
  `BLOCKED: output exceeds budget` with the smallest evidence the parent needs
  to re-scope, instead of silently truncating.

### Caller post-check

After receiving the response, the parent verifies budget compliance:

- If the response is clearly larger than the assigned `output_budget`, mark the
  affected sections `[TRUNCATION SUSPECTED]` in the parent's record and note
  it in the integration writeup or fix-loop input.
- A budget overrun is itself a finding: the parent may re-dispatch with a
  tighter scope rather than absorbing the bloated context.

## Return Schema

The return schema template should declare its budget at the top so the
subagent and any reviewer can spot truncation:

```
<!-- output_budget: <N> tokens; summarize past 80% -->
status: ...
... (rest of schema)
```

Implementation/debugging workers return:

- status: `DONE`, `DONE_WITH_CONCERNS`, `NEEDS_CONTEXT`, or `BLOCKED`;
- tier used;
- files changed;
- commands run with results;
- facts verified;
- failure modes covered or still open;
- proof path evidence or why it was not applicable;
- assumptions;
- residual risk;
- requested parent action.

Review/drill workers return:

- status: `CLEAR`, `FINDINGS`, `STILL_OPEN`, `NEEDS_CONTEXT`, or `BLOCKED`;
- scope reviewed;
- findings ordered by `Blocking`, `Important`, `Opportunity`;
- evidence for each finding;
- cause class when known;
- commands or inspections run;
- facts verified;
- assumptions;
- residual risk;
- `NOT_CHECKED`: explicit scope or checks not performed.

## Parent Duties

- Inspect diffs and reports before accepting them.
- Resolve duplicate or conflicting findings.
- Re-run verification that supports final claims on the integrated branch or current worktree.
- Ensure subagents did not touch forbidden paths.
- Close or re-dispatch workers only after the stop condition is satisfied.

## Stop Conditions

Do not dispatch, or stop the lane, when:

- write ownership overlaps another active worker or user-owned edit;
- the parent cannot state current truth, failure-mode forecast, or readiness target;
- the child needs credentials, network, destructive cleanup, or branch actions not granted;
- the child returns `NEEDS_CONTEXT`, `BLOCKED`, `STILL_OPEN`, or budget overrun.

## Common Rationalizations

- *"Parallel agents will be faster."* — Parallelism helps only when write sets,
  proof paths, and stop conditions are independent.
- *"The worker says done."* — Worker output is input to integration; the parent
  still verifies final claims.
- *"The prompt can stay loose because the agent is smart."* — Loose scope
  creates conflicts, duplicated reads, and unreviewable claims.

## Red Flags

- Two workers can edit the same manifest, docs index, migration, or generated file.
- A worker is asked to review and fix the same surface in one ambiguous task.
- Return schema omits changed files, commands, assumptions, or residual risk.
- Parent closes workers before receiving final status or inspecting their diffs.

## Verification

Before accepting delegated work:

- each worker stayed within write ownership and forbidden paths;
- returned evidence matches the assigned readiness target;
- integrated verification is rerun by the parent where the final claim depends on it;
- unresolved worker statuses are either re-dispatched, fixed locally, or recorded as open risk.
