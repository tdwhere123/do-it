# Review Lenses

Detail for `do-it-review` and audit slices. Contents: review axes; proof path
coverage; what not to report; maintainability lens; comments lens; dependency
choice lens; change sizing; verifying the verification; depth; QA intake;
review rules.

Rank **Spec** and **Standards** independently. Load an extra lens only when a
concrete failure mode could change the call; do not turn a local review into a
multi-axis ceremony.

## Review Axes

**Spec** — against the user's goal, settled decisions, boundary, acceptance,
non-goals, and named deferrals, or a minimal extracted acceptance when nothing
was written down.

**Standards** — on the changed cone:

- **Causal authority:** the semantic owner of the fact moved, not a downstream copy
- **Contract fallout:** APIs, schemas, CLIs, generated outputs, docs, consumers still agree
- **Stateful failures:** Identity / Interleaving / Commit / Amplification / Copies when those faces trigger ([`stateful-change-scan.md`](stateful-change-scan.md))
- **Proof quality:** tests and commands prove the claim, or they mock away the risky collaborator chain

Optional deep checks (not a second ranking axis):

- **Correctness:** wrong behavior on real inputs, state, timing, failure paths
- **Maintainability:** see the maintainability lens below

## Proof Path Coverage

Before line-by-line review, prove the delivered surface connects to the goal:

- **Source coverage:** every goal, decision, boundary, and acceptance item, plus named deferrals, is implemented, satisfied with evidence, or explicitly deferred.
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

## What Not To Report

A finding should change a decision. Do not report style or naming preference
without a concrete cost, an unreachable hypothetical, a suspicious name, TODO,
or file size by itself, a preferred layering pattern, or a duplicate of another
finding. Before reporting, look for the evidence that would refute it: another
valid producer, an intentional policy, an earlier guard, or a different owner.
Speculative warnings teach readers to ignore the review.

## Maintainability Lens

**When:** a change or audited slice adds or keeps an abstraction, export,
dependency, parallel implementation, or scaffolding — or an advisory hook flags
a related family (`no-consumer`, `copy-paste`, `case-list`, `edit-bloat`,
comment/YAGNI families). For a relevant family, emit a finding or a short
rebuttal. Family definitions: [`write-quality-families.md`](write-quality-families.md).

Find dead or unreachable code and unconsumed exports, checking dynamic
registration, reflection, plugins, package exports, generated consumers, and
externally delivered APIs before calling them unused. Search absence alone is
insufficient evidence for deletion.

Look for redundant mechanisms and parallel implementations of the same rule,
including near-copies left by separate agent sessions; unnecessary abstractions,
forwarding wrappers, speculative configuration, state, and obsolete
compatibility paths; and hand-rolled behavior that existing primitives can
replace. Judge split and control-flow cost by how many places a maintainer must
understand or change together. Reader load is those places plus hidden or
mutable state the reader must hold; line count is a proxy. A flat file of many
globals can cost as much as a pass-through adapter stack. Keep a pass-through
that is a needed contract, policy, dependency, or compatibility boundary;
current-branch repetition alone is not that need. Naming,
types, errors, and tests matter when they obscure contracts, hide failures, or
make safe changes harder.

Support deletion, merge, or reuse with concrete consumer and contract evidence
and a maintenance cost; a runtime defect is not required. Preserve security and
trust validation, business behavior, accessibility, error guarantees, and actual
compatibility commitments. A single consumer alone does not justify inlining or
removal. An independent `code-quality-cleaner` can assess necessity.

## Comments Lens

**When:** a changed comment could affect maintainability, an invariant, or a
user-facing instruction. Do not create a comment review ritual for unrelated
code changes.

Loads comment rules from [`causal-change.md`](causal-change.md) § Comments. Finding shape: severity / location / cause class / required fix. Cause classes: `what` / `history` / `task-ref` / `tombstone` / `orphan-todo` / `fix-narrative` / `stale-invariant` / `broken-reference`.

`write-quality-lint.sh` is an advisory pre-filter; the lens is source of truth even when the hook is clean.

## Dependency Choice Lens

**When:** a change, plan, or audited slice introduces a dependency, datastore,
framework, runtime, or protocol. Check evidence of repository constraints,
compatibility, maintenance activity, license, operational fit, and the
recommendation, using relevant primary sources. Compare viable candidates when
the choice is open. The owner is [`decision-resolvers.md`](decision-resolvers.md#research-first-surfaces).
Report unsupported recommendations or material evidence gaps; severity follows
the risk, not whether a search action or report artifact exists.

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
- mock-only / synthetic collaborator chains cannot close a live-path claim;
- tests were not special-cased, weakened, or rewritten to match the change.

## Depth

Use independent contexts when fresh evidence or separate conclusions can improve
the call; one reviewer can carry several lenses. Choose lenses by their concrete
value. For release/workflow/policy work, start with the changed behavior and
install/release readiness. Add another lens only for a concrete migration,
security, public-interface, state, or architecture risk. Judge a delegated review
by its evidence and coverage, not a worker label. The parent integrates the
result.

## QA Intake

When the user reports bugs conversationally rather than with a prepared diff,
let them describe the problem, ask only the clarifying questions that change the
diagnosis (expected versus actual, reproduction, impact), and explore the code
for domain language instead of asking answerable questions. Decide whether it is
one issue or several, then write durable issue text from the user's perspective
with reproduction, scope, and acceptance. Create external issues only when the
user asks or the repository workflow owns creation.

## Review Rules

- Missing or stale evidence of the live path, applicable stateful failures, readiness, or final verification is a finding when it can hide contract, operator, or evidence-drift bugs.
- Missing decision coverage: a user decision, requirement, or named contract item absent without deferral or evidence.
- Unreachable new code is a finding even if unit tests pass.
- Partially wired producer → contract → transport → consumer → surface is a finding.
- A closeout that overclaims or hides `NOT_VERIFIED` work is a finding.
- Do not review from commit messages alone; do not auto-fix on review-only request.
- Dependency changes need current package/source evidence.
- Dead-code removal must prove old path not referenced by runtime, install, generated, or docs surfaces.
