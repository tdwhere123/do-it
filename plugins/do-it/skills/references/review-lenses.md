# Review Lenses

Detail for `do-it-review`. Rank **Spec** and **Standards** independently. Load
an extra lens only when a concrete failure mode in the diff could change the
call; do not turn a local review into a five-axis ceremony.

## Review Axes

**Spec** — against the active contract, or a minimal extracted acceptance if
there is no file:

- Goal, Decisions, Boundary, Acceptance, named deferrals
- **Requirements:** task, non-goals, acceptance evidence, explicit deferrals

**Standards** — on the changed cone:

- **Causal authority:** the semantic owner of the fact moved, not a downstream copy
- **Contract fallout:** APIs, schemas, CLIs, generated outputs, docs, consumers still agree
- **Stateful failures:** Identity / Interleaving / Commit / Amplification / Copies when those faces trigger ([`stateful-change-scan.md`](stateful-change-scan.md))
- **Proof quality:** tests and commands prove the claim, or they mock away the risky collaborator chain

Optional deep checks (not a second ranking axis):

- **Correctness:** wrong behavior on real inputs, state, timing, failure paths
- **Maintainability:** avoidable coupling, dead code, duplicate logic, unclear ownership, single-use abstractions the decision ladder would inline (`do-it-code-quality` for module depth; YAGNI lens for over-engineering)

## Proof Path Coverage

Before line-by-line review, prove the delivered surface connects to the goal:

- **Source coverage:** every request, acceptance item, grill decision, brainstorm `Must Resolve` item is implemented, satisfied with evidence, or explicitly deferred.
- **Live path:** changed producer logic reachable from intended command, route, export, UI action, or runtime entrypoint.
- **Consumer path:** schemas, events, generated outputs, docs, clients agree with new behavior.
- **Verification path:** tests/checks exercise the real collaborator chain for the readiness target.

Finding classes:

| Class | Meaning |
| --- | --- |
| `source-coverage gap` | Requirement vanished between discussion, plan, and diff |
| `unwired implementation` | Code exists but no live entrypoint or consumer reaches it |
| `unused delivered surface` | New API/type/export not used by promised workflow |
| `synthetic proof` | Tests pass while mocking the chain that would fail in real use |

These are correctness findings when they make work wrong, unused, or unverifiable.

Path chain definition: [`workflow-kernel.md`](workflow-kernel.md) § Path Map Chain.

## Change Sizing

Large diffs mixing policy, behavior, generated output, docs, and cleanup: identify reviewable units first. If a unit cannot be reviewed with available context, return `Needs more evidence` instead of loose scanning.

## Verify The Verification

Inspect evidence itself:

- command ran on current branch/worktree after the last edit;
- command covers changed surface, not only a nearby unit;
- generated files from scripts, not hand-edited;
- install/package claims use temp-home or package checks when relevant;
- evidence proves stated truth plane;
- passing tests alone insufficient when contract or docs-truth changed;
- mock-only / synthetic collaborator chains cannot close a live-path claim.

## Comments Lens

**When:** a changed comment could affect maintainability, an invariant, or a
user-facing instruction. Use it when that risk is present; do not create a
comment review ritual for unrelated code changes.

Loads comment rules from `do-it-code-quality` § Comments. Finding shape: severity / location / cause class / required fix. Cause classes: `what` / `history` / `task-ref` / `tombstone` / `orphan-todo` / `fix-narrative` / `stale-invariant` / `broken-reference`.

`comments-lint.sh` is advisory pre-filter; lens is source of truth even when hook is clean.

## Research-First Lens (Audit Only)

**When:** Heavy tier and plan/diff introduces new dependency, datastore, framework, runtime, or protocol.

Loads `architecture-strategist` / plan research trail when present. **Audit duty only:** verify the plan's Research trail exists — search action, ≥2 candidates with recency signals, user confirmation or `PENDING USER CONFIRMATION`. Rule body lives in `do-it-decide` plan-card guidance; do not re-derive candidate rules here.

Findings use standard shape. Memory-pick without fresh search is `Blocking`.

## YAGNI Lens

**When:** a diff adds an abstraction, export, dependency, or `Phase 2`
scaffolding — or an advisory hook flags a related family on changed files
(`no-consumer`, `copy-paste`, `case-list`, `edit-bloat`, comment/YAGNI
families). Use the lens when the signal could change the design; do not force a
formal rebuttal for a clearly inapplicable advisory.

For a relevant L0 family, emit a finding or a short rebuttal. Family
definitions: [`write-quality-families.md`](write-quality-families.md).

Loads `code-quality-cleaner` (maintainability + decision ladder from [`workflow-kernel.md`](workflow-kernel.md)). Tags: `delete:` / `stdlib:` / `native:` / `yagni:` / `shrink:` plus `net: -<N> lines possible` or `Lean already. Ship.`

## Depth (no multi-reviewer pipeline)

Default parent inline review. At most one independent reviewer when
independence could change the call. No fixed multi-reviewer pipeline and no
required lens count.

For release/workflow/policy work, start with the changed behavior and
install/release readiness when they fit. Add another lens only for a concrete
migration, security, public-interface, state, or architecture risk. Judge a
delegated review by its evidence and coverage, not a worker label. The parent
integrates the result.

## QA Intake Mode

When user reports bugs or conversational QA (not a prepared diff):

1. Let user describe in their words.
2. At most 2–3 clarifying questions (expected vs actual, repro, impact).
3. Explore codebase for domain language; avoid file-path trivia.
4. Decide one issue vs several slices.
5. Write durable issue text from user perspective: what happened, expected, repro, scope, domain terms, acceptance criteria.

Create external issues only when user asks or repo workflow owns creation.

## Review Rules (Lens-Level)

- Missing/stale forecast, path map, readiness target, or final evidence is a finding when it can hide live-path, state, contract, operator, or evidence-drift bugs.
- Missing decision coverage: user decision, requirement, or brainstorm item absent without deferral or evidence.
- Unreachable new code is a finding even if unit tests pass.
- Partially wired producer → contract → transport → consumer → surface is a finding.
- Evidence Ledger overclaims or hides `NOT_VERIFIED` work.
- Do not review from commit messages alone; do not auto-fix on review-only request.
- Dependency changes need research-first trail or current package/source evidence.
- Dead-code removal must prove old path not referenced by runtime, install, generated, or docs surfaces.

## Common Rationalizations And Red Flags

- *"Tests pass, review can be shallow."* — Still check Spec and Standards independently: scope, contracts, stateful failures, proof quality.
- *"Obviously dead cleanup."* — Need reference or runtime evidence across install/plugin surfaces.
- *"Standards look clean, so Spec can be assumed."* — Axes do not substitute for each other.
- Review quotes commits not diff; style-only while contract risk unexamined; never checks reachability from user goal; broad diff reviewed as one blob; dependency without source evidence; accepts stale, other-worktree, irrelevant, or mock-only evidence as final proof.
