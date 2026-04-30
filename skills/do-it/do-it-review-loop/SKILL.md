---
name: do-it-review-loop
description: "Problem: a worker says 'DONE' and the parent ships it; defects, contract violations, and missing tests survive into production. Fix: run a structured PR-style correctness review (reviewer agent, severity-graded findings, evidence-backed) before the parent accepts the diff."
---

# Do-It Review Loop

## Purpose

Use this to find defects, scope drift, and maintainability risk before closeout.
Review is findings-first and evidence-backed.

## Tiers

### Light

Use for tiny mechanical edits. The parent reads the diff, checks scope, and
records any concrete issue.

### Standard

Use for non-trivial task work and all subagent review assignments unless
explicitly assigned otherwise.

1. Freeze the review scope: task, commit, range, PR, or changed files.
2. Read the actual diff and relevant current files.
3. Check the failure-mode forecast, proof path map, readiness target, and final evidence expectations when they exist.
4. Check requirements before quality polish when a plan or task card exists.
5. Report only confirmed issues or clearly labeled uncertainty.
6. Order findings by severity with evidence.
7. Send `Blocking` and `Important` findings into `do-it-fix-loop`.

### Heavy

Use for wave, phase, gate, release, broad refactor, risky state/security, or
multi-agent integration review. Heavy is parent-only unless explicitly assigned.

- Heavy wave review requires at least two independent lenses even when tests are
  green.
- Heavy phase review defaults to architecture scan, post-diff interface review,
  correctness review, and one domain/risk reviewer.
- A pre-implementation interface drill can count toward Heavy review only when
  a read-only reviewer rechecks the delivered diff against the chosen contract
  and returns the review schema.
- Release or install review must include an install/release readiness lens.
- Skill or workflow bundle review must include a skill-quality lens.
- Any subagent counted toward a Heavy review gate must be assigned
  `tier: Heavy` in the prompt. Standard-tier review can inform the parent, but
  it does not satisfy Heavy sufficiency by itself.
- Synthesize duplicates and push back on unsupported reviewer claims.
- Close only after re-review confirms fix-loop closure.

## Severity

- `Blocking`: can make behavior wrong, unsafe, unverifiable, or out of scope.
- `Important`: likely to cause regression, rework, review failure, or ownership confusion.
- `Opportunity`: useful cleanup, but not required for this delivery unless tied to correctness.

## Finding Shape

Use durable, user-facing language:

- severity;
- stable ID when the review emits multiple findings;
- file/line or command evidence;
- issue in terms of observed behavior or delivery risk;
- cause class or root cause when known;
- repro, witness, or proof-path break;
- required fix or verification;
- prevention expectation when the issue is Blocking or Important;
- residual uncertainty if proof is incomplete.

## QA Intake Mode

Use this mode when the user is reporting bugs, doing conversational QA, or
asking for issue-ready finding capture instead of reviewing a prepared diff.

1. Let the user describe the problem in their own words.
2. Ask at most 2-3 short clarifying questions only for expected behavior,
   actual behavior, reproduction, consistency, or impact.
3. Explore the codebase in the background when it helps find domain language or
   behavior boundaries, but do not turn the issue into file-path trivia.
4. Decide whether the report is one issue or several independently fixable
   slices.
5. Write durable issue text from the user's perspective.

For a QA finding, include:

- what happened;
- what was expected;
- reproduction steps or why they are still missing;
- scope: single issue or breakdown;
- domain terms to use and aliases to avoid;
- acceptance criteria;
- additional context without brittle file paths or line numbers.

Create or update external issues only when the user asks for that or the repo's
workflow clearly owns issue creation.

## Review Rules

- Missing or stale failure-mode forecast, path map, readiness target, or final evidence is a review finding when it can hide a live-path, state, contract, operator, or evidence-drift bug.
- Do not review from commit messages alone.
- Do not auto-fix when the user asked for review-only work.
- Tests passing do not replace review.
- Style-only comments need maintenance or correctness impact to be findings.
- If evidence is blocked, return `Needs more evidence` instead of inventing certainty.

## Closeout Gate

Review is not clean while unresolved `Blocking` or `Important` findings remain. Blocking/Important fixes need a closure record that includes cause and prevention, not only code changes.
Deferred `Opportunity` findings must be explicit and non-blocking.
