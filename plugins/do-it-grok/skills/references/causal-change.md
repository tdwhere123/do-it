# Causal Change

Detail behind the causal ownership and evidence guidance in `do-it-code-quality`.
Load this when a concrete question needs more detail on scope, structural
preparation, feedback construction, comments, worktrees, merges, mocks, or
optimization. These details supplement the principles in do-it-core.

## Causal Cone

Allowed edits are the authority/root cause, required contract fallout, and
the proof path. Nearby files, leftover cleanup, and “while we are here”
refactors are not the cone.

Map only the hops that can change this outcome:

```text
producer -> contract/event/schema -> transport/client -> state/query -> surface/operator action -> verification
```

Bounded causal walk: [`scope-chain.md`](scope-chain.md).

## Smallest Structurally Correct Change

Not the shortest diff and not the fewest files:

```text
root cause / semantic authority
+ minimum fallout the contract still requires
+ the feedback path that can prove the change
```

Prefer existing capabilities before a new abstraction. Judge adapters and
wrappers by the contracts they preserve and the reasoning or change costs they
add, not their consumer count. Preserve necessary compatibility, validation,
and ownership boundaries; remove unsupported scaffolding or forwarding layers
only when evidence supports simplification. Reuse a live path before forking a
second home for the same truth.

**Phases, not piles:** keep compute, apply/persist, and audit/side-effect in
separate phases when mixing them would block a local durable change.

## Replace and Bypass Tests

- **Replace test:** if this layer were replaced, would the rule still hold? If
  yes, this layer is usually not semantic authority.
- **Bypass test:** can a legitimate mutation path change the fact without
  passing here? If yes, this layer cannot uniquely enforce the invariant.

Escalate to `do-it-architecture` when authority is duplicated, ambiguous,
public/persisted, recovery-sensitive, or cutover is load-bearing. A copy may
optimize access; it must not become a competing authority.

## Patch-or-Prepare Gate

If the correct authority point can be fixed and proven locally, patch — do
not restructure.

Prepare first only when:

- the rule is scattered across callers with no single semantic owner;
- the fix would add another bypass around the honest path;
- no durable public seam exists, so tests can only mock internals;
- the same rule is independently restated rather than propagated;
- the same symptom has already been patched and recurred.

Prepare keeps behavior. Change alters acceptance. Do not mix them in one
unverifiable step.

## Feedback Construction

TDD is how feedback is built at a real seam, not a ceremony.

- Behavior changes and a durable public seam is cheap → RED before GREEN,
  one vertical slice.
- No correct seam → best available probe, and name the proof gap.
- Tests observe public behavior. Expected truth must not be computed by the
  same algorithm under test.
- Mocking away the producer→consumer chain under proof is test fiction —
  tighten or add a real-path check.
- Mechanical or docs-only edits may skip RED; say why.

For debugging, reproduce the symptom and trace the earliest causal divergence.
Use a discriminating observation to test the explanation, repair the responsible
owner, and verify the affected contract with regression evidence.

## Consolidation and Stop

Once evidence supports the correction, settle only accidental complexity on a
natural boundary inside the changed cone that is cheap to prove behavior-preserving.
Once causal closure is proven, stop. Do not tour adjacent cleanup.

Use independent specialists when their evidence or conclusions can improve the work. The parent integrates and verifies.

## Comments

Comments say what the next reader must know that code cannot. Allowed: tool
docstrings; `// @anchor:<id>`; `// see also: <path>`; `// invariant: ...`;
real tool directives with a reason. Forbidden: what-comments, history/fix
narrative, ticket refs, tombstones, orphan TODOs (need
`TODO(@owner): <closing condition>`).

Numeric comment/file-size families live in
[`write-quality-families.md`](write-quality-families.md); do not copy
thresholds here.

## Worktrees and Merges

Use a separate worktree only for genuinely parallel, risky, or conflicting
work — not a bounded one-thread change. The parent owns shared files and
integration.

Resolve merge conflicts hunk by hunk, by intent: trace each side to its
source and preserve both intents where they do not collide; where they do,
follow the merge's stated goal and note the trade-off. Do not resolve
indiscriminately with wholesale `--ours`/`--theirs`. If intent, authorization,
or a safe resolution is unavailable, pause for clarification or abort when
authorized and safe, preserving unrelated local work. Complete the operation
only when the resolution is justified, then run the project's checks.

## Optimization

Unknown is not impossible, but possibility is not proof. Measure a baseline,
keep a correct fallback, and run the cheapest falsifier before investing.
Promote only when observed results beat the baseline on the metric that
matters. A production-bound feature is not done until its evidence surface
(log, metric, or trace) is named.
