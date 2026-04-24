---
name: requesting-code-review
description: Use when completing tasks, implementing major features, or before merging to verify work meets requirements
---

# Requesting Code Review

Dispatch the smallest reviewer stack that can catch issues before they cascade. Reviewers should get tightly scoped context about the work product — never your full session history. This keeps them focused on evidence, not your thought process, and preserves controller context.

**Core principle:** Review early, review often.

## When to Request Review

**Mandatory:**
- After each task in subagent-driven development
- After completing major feature
- Before merge to main
- After any non-trivial code change where review churn, redundancy, or hidden failure modes would be costly
- After every `wave` task with at least two reviewers
- After every `phase` task with the default four-reviewer pack unless a higher-risk domain requires one more specialist

**Optional but valuable:**
- When stuck (fresh perspective)
- Before refactoring (baseline check)
- After fixing complex bug

## How to Request

First classify the work:

- `task`
- `wave`
- `phase`

**1. Freeze review scope:**
```bash
# Prefer the explicit task, PR, or user-provided base. Do not assume HEAD~1.
BASE_SHA=<base commit, merge-base, or pre-task checkpoint>
HEAD_SHA=$(git rev-parse HEAD)
```

If the user asked for a specific commit, range, or "full delivered surface",
review exactly that scope. If the scope is unclear, inspect history/diff first
and state the assumption before dispatching reviewers.

**2. Dispatch the reviewer stack:**

- `task` non-trivial default: `reviewer` + `code-quality-cleaner`
- `wave` default: same minimum two-reviewer stack
- `phase` default:
  - `reviewer`
  - `code-quality-cleaner`
  - `architect-reviewer`
  - one domain/risk reviewer

If the work is tied to a written task card or plan and scope drift would be
costly, run `spec-compliance-reviewer` before the quality stack.

**3. Act on feedback:**
- Fix Blocking issues immediately
- Fix Important issues before proceeding
- Record Nice-to-have issues explicitly if they are deferred
- Push back if reviewer is wrong (with reasoning)

## Quality-Biased Review Routing

Read the actual diff or changed files before dispatching reviewers. Then use the smallest useful review stack:

- Tiny mechanical edit: local review is enough.
- Non-trivial code change: run the normal reviewer plus `code-quality-cleaner` when available.
- `wave` work: at least `reviewer + code-quality-cleaner`.
- `phase` work: default four-reviewer pack before close-out.
- TypeScript API, type boundary, protocol, or package contract: add `typescript-pro`.
- React UI, hooks, rendering, or frontend state: add `react-specialist`.
- SQL, migration, storage, or query behavior: add `sql-pro`.
- Architecture, ownership, package boundaries, or long-term coupling: add `architect-reviewer`.
- Risky, broad, stateful, concurrent, persistence, security, or failure-mode-heavy diff: add `red-team-reviewer`.

If a named reviewer is unavailable, perform that lens locally and say so only when it affects confidence.

`code-quality-cleaner` focuses on duplicate logic, redundant code, dead paths, avoidable abstraction, low-cohesion edits, missed reuse of local helpers, brittle tests, and maintainability regressions. It should not block on personal taste.

`red-team-reviewer` focuses on state corruption, data loss, trust-boundary bugs, races, retries, partial failure, bad fallback behavior, resource leaks, and missing adversarial tests.

Synthesize all reviewer output into one findings-first response. Subagent consensus is signal, not proof.

Review is not complete while any `Blocking` or `Important` findings remain open.

When review findings will be committed, preserve the evidence needed for the
repository's fix-commit policy. If local rules require finding IDs, cause, fix,
verify, or follow-up fields, ask reviewers for that structure and keep it
available for the controller-owned commit message. Do not let a generic
subject-only commit erase the review evidence.

## Example

```
[Just completed Task 2: Add verification function]

You: Let me request code review before proceeding.

BASE_SHA=$(git log --oneline | grep "Task 1" | head -1 | awk '{print $1}')
HEAD_SHA=$(git rev-parse HEAD)

[Dispatch reviewer stack]
  WHAT_WAS_IMPLEMENTED: Verification and repair functions for conversation index
  PLAN_OR_REQUIREMENTS: Task 2 from docs/superpowers/plans/deployment-plan.md
  BASE_SHA: a7981ec
  HEAD_SHA: 3df7661
  DESCRIPTION: Added verifyIndex() and repairIndex() with 4 issue types

[Reviewers return]:
  Findings:
    Important: Missing progress indicators
    Nice-to-have: Magic number (100) for reporting interval
  Assessment: Not ready yet

You: [Fix progress indicators]
[Continue to Task 3]
```

## Integration with Workflows

**Subagent-Driven Development:**
- Review after EACH task
- Catch issues before they compound
- Fix before moving to next task

**Executing Plans:**
- Review after each batch (3 tasks)
- Get feedback, apply, continue

**Ad-Hoc Development:**
- Review before merge
- Review when stuck

## Red Flags

**Never:**
- Skip review because "it's simple"
- Ignore Blocking issues
- Proceed with unfixed Important issues
- Argue with valid technical feedback
- Treat passing tests as a substitute for quality review on non-trivial diffs
- Report reviewer output without checking evidence and merging duplicates

**If reviewer wrong:**
- Push back with technical reasoning
- Show code/tests that prove it works
- Request clarification

See template at: requesting-code-review/code-reviewer.md
