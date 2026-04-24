---
name: multi-perspective-review
description: Use when the user asks to review, audit, inspect a diff or PR, check code quality, find redundant or low-quality code, reduce re-review churn, or assess risky changes.
---

# Multi-Perspective Review

## Purpose

Use this as a routing layer over existing review habits. It adds specialist selection, redundancy and maintainability review, and adversarial review without replacing findings-first code review.

If `requesting-code-review` or project review instructions apply, follow them first. This skill decides which additional lenses to use.

## Base Review Rules

- Read the actual diff or changed files before reviewing.
- Findings first, ordered by severity.
- Every finding needs evidence: file, line, behavior, command output, or reproducible scenario.
- Separate confirmed defects from hypotheses.
- Do not auto-fix when the user asked for review-only work.
- Do not dilute review with style-only comments unless they create real maintenance cost.

## Task-Class Review Gates

Choose review depth by task class:

- `task`: trivial edits may stay local; non-trivial work defaults to two reviewers
- `wave`: always require at least two reviewers
- `phase`: default to a four-reviewer pack

For plan-driven work where scope drift is a real risk, run
`spec-compliance-reviewer` before the code-quality stack.

## Default Review Stack

Use the smallest stack that covers the risk:

- Tiny mechanical edit: local review only.
- Non-trivial code change: `reviewer` plus `code-quality-cleaner`.
- `wave` task: minimum `reviewer` plus `code-quality-cleaner`.
- `phase` task: `reviewer` + `code-quality-cleaner` + `architect-reviewer` + one domain/risk reviewer.
- TypeScript/API/protocol-heavy diff: add `typescript-pro`.
- React/frontend diff: add `react-specialist`.
- SQL/storage/migration diff: add `sql-pro`.
- Architecture or package-boundary diff: add `architect-reviewer`.
- Risky, broad, stateful, security-sensitive, concurrent, or persistence-related diff: add `red-team-reviewer`.

If a custom agent is unavailable in the current session, perform that lens locally or use the nearest built-in reviewer.

## Code Quality Cleaner Lens

Use `code-quality-cleaner` for non-trivial changes when platform rules and the current user request permit subagents.

It should look for:

- redundant code and duplicated logic;
- unused or dead paths;
- avoidable abstractions;
- low-cohesion files or functions;
- confusing names that hide behavior;
- unnecessary broad changes;
- missed reuse of existing helpers;
- weak error handling that will cause future review churn.

It should not block on personal taste or demand broad refactors unrelated to the diff.

## Red Team Lens

Use `red-team-reviewer` when the diff can fail dangerously:

- state corruption or data loss;
- security or trust-boundary bugs;
- race conditions, retries, or async ordering;
- persistence, migration, or replay behavior;
- fallback paths and partial failure handling;
- resource leaks or runaway work;
- frontend inference of backend truth.

## Synthesis

The coordinator must merge reviewer output into one result:

- Blocking findings first.
- Important findings next.
- Nice-to-have only when actionable.
- Note duplicate findings once.
- Push back on unsupported or out-of-scope claims.
- State verification run and remaining risk.

## Completion Gate

- No unresolved `Blocking` or `Important` findings remain.
- `Nice-to-have` findings may be deferred only if explicitly recorded.
- If `spec-compliance-reviewer` found a scope or acceptance gap, do not start
  maintainability-only review loops as if the task were already done.

## Common Mistakes

- Asking specialists to review without first reading the diff locally.
- Treating agent consensus as proof.
- Mixing refactor suggestions with correctness findings at the same severity.
- Running red-team on every small edit and slowing exploration.
- Skipping quality review on broad but "working" code.
- Using the same review depth for `task`, `wave`, and `phase` work.
