# do-it Routing Matrix

> **Maintainer policy.** Runtime truth comes from the canonical skills in
> `skills/do-it/`, shell hooks in `hooks/`, and generated plugin bundles. This
> page describes their intended relationship; it is not a mandatory per-turn
> workflow.

## Product Contract

`do-it` exposes eight user/runnable skills: five core capabilities plus three
persistence or maintenance skills, along with ten portable agents. The generated
`_index.md` is one discovery entry, not a ninth capability.

| Capability | Canonical skill | Use when |
| --- | --- | --- |
| Route | `do-it-router` | A non-trivial repository task begins |
| Write defense | `do-it-code-quality` | Designing or editing code |
| Decide | `do-it-decide` | A premise, option, dependency choice, or durable handoff changes the route |
| Review / repair | `do-it-review` | A delivered diff needs correctness/spec review or targeted repair |
| Verify / close | `do-it-verify` | A done, fixed, ready, install, merge, or closeout claim is about to be made |
| Active context | `do-it-context` | Terms, invariants, or relationships are drifting |
| Stable handbook | `do-it-handbook` | Stable project truth is repeatedly rediscovered or the user asks to scaffold it |
| Maintain skills | `do-it-skill-authoring` | A do-it skill or its host packaging changes |

The router chooses **Light / Standard / Heavy** to adjust scrutiny, then selects
only the meaningful capability needed. It never imposes a fixed chain.

## Tiers

| Tier | Use when | Default posture |
| --- | --- | --- |
| Light | Mechanical, docs-only, question-shaped, or local bounded work | Inspect → act → targeted check. No routine grill or quality reminder. |
| Standard | Ordinary behavior/design work | Use code quality while writing; add decide/review only when their trigger is real. |
| Heavy | Cross-boundary, interface, security, migration, release, multi-agent, or irreversible closeout | Pressure-test the load-bearing route, map the proof path, and use risk-matched review. |

Router dimensions (`dim_touches_code`, `dim_crosses_packages`,
`dim_breaks_interface`, `dim_needs_tdd`, `dim_needs_review_loop`) are cheap
signals, not a second workflow. Missing state must degrade to minimal advisory
behavior rather than block work.

## Meaning-First Delivery

### Code-quality mode

Before a non-local edit, name the premise, blast radius, and bounded
producer → consumer proof path. Prefer existing depth over new wrappers,
behavioral tests over mock fiction, and diagnosis over repeated patches.

Public/schema/API or cross-package work additionally needs ownership,
dependency direction, compatibility/rollback impact, and both-side proof.
Separate worktrees are for genuinely parallel, risky, or conflicting work; the
parent owns shared files and integration.

### Decide mode

Use Grill only when a premise or user preference gates the route. Read local
facts first; ask one user-owned decision at a time with options and a recommended
default. Use Diverge only when viable alternatives are truly unclear. Write a
plan card only when a later worker/session needs its acceptance and proof notes.

For a permanent external surface (dependency, datastore, framework/runtime, or
protocol), research repository constraints and compare at least two viable
candidates for compatibility, maintenance, license, and operational fit before
recommending one.

### Review and verification modes

Review standards/conventions and specification fidelity independently. Match the
number of reviewer lenses to concrete failure modes—not a ceremony count. A
reviewer name or marker is never proof.

A closeout claim needs fresh, relevant current-worktree evidence. The correct
output without proof is `NOT_VERIFIED` with the missing check and next action;
do not run or cite an unrelated command merely to satisfy a gate.

## Delegation

Delegation has no standalone skill. The parent prompt itself supplies the full
**Delegation Contract**: tier and lens, scope and non-goals, write ownership and
restricted paths (or explicit read-only), facts to verify, proof target, stop
condition, and a compact `DONE | NEEDS_CONTEXT | BLOCKED` return schema.
Portable agent definitions do not rely on a repository-relative instruction
link. A worker returns `NEEDS_CONTEXT` with the missing fields before inspection
or edits when the parent contract is incomplete.

Workers do not self-escalate to Heavy, expand into unassigned boundaries, commit,
merge, or revert peer work by default. The parent owns integration and final
claims.

## Host Delivery

| Host | Distribution | Skills | Verification behavior |
| --- | --- | --- | --- |
| Codex | Marketplace-first plugin; optional CLI migration/doctor | All eight + generated discovery entry | Hard heuristic Stop check can block unsupported success claims |
| Claude Code | Marketplace-first plugin | All eight + generated discovery entry | Hard heuristic Stop check can block unsupported success claims |
| Cursor | Local copy / Team Import today; public listing pending | All eight + generated discovery/reference files | Hard heuristic Stop check can block unsupported success claims |
| OpenCode | Local `opencode.json` registration today; npm publication pending | All eight + generated discovery entry | Per-message routing/grill and idle verification are advisory/soft |

No host registers `grill-pretool` or a pre-edit plan gate. `write-quality-lint`
is advisory everywhere. The adapter matrix documents exact events and capability
limits: [`harness-adapter-matrix.md`](harness-adapter-matrix.md).

## Maintainer Checks

After a cross-skill or host change:

```bash
node scripts/check-skill-links.mjs
node scripts/validate-legacy-names.mjs
node scripts/validate-quality-families.mjs
node scripts/validate-harness-matrix.mjs
npm test
```

Regenerate artifacts from source; never hand-edit plugin skill/agent bundles or
OpenCode `dist/`.
