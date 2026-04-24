---
name: do-it-subagent-orchestration
description: Use when delegating do-it work to subagents, coordinating multiple agents, assigning write ownership, or collecting evidence from worker or reviewer slices.
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

- Do not delegate before the parent understands current truth enough to bound the slice.
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
- `must-verify facts`: facts the child must check itself before acting or reporting.
- `stop condition`: when to return `NEEDS_CONTEXT`, `BLOCKED`, or `STILL_OPEN` instead of improvising.
- `return schema`: the exact shape the parent needs.

Include this guardrail unless Heavy is explicitly assigned:

`You are a Standard-tier subagent. Do not expand into parent-level Heavy flow, broad planning, branch closeout, manifest/docs edits, or unrelated cleanup.`

## Return Schema

Implementation/debugging workers return:

- status: `DONE`, `DONE_WITH_CONCERNS`, `NEEDS_CONTEXT`, or `BLOCKED`;
- tier used;
- files changed;
- commands run with results;
- facts verified;
- assumptions;
- residual risk;
- requested parent action.

Review/drill workers return:

- status: `CLEAR`, `FINDINGS`, `STILL_OPEN`, `NEEDS_CONTEXT`, or `BLOCKED`;
- scope reviewed;
- findings ordered by `Blocking`, `Important`, `Opportunity`;
- evidence for each finding;
- commands or inspections run;
- facts verified;
- assumptions;
- residual risk;
- `NOT_CHECKED`: explicit scope or checks not performed.

## Parent Duties

- Inspect diffs and reports before accepting them.
- Resolve duplicate or conflicting findings.
- Re-run verification that supports final claims.
- Ensure subagents did not touch forbidden paths.
- Close or re-dispatch workers only after the stop condition is satisfied.
