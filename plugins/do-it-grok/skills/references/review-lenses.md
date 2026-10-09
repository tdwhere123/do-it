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
- **Maintainability:** concrete reasoning or change costs from avoidable coupling, dead code, redundant mechanisms, unclear ownership, or abstractions that scatter a single change across layers. Support simplification with consumer and contract evidence; a single consumer alone does not justify inlining or removal.

## Proof Path Coverage

Before line-by-line review, prove the delivered surface connects to the goal:

- **Source coverage:** every Goal, Decisions, Boundary, and Acceptance item, plus named deferrals, is implemented, satisfied with evidence, or explicitly deferred. Grill notes and brainstorm `Must Resolve` items are legacy artifacts — use them only when a repo still has them; they are not required Spec sources.
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

Bounded causal walk: [`scope-chain.md`](scope-chain.md).

## Change Sizing

Large diffs mixing policy, behavior, generated output, docs, and cleanup need
reviewable units. If a unit cannot be reviewed with available context, identify
the remaining scope, the missing evidence, and the next discriminating check.
Reuse valid current evidence so a follow-up can continue without restarting.

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

Loads comment rules from [`causal-change.md`](causal-change.md) § Comments. Finding shape: severity / location / cause class / required fix. Cause classes: `what` / `history` / `task-ref` / `tombstone` / `orphan-todo` / `fix-narrative` / `stale-invariant` / `broken-reference`.

`write-quality-lint.sh` is an advisory pre-filter; the lens is source of truth even when the hook is clean.

## Research-First Lens (Audit Only)

**When:** The plan or diff introduces new dependency, datastore, framework, runtime, or protocol.

Loads `architecture-strategist` / plan research trail when present. **Audit duty only:** verify evidence of repository constraints, compatibility, maintenance/activity, license, operational fit, and the recommendation, using relevant primary sources. Compare viable candidates when the choice is open; ask the user only when a preference changes the selected route. The owner is [`decision-resolvers.md`](decision-resolvers.md#research-first-surfaces); no candidate quota or universal confirmation requirement applies.

Report unsupported recommendations or material evidence gaps. Severity follows the risk, not whether a search action or report artifact exists.

## YAGNI Lens

**When:** a diff adds an abstraction, export, dependency, or `Phase 2`
scaffolding — or an advisory hook flags a related family on changed files
(`no-consumer`, `copy-paste`, `case-list`, `edit-bloat`, comment/YAGNI
families). Use the lens when the signal could change the design; do not force a
formal rebuttal for a clearly inapplicable advisory.

For a relevant L0 family, emit a finding or a short rebuttal. Family
definitions: [`write-quality-families.md`](write-quality-families.md).

An independent `code-quality-cleaner` can assess maintainability and necessity.
Explain useful simplifications with their evidence and practical consequence.

## Depth (no multi-reviewer pipeline)

Use independent contexts when fresh evidence or separate conclusions can improve
the call. Choose lenses by their concrete value; no fixed reviewer count applies.

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

- Missing or stale evidence of the live path, applicable stateful failures, readiness, or final verification is a finding when it can hide contract, operator, or evidence-drift bugs.
- Missing decision coverage: user decision, requirement, or named contract item absent without deferral or evidence. Grill / brainstorm leftovers are not required Spec sources.
- Unreachable new code is a finding even if unit tests pass.
- Partially wired producer → contract → transport → consumer → surface is a finding.
- Evidence Ledger overclaims or hides `NOT_VERIFIED` work.
- Do not review from commit messages alone; do not auto-fix on review-only request.
- Dependency changes need research-first trail or current package/source evidence.
- Dead-code removal must prove old path not referenced by runtime, install, generated, or docs surfaces.
