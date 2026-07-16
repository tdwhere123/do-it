# do-it Routing Matrix

> **Maintainer policy.** Runtime truth comes from the canonical skills in
> `skills/do-it/`, shell hooks in `hooks/`, and generated plugin bundles. This
> page describes their intended relationship; it is not a mandatory per-turn
> workflow.

## Product Contract

`do-it` exposes nine user/runnable skills: five core capabilities plus three
persistence or maintenance skills and one on-demand retrospective capability,
along with ten portable agents. The generated `_index.md` is one discovery
entry, not a tenth capability.

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
| Retrospect | `do-it-retrospective` | User explicitly requests opt-in local feedback status, a report, or a confirmed lesson |

The router supplies an advisory **Light / Standard / Heavy** risk label, then
the model selects only the meaningful capability needed. Direct user intent and
the model's reading of the task take precedence over keyword classification;
the router never imposes a fixed chain or a permission gate.

## Tiers

| Tier | Use when | Default posture |
| --- | --- | --- |
| Light | Mechanical, docs-only, genuinely informational, or local bounded work | Inspect → act → targeted check. No routine grill or quality reminder. |
| Standard | Ordinary behavior/design work | Use code quality while writing; add decide/review only when their trigger is real. |
| Heavy | Cross-boundary, interface, security, migration, release, or irreversible closeout | Pressure-test the load-bearing route, map the proof path, and use risk-matched review. |

Router dimensions (`dim_touches_code`, `dim_crosses_packages`,
`dim_breaks_interface`, `dim_needs_tdd`, `dim_needs_review_loop`) are cheap
signals, not a second workflow. They may inform depth but never override a
direct request to act or delegate. Missing state degrades to minimal advisory
behavior rather than block work.

## Meaning-First Delivery

### Code-quality mode

For a non-local edit, identify the premise, blast radius, and bounded
producer → consumer proof path when they affect the design or proof. Prefer
existing depth over new wrappers, behavioral tests over mock fiction, and
diagnosis over repeated patches.

Public/schema/API or cross-package work often benefits from ownership,
dependency direction, compatibility/rollback impact, and both-side proof.
Separate worktrees are for genuinely parallel, risky, or conflicting work; the
parent owns shared files and integration.

### Decide mode

Use Grill only when a premise or user preference gates the route. Read local
facts first; ask only for a material user-owned decision, and offer options or
a recommended default only when they change the route. Use Diverge only when
viable alternatives are truly unclear. Write a
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

Delegation has no standalone skill or mandatory contract. Bundled agents are
optional capability experts: use one when an independent map, review, or
specialist view improves the work, especially after a direct user request.
Give a worker the goal, any necessary ownership or side-effect boundary, and the
useful result or evidence; add context only when the slice needs it.

Workers operate autonomously within the assigned slice, report useful evidence
or uncertainty, and do not commit, merge, or revert peer work by default. The
parent owns integration and final claims. There is no fixed agent count or role
matrix. User-defined global agents are separate from the plugin-owned bundle and
are not part of its managed inventory.

## Host Delivery

| Host | Distribution | Skills | Verification behavior |
| --- | --- | --- | --- |
| Codex | Marketplace-first plugin; optional CLI migration/doctor | All nine + generated discovery entry | Advisory completion reminder; `do-it-verify` supplies claim-specific proof |
| Claude Code | Marketplace-first plugin | All nine + generated discovery entry | Advisory completion reminder; `do-it-verify` supplies claim-specific proof |
| Cursor | Local copy / Team Import today; public listing pending | All nine + generated discovery/reference files | Advisory completion reminder; `do-it-verify` supplies claim-specific proof |
| OpenCode | Local `opencode.json` registration today; npm publication pending | All nine + generated discovery entry | Advisory completion reminder; `do-it-verify` supplies claim-specific proof |

No host registers `grill-pretool` or a pre-edit plan gate. `write-quality-lint`
and `verification-gate` are advisory everywhere; `do-it-verify` remains the
claim-specific proof discipline. The adapter matrix documents exact events and
capability limits: [`harness-adapter-matrix.md`](harness-adapter-matrix.md).
The feedback recorder is default-off and the Claude strict external-action
profile is opt-in; neither changes normal routing.

## Maintainer Checks

After a cross-skill or host change:

Keep behavior at real seams: add a focused regression when routing, action
boundaries, agent ownership, or host integration changes. `npm test` is the
integrated check; do not substitute a static prompt-card inventory for host or
hook behavior.

```bash
node scripts/check-skill-links.mjs
node scripts/validate-legacy-names.mjs
node scripts/validate-quality-families.mjs
node scripts/validate-harness-matrix.mjs
npm run validate:core-skill-boundaries
npm test
```

Regenerate artifacts from source; never hand-edit plugin skill/agent bundles or
OpenCode `dist/`.
