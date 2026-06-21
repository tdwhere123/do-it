---
name: do-it-review-loop
description: "Use when a delivered diff or worker result needs PR-style correctness review before the parent accepts it."
---

# Do-It Review Loop

## Purpose

Use this to find defects, scope drift, and maintainability risk before closeout.
Review is findings-first and evidence-backed.

**Mandatory trigger:** when tier is Heavy OR the prompt signals an interface-breaking change (router writes `dim_needs_review_loop=1`), this skill is required **before any "done" claim** — it does not apply to planning, grill, or discussion turns. The `verification-gate` Stop hook enforces the done-claim case: a transcript without a `review-loop` / `review-quick` / `review-deep` / `review-adversarial` mention will be blocked. See `do-it-router` § Mandatory-trigger escape clauses for the full contract. The fix path also runs on the complete finding batch — see `do-it-fix-loop` § Batch vs Pointwise Decision, which operates on the list emitted by the "Emit findings as a complete batch" step below.

## Tiers

### Light

Use for tiny mechanical edits. The parent reads the diff, checks scope, and
records any concrete issue. Docs-only Light work stays local unless it changes
published install, release, or workflow policy.

### Standard

Use for non-trivial task work and all subagent review assignments unless
explicitly assigned otherwise.

1. Freeze the review scope: task, commit, range, PR, or changed files.
2. Start from the goal and coverage contract: user request, plan/task card,
   grill decisions, brainstorm handoff, requirements, and explicit deferrals.
3. Map the proof path before reading local snippets: producer -> contract/event/schema -> transport/client -> state/query -> surface/operator action -> verification.
4. Read the actual diff and relevant current files, then verify the changed
   code is reachable through that proof path.
5. Check the failure-mode forecast, proof path map, readiness target, and final evidence expectations when they exist.
6. If an Evidence Ledger exists, check that every delivered claim has the right
   readiness target, truth plane, and current evidence row.
7. Check requirements before quality polish when a plan or task card exists.
8. Report only confirmed issues or clearly labeled uncertainty.
9. **Emit findings as a complete batch** — produce the full list (`Blocking` / `Important` / `Opportunity`) in a single return, ordered by severity. Do not stream findings one-by-one; fix-loop depends on seeing the whole list to detect shared root causes.
10. Use at most one focused reviewer when the risk is not locally reviewable; otherwise the parent performs local review.
11. Send the complete `Blocking` and `Important` set to `do-it-fix-loop`; fix-loop will run its Batch vs Pointwise Decision on the full list before editing.

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

### YAGNI lens

Available at Standard tier (optional) and Heavy tier (default when the diff adds
a new abstraction, export, dependency, or `Phase 2` scaffolding). Loads
`code-quality-cleaner` (maintainability + over-engineering against the decision
ladder, see `do-it-router` § Restraint). Returns one-line findings using its
closed tag vocabulary (`delete:` / `stdlib:` / `native:` / `yagni:` / `shrink:`),
each carrying a severity, plus a quantified `net: -<N> lines possible` /
`Lean already. Ship.` verdict. The `anti-patterns-lint.sh` PostToolUse hook is an
advisory write-time pre-filter for the unreferenced-export case; the lens is the
source of truth and catches single-use abstractions the hook cannot see.

## Review intensity (graduated)

Review intensity is the canonical axis for deciding how much review effort to
spend. It is risk-selected, not a synonym for routing tier:

- review-quick covers local parent review.
- review-deep covers one focused reviewer subagent.
- review-adversarial covers multi-lens review.

If the per-tier text and an intensity description ever appear to disagree,
pick the smallest intensity that covers the concrete failure modes and name why
it was used or skipped.

Review intensity is orthogonal to the tier:

- **review-quick** (Light + touches_code, or Standard + low risk): no subagent.
  Parent agent runs an inline self-review prompt over the diff. Fast, no
  context-handoff overhead. Use when:
  - Light tier with code edits (verification-gate auto-fires)
  - Standard tier modification map with no new dependency / interface change

- **review-deep** (Standard with a named non-local risk, or Heavy + low risk):
  one reviewer subagent (`reviewer`). Standard finding shape. Use when:
  - Standard tier with breaking-interface / new module / cross-package signal
  - Standard tier when the user explicitly asks for review or subagents
  - Heavy tier without high-risk lenses

- **review-adversarial** (Heavy default for high-risk surface): parallel
  multi-lens — `reviewer` + `red-team-reviewer` + `spec-compliance-reviewer`
  (and `architecture-taste-reviewer` if research-first lens triggers,
  `code-quality-cleaner` if the diff adds new abstraction/export surface,
  `do-it-comments-discipline` lens if comments changed). Use when:
  - Heavy tier with breaks_interface, crosses_packages, security-sensitive
    code, or migrations
  - Any tier when explicitly requested

### Picking intensity

Default by tier + dimensions:

- tier=Light, touches_code=1 → review-quick (inline self-review at
  verification-gate)
- tier=Standard + low/local risk → review-quick
- tier=Standard + named non-local risk, explicit review, or explicit subagent
  request → review-deep
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

## Review Axes

Check every non-trivial diff through five axes before spending time on polish:

- Requirements: does it satisfy the task, non-goals, and acceptance evidence?
- Correctness: can the changed behavior be wrong on real inputs, state, timing,
  or failure paths?
- Contracts: do APIs, schemas, CLIs, generated outputs, docs, and consumers
  agree?
- Maintainability: did the change add avoidable coupling, dead code, duplicate
  logic, unclear ownership, or a single-use / speculative abstraction the
  decision ladder would inline? (the YAGNI lens / `code-quality-cleaner` owns
  the over-engineering call)
- Verification: do the tests and commands actually prove the claim, or did they
  mock away the risky collaborator chain?

### Proof Path Coverage

Before line-by-line review, prove the delivered surface is connected to the
goal:

- Source coverage: every request, acceptance item, grill decision, and
  brainstorm `Must Resolve` item is implemented, already satisfied with
  evidence, or explicitly deferred by the user.
- Live path: new or changed producer logic is reachable from the intended
  command, route, package export, UI/operator action, or runtime entrypoint.
- Consumer path: schemas, events, generated outputs, docs, or clients that
  depend on the change agree with the new behavior.
- Verification path: tests or checks exercise the real collaborator chain
  enough to prove the readiness target.

Finding classes to use:

- `source-coverage gap`: a requirement or decision vanished between discussion,
  plan, and diff.
- `unwired implementation`: code exists but no live entrypoint or consumer can
  reach it.
- `unused delivered surface`: new API/type/file/export is written but not used
  or exposed by the promised workflow.
- `synthetic proof`: tests pass while mocking away the collaborator chain that
  would fail in real use.

These are correctness findings when they can make the delivered work wrong,
unused, or unverifiable.

### Change Sizing

Large diffs are harder to review honestly. When a diff mixes unrelated policy,
behavior, generated output, docs, and cleanup, first identify the reviewable
units. If a unit cannot be reviewed with the available context, return `Needs
more evidence` instead of scanning loosely.

### Verify The Verification

Review the evidence itself:

- command ran on the current branch/worktree;
- command covers the changed surface rather than only a nearby unit;
- generated files were produced by scripts, not hand-edited;
- install or package claims use temp-home or package checks when relevant;
- evidence proves the stated truth plane, not only an adjacent source,
  worktree, package, live install, or host-behavior surface;
- passing tests are not the only proof when contract or docs-truth changed.

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
- Missing decision coverage is a review finding. Do not accept a diff where a
  user decision, requirement, or brainstorm handoff item is absent unless the
  user explicitly deferred it or current evidence proves it was already
  satisfied.
- New code that is not reachable from the promised workflow is a finding even
  if the local unit tests pass.
- A producer -> contract -> transport -> consumer -> surface path that is only
  partially wired is a finding even when each local piece exists.
- Evidence Ledger rows that overclaim readiness, omit truth planes, or hide
  `NOT_VERIFIED` work are findings.
- Do not review from commit messages alone.
- Do not auto-fix when the user asked for review-only work.
- Tests passing do not replace review.
- Review budget should follow risk. Do not spawn a multi-agent review stack for
  Light/docs-only work, and do not add overlapping reviewers when one focused
  lens covers the credible failure mode.
- Style-only comments need maintenance or correctness impact to be findings.
- If evidence is blocked, return `Needs more evidence` instead of inventing certainty.
- Dependency changes require a research-first trail or current package/source
  evidence.
- Dead code removal must prove the old path is not still referenced by runtime,
  install, generated, or docs surfaces.

## Closeout Gate

Review is not clean while unresolved `Blocking` or `Important` findings remain.
When a confirmed Blocking or Important issue is fixable in the assigned scope,
send it to `do-it-fix-loop` now; do not leave it for a later version unless the
user explicitly confirms the deferral or the fix crosses an unassigned
boundary. Blocking/Important fixes need a closure record that includes cause and
prevention, not only code changes. Deferred `Opportunity` findings must be
explicit and non-blocking.

## Common Rationalizations

- *"Tests pass, so review can be shallow."* — Tests are one evidence source;
  review still checks scope, contracts, maintainability, and proof quality.
- *"This is generated output."* — Generated output can drift; verify the script
  path and source of truth.
- *"This cleanup is obviously dead."* — Dead-code claims need reference or
  runtime evidence, especially across install and plugin surfaces.

## Red Flags

- The review quotes commit messages instead of diff or file evidence.
- Findings are mostly style comments while contract or verification risk is
  unexamined.
- The review starts from changed lines and never checks whether the work is
  reachable from the user goal.
- A new function, route, command, or export is accepted without a caller,
  surface, or verification witness.
- A broad diff is reviewed as one blob with no sizing or ownership split.
- A dependency, framework, protocol, or datastore appears without current
  source evidence.
- The review accepts pre-merge or worker evidence as the final integrated proof.

## Verification

Before calling review clean:

- review scope is frozen to files, commit, range, or task;
- the five axes were checked at the depth the tier requires;
- verification evidence was inspected for freshness and surface coverage;
- generated, install, dependency, and dead-code claims have direct proof when
  present;
- no `Blocking` or `Important` finding remains unresolved or un-rechecked.
