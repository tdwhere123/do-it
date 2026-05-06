# Subagent Dispatch

Narrative form of the `do-it-subagent-orchestration` contract. Read
this before delegating to a subagent for the first time on a project;
read the contract for the exact required fields.

## When To Delegate

Delegate when the parent has bounded the slice well enough that
another agent can do the work in isolation, and the parent's context
budget is better spent on integration and verification than on the
slice itself.

Do **not** delegate when:

- the parent has not yet verified enough current truth to bound the
  slice;
- the work touches the parent's shared files (final integration, branch
  closeout, manifest edits);
- two parallel workers would write the same file or hidden shared
  state;
- the parent is uncertain about acceptance criteria.

A delegated worker is evidence to inspect, not a rubber stamp.

## Required Prompt Fields

Every subagent prompt must specify:

- **tier**: Light, Standard, or explicit Heavy.
- **scope**: exact task and non-goals.
- **write ownership**: allowed directories/files, or `read-only`.
- **forbidden paths**: files, directories, generated outputs, or
  user-owned edits to avoid.
- **current truth**: facts the parent verified and the child may rely
  on.
- **failure-mode forecast**: expected failure classes the child must
  cover or refute.
- **path map**: producer → contract → transport → consumer → state →
  surface, or `not applicable`.
- **readiness target**: the readiness label expected after the slice.
- **must-verify facts**: facts the child must check itself before
  acting or reporting.
- **stop condition**: when to return `NEEDS_CONTEXT`, `BLOCKED`, or
  `STILL_OPEN`.
- **return schema**: the exact shape the parent needs.

Include this guardrail unless Heavy is explicitly assigned:

> You are a Standard-tier subagent. Do not expand into parent-level
> Heavy flow, broad planning, branch closeout, manifest/docs edits, or
> unrelated cleanup.

## Standard Return Schemas

Implementation/debugging workers return:

- `status`: `DONE`, `DONE_WITH_CONCERNS`, `NEEDS_CONTEXT`, or
  `BLOCKED`;
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

- `status`: `CLEAR`, `FINDINGS`, `STILL_OPEN`, `NEEDS_CONTEXT`, or
  `BLOCKED`;
- scope reviewed;
- findings ordered by `Blocking`, `Important`, `Opportunity`;
- evidence per finding;
- cause class when known;
- commands or inspections run;
- facts verified;
- assumptions;
- residual risk;
- `NOT_CHECKED`: explicit scope or checks not performed.

## Parent Duties

- Inspect diffs and reports before accepting them.
- Resolve duplicate or conflicting findings.
- Re-run verification on the integrated branch — not the worker's
  isolated working copy.
- Ensure subagents did not touch forbidden paths.
- Close or re-dispatch workers only after the stop condition is
  satisfied.

## Common Mistakes

- Delegating before scope is bounded; the worker spends its budget
  re-discovering the parent's question.
- Parallelizing workers that share a write target; one of them
  silently overwrites the other.
- Treating a worker's `DONE` as acceptance. `DONE` is a status, not a
  signoff.
- Letting a worker make manifest, docs, or release decisions outside
  its slice.
