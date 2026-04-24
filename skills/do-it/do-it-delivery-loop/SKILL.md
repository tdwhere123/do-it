---
name: do-it-delivery-loop
description: Use when executing do-it-native work from current truth through planning, implementation, verification, review, fix loops, and evidence-backed closeout.
---

# Do-It Delivery Loop

## Purpose

Use this to deliver work without outrunning repository truth or peer edits.

Core loop:

`inspect current truth -> choose tier -> plan -> execute -> verify -> review -> fix -> close out with evidence`

This is do-it-native. Upstream workflow text is source material, not something to
copy verbatim or let override Codex tools, local instructions, or user write
ownership.

## Entry Checks

Before editing:

- read local instructions and the user's write ownership;
- check worktree status and protect unrelated or peer-owned edits;
- inspect the files, docs, tests, diffs, task cards, or runtime state that define current truth;
- choose `Light`, `Standard`, or `Heavy`;
- stop at a plan if the user asked for plan-only or approval first.

## Tiers

### Light

Use for a tiny, bounded edit where ownership and verification are obvious.

Flow: inspect the owning file -> make the smallest edit -> run a targeted check
or explain why none exists -> local diff review -> close out.

### Standard

Use for normal implementation, bugfix, docs-truth, or review-fix work. This is
the default tier for subagents unless the parent explicitly assigns another
tier.

Flow:

1. Inspect current truth and acceptance surface.
2. Make a compact plan or modification map.
3. Execute only inside owned paths.
4. Verify the specific claim.
5. Review the diff for regressions and scope drift.
6. Fix confirmed findings and re-verify.
7. Report changed files, evidence, assumptions, and residual risk.

### Heavy

Use for wave, phase, multi-agent, cross-boundary, release/gate, architecture, or
high-risk work. Heavy is parent-only unless a parent prompt explicitly assigns
it to a child agent with a narrow scope.

Parent-only unless explicitly assigned: do not let a subagent infer Heavy from
the parent's route.

Flow:

1. Freeze scope, non-goals, write ownership, and forbidden paths.
2. Inspect code, docs, tests, plans, diffs, and runtime truth as needed.
3. Use `do-it-grill`, `do-it-interface-drill`, or `do-it-architecture-scan` when their triggers apply.
4. Split into slices with owners, dependencies, verification, and review depth.
5. Dispatch subagents only through `do-it-subagent-orchestration`.
6. Integrate slices under the parent.
7. Run narrow then broad verification according to risk.
8. Run review, fix every `Blocking` and `Important` finding, and re-review changed surfaces.
9. Close only when evidence supports the claim.

## Delivery Rules

- Current files beat memory, old plans, and prior agent reports.
- Verification proves behavior; review finds risks verification may miss.
- Review is not closed while `Blocking` or `Important` findings remain open.
- If verification fails, diagnose before adding more changes.
- If a fix changes an interface or architecture boundary, rerun the relevant drill or scan.
- Subagents supply evidence; the parent owns integration and final claims.

## Closeout Shape

Report:

- changed files;
- what changed;
- verification run and result;
- review/fix-loop status;
- assumptions, skipped checks, or residual risk.

Do not claim complete, fixed, passing, merged, or closed without fresh evidence.
