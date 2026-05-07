---
name: do-it-review-loop
description: "Use when a delivered diff or worker result needs PR-style correctness review before the parent accepts it."
---

# Do-It Review Loop

## Purpose

Use this to find defects, scope drift, and maintainability risk before closeout.
Review is findings-first and evidence-backed.

## Tiers

### Light

Use for tiny mechanical edits. The parent reads the diff, checks scope, and
records any concrete issue. Docs-only Light work stays local unless it changes
published install, release, or workflow policy.

### Standard

Use for non-trivial task work and all subagent review assignments unless
explicitly assigned otherwise.

1. Freeze the review scope: task, commit, range, PR, or changed files.
2. Read the actual diff and relevant current files.
3. Check the failure-mode forecast, proof path map, readiness target, and final evidence expectations when they exist.
4. Check requirements before quality polish when a plan or task card exists.
5. Report only confirmed issues or clearly labeled uncertainty.
6. Order findings by severity with evidence.
7. Use at most one focused reviewer when the risk is not locally reviewable; otherwise the parent performs local review.
8. Send `Blocking` and `Important` findings into `do-it-fix-loop`.

### Heavy

Use for wave, phase, gate, release, broad refactor, risky state/security, or
multi-agent integration review. Heavy is parent-only unless explicitly assigned.

- Heavy release, workflow, or policy review defaults to two independent lenses:
  one for the changed skill/policy behavior and one for install/release
  readiness.
- Add more than two lenses only when the delivered diff touches migration,
  security, broad public interfaces, state/persistence, or a phase-scale
  architecture boundary.
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

### Comments lens

Triggered when the diff contains added/modified comments. Available at
Standard tier (optional) and Heavy tier (default when comment changes are
present). Loads `do-it-comments-discipline`. Returns findings in the standard
finding shape (severity / location / cause class / required fix), where cause
class is one of the comments-discipline categories (`what` / `history` /
`task-ref` / `tombstone` / `orphan-todo` / `fix-narrative` /
`stale-invariant` / `broken-reference`). The `comments-lint.sh` PostToolUse
hook offers an advisory pre-filter; the lens is the source of truth.

### Research-first lens

Triggered at Heavy tier when the plan or diff introduces a new dependency,
datastore, framework, runtime, or protocol. Loads
`architecture-taste-reviewer` (audits the research trail, alternatives count,
and user confirmation step). Returns findings in the standard shape; a
memory-pick without a fresh search is `Blocking`.

## Review intensity (graduated)

Review intensity is the canonical axis 0.7.x and later use to describe how
much review effort to spend; it subsumes the older free-form descriptions
under the per-tier sections above. Concretely:

- review-quick subsumes the older "Light tier review (parent-local)" wording.
- review-deep subsumes the older "Standard tier review (one focused
  reviewer)" wording. When the older Standard text says "parent performs
  local review" it means review-quick; when it says "one focused reviewer"
  it means review-deep.
- review-adversarial subsumes the older "Heavy tier review (multi-lens)"
  wording.

If the per-tier text and an intensity description ever appear to disagree,
the intensity description below is authoritative.

Review intensity is orthogonal to the tier:

- **review-quick** (Light + touches_code, or Standard + low risk): no subagent.
  Parent agent runs an inline self-review prompt over the diff. Fast, no
  context-handoff overhead. Use when:
  - Light tier with code edits (verification-gate auto-fires)
  - Standard tier modification map with no new dependency / interface change

- **review-deep** (Standard default, or Heavy + low risk): one reviewer
  subagent (`reviewer`). Standard finding shape. Use when:
  - Standard tier with breaking-interface / new module / cross-package signal
  - Heavy tier without high-risk lenses

- **review-adversarial** (Heavy default for high-risk surface): parallel
  multi-lens — `reviewer` + `red-team-reviewer` + `spec-compliance-reviewer`
  (and `architecture-taste-reviewer` if research-first lens triggers,
  `do-it-comments-discipline` lens if comments changed). Use when:
  - Heavy tier with breaks_interface, crosses_packages, security-sensitive
    code, or migrations
  - Any tier when explicitly requested

### Picking intensity

Default by tier + dimensions:

- tier=Light, touches_code=1 → review-quick (inline self-review at
  verification-gate)
- tier=Standard → review-deep
- tier=Heavy + (breaks_interface=1 OR crosses_packages=1 OR
  security/migration tag) → review-adversarial
- tier=Heavy other → review-deep + comments-lens

### Inline self-review prompt (review-quick)

Parent agent runs this prompt internally without spawning a subagent:

> Review the diff above for: (a) any obvious correctness regression, (b)
> missing tests if behavior changed, (c) error handling at boundaries, (d)
> comment discipline violations (5 allowed categories: type annotations /
> @anchor: / see also: / invariant: / tool directives — flag any narrative or
> task-reference comments). Output: any Blocking findings only (skip
> Important / Nice). Then emit the marker on **its own line, line-anchored**
> (no leading prose on the same line) so the verification-gate can see it:
> use `inline-review: clean` when no findings, or
> `inline-review: <one-line finding>` to flag a single Blocking issue.
> The legacy form `inline-review-clean: yes` is also accepted.

The `verification-gate` Stop hook only honors the marker when it appears at
the start of a line in the latest assistant text — embedding the token in
running prose will not pass the gate.

If the parent agent has < 5KB diff context, inline self-review fits
comfortably; for larger diffs, escalate to review-deep.

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
- Review budget should follow risk. Do not spawn a multi-agent review stack for
  Light/docs-only work, and do not add overlapping reviewers when one focused
  lens covers the credible failure mode.
- Style-only comments need maintenance or correctness impact to be findings.
- If evidence is blocked, return `Needs more evidence` instead of inventing certainty.

## Closeout Gate

Review is not clean while unresolved `Blocking` or `Important` findings remain. Blocking/Important fixes need a closure record that includes cause and prevention, not only code changes.
Deferred `Opportunity` findings must be explicit and non-blocking.
