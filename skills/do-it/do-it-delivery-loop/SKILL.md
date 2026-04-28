---
name: do-it-delivery-loop
description: Use when executing do-it-native work from current truth through planning, implementation, verification, review, fix loops, and evidence-backed closeout.
---

# Do-It Delivery Loop

## Purpose

Use this to deliver work without outrunning repository truth or peer edits.

Core loop:

`inspect current truth -> forecast failure modes -> map proof path -> choose tier -> plan -> execute -> verify -> review -> fix -> close out with evidence`

This is do-it-native. Upstream workflow text is source material, not something to
copy verbatim or let override Codex tools, local instructions, or user write
ownership.

## Entry Checks

Before editing:

- read local instructions and the user's write ownership;
- check worktree status and protect unrelated or peer-owned edits;
- inspect the files, docs, tests, diffs, task cards, or runtime state that define current truth;
- for Standard/Heavy work, write the failure-mode forecast and proof path map before editing;
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
2. Name the failure-mode forecast, proof path map, and readiness target.
3. Make a compact plan or modification map.
4. Execute only inside owned paths.
5. Verify the specific claim.
6. Review the diff for regressions and scope drift.
7. Fix confirmed findings and re-verify.
8. Report changed files, evidence, assumptions, and residual risk.

### Heavy

Use for wave, phase, multi-agent, cross-boundary, release/gate, architecture, or
high-risk work. Heavy is parent-only unless a parent prompt explicitly assigns
it to a child agent with a narrow scope.

Parent-only unless explicitly assigned: do not let a subagent infer Heavy from
the parent's route.

Flow:

1. Freeze scope, non-goals, write ownership, forbidden paths, readiness target, and final evidence.
2. Inspect code, docs, tests, plans, diffs, and runtime truth as needed.
3. Write the failure-mode forecast and proof path map before delegating or editing.
4. Use `do-it-grill`, `do-it-interface-drill`, or `do-it-architecture-scan` when their triggers apply.
5. Split into slices with owners, dependencies, verification, and review depth.
6. Dispatch subagents only through `do-it-subagent-orchestration`.
7. Integrate slices under the parent.
8. Run narrow then broad verification according to risk.
9. Run review, fix every `Blocking` and `Important` finding, and re-review changed surfaces.
10. Close only when evidence supports the claim.

## Delivery Rules

- `fixture-ready`, `live-event-ready`, `operator-ready`, `docs-truth-ready`, and `install-ready` are distinct claims; prove only the level actually delivered.
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
- failure-mode forecast and path map used;
- verification run and result, including final branch/worktree evidence when claiming closeout;
- review/fix-loop status;
- prevention hook added for each Blocking/Important fix;
- assumptions, skipped checks, or residual risk.

Do not claim complete, fixed, passing, merged, or closed without fresh evidence.
