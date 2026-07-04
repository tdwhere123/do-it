---
name: do-it-brainstorm
description: "Map requirement shape and options through a product viewpoint and an architecture viewpoint before grill converges on decisions. Use when planning needs divergent option mapping, or when asked to brainstorm or 脑暴."
---

# Do-It Brainstorm

Diverge before grill converges: figure out what the requirement actually is and what shapes it could take, map the options, and hand the open decisions to `do-it-grill`. Brainstorm never settles the decision itself — any option that would change implementation direction leaves a `Must Resolve In Grill` item instead of being silently chosen.

Two viewpoints always inform the pass — a **product** viewpoint (requirement shape, product boundary, core goal, option tradeoffs) and an **architecture** viewpoint (foundation, extension modules, stage closure, boundaries, verification route). The viewpoints are fixed; how they run scales with tier (§ Tiers).

## The pass

1. **Pick the dominant branch.** Decide which question this turn is really about — product shape, architecture foundation, or a supplemental concern (UX / ops / security / domain). Route effort there instead of spraying it evenly across every axis. If the user is unreachable, state the assumption and proceed.
2. **Run the two viewpoints.** By default the parent reasons through both inline. Spawn them as independent read-only subagents only at Heavy tier or on explicit request (§ Fan-out).
3. **Map options along the decision ladder.** Lay each product or architecture option out along the ladder (see `do-it-router` § Restraint): skip-it → stdlib/native → existing dependency → minimal custom → full build. Bias divergence toward the subtractive and boring options, not only the additive and clever ones — the cheapest option that meets the goal usually wins.
4. **Diverge predictably.** Brainstorm's behaviour is fixed even when its tokens vary: surface genuinely different options (not three variations of one) and compare them on the same axes — for architecture: seam count, depth/leverage, reversibility, blast radius.
5. **Skip the fog of war.** If the pass surfaces no real open decision — the requirement shape and route are already clear — say so and hand straight to planning. Do not manufacture options to fill a template.
6. **Hand off to grill.** Dedup `Must Resolve In Grill`, drop anything local verification settles immediately, and preserve each option's tradeoff plus a recommended default for grill to drive. Each item must be phrased as a single decision question with 2-3 real options, benefit/cost/risk for each, and a recommended default — ready for the question tool if the host provides one. Do not hand grill a vague open question or a list of unrelated concerns.

## How it differs from grill

| | `do-it-brainstorm` | `do-it-grill` |
|---|---|---|
| Mode | Divergent: widen with product, architecture, and task-fit viewpoints | Convergent: falsify facts, settle load-bearing decisions |
| Output | Inline decision stack, or `.do-it/brainstorm/<task>.md` | `.do-it/grill/<task>.md` |
| Stop | Enough input to describe requirement shape, options, and grill questions | No execution-blocking item remains |
| Handoff | Hands `Must Resolve In Grill` to grill | Hands resolved decisions to planning or execution |

If both run, brainstorm runs first.

## When to use / skip

Use when the proposal genuinely opens a decision: a new user- or operator-visible surface; a product, positioning, or opportunity-cost tradeoff; a change to architecture shape, module boundaries, install/runtime policy, public commands, or verification strategy; or an explicit "脑暴 / brainstorm / 多视角看一下". A Heavy-tier task without an existing brainstorm also qualifies.

Skip when the change is a tightly bounded mechanical edit, pure internal cleanup with no product/architecture/operator/release tradeoff, or already covered by a current brainstorm artifact whose frame has not materially changed. When in doubt, prefer the fog-of-war skip over running a full pass on a task with no open decision.

## Viewpoints

The two cores are always present. Add a supplemental lens only when it can change the next implementation route — zero to two, never the whole table:

| Supplemental lens | Add when |
|---|---|
| `ux-designer` | UI, flow, discoverability, accessibility, or user-facing copy could change the requirement shape. |
| `end-user-advocate` | Real-use conditions, recovery, stale state, interruption, or mental-model mismatch matters. |
| `ops-sre` | Deployment, rollback, observability, migration, scale, or on-call matters. |
| `ceo-reviewer` | Board-level business tradeoff, revenue path, market window, or competitive pressure matters. |
| `red-team-reviewer` | Security, persistence, concurrency, replay, partial failure, or adversarial misuse might change the route. |
| `domain-language-reviewer` | Terms, names, public concepts, or domain models are overloaded or contradictory. |
| `plan-challenger` | Scope, acceptance criteria, sequencing, or route sizing is the main uncertainty. |

If two supplements overlap, run the one whose output changes the route.

## Tiers

- **Light** — only when explicitly asked. Run the dominant viewpoint inline (both if neither dominates). Inline summary, no artifact unless the user asks for a durable file.
- **Standard** — default. Both viewpoints inline; add zero to two supplements by task frame and repo truth. Produce an inline decision stack, or `.do-it/brainstorm/<task>.md` only when the next session must read it.
- **Heavy** — parent-only unless assigned. Fan the two viewpoints out as independent subagents; add the minimum supplements for product/operator/security/domain/release/scope risk; write the artifact unless the user asked for discussion only.

## Fan-out

Spawn lenses as independent read-only subagents only at Heavy tier, on explicit request, or when a viewpoint genuinely needs an independent deep read the parent cannot do inline without bias. When you do, use the `do-it-subagent-orchestration` contract:

```text
tier: Light or Standard
scope: <one sentence>
write ownership: read-only
forbidden paths: src/**, packages/**, apps/**, .do-it/**, dist/**, agents/**, skills/**
current truth: <facts the parent verified>
must-verify facts: <facts the lens must check itself>
stop condition: NEEDS_CONTEXT if the frame is too vague, BLOCKED if forbidden writes are required, otherwise return the schema
return schema: see the selected agent definition
```

Run independent lenses in parallel when the host supports it. If delegation is unavailable, run a compact local version and label it local — do not pretend independent agents ran.

## Research-first (new architectural surface)

When an option introduces a new architectural surface (new dependency / datastore / framework / protocol), **mark it in brainstorm output** — do not duplicate candidate rules here. Execution and Research block requirements defer to `do-it-planning` § Research-First Comparison. Brainstorm only flags whether the task touches a new architectural surface and surfaces ≥2 named alternatives as a `Must Resolve In Grill` item when material. Out of scope: bug fixes, refactors of existing code, incremental changes within a module.

## Artifact

Discussion-first is the default — return the inline stack (`Requirement shape`, `Product boundary`, `Core goal`, `Options`, `Architecture foundation`, `Extension modules`, `Must resolve in grill`, `Can decide during planning`) and stop. Write a durable file only when a future session must reuse it or the task is Heavy:

```text
.do-it/brainstorm/<task-slug>.md
```

`<task-slug>` follows the grill-log slug rule. When you write the artifact, in the same turn write the pointer so router and other skills pick it up:

```bash
mkdir -p .do-it/runtime && printf '%s' "<task-slug>" > .do-it/runtime/pointer
```

The full artifact `File Format` and section template live in `references/artifact-format.md`; load it only when writing the file. `status: open` means grill has not converged; grill flips it to `converged`.

## Common mistakes

- Spawning subagents on a Standard task when both viewpoints fit inline — fan-out is a Heavy/explicit cost, not a default.
- Treating `ceo-reviewer` / `ux-designer` / `end-user-advocate` / `ops-sre` as a fixed default set; they are supplements.
- Calling `architect-reviewer` (reviews delivered/planned risk) instead of the architecture viewpoint (explores system shape before implementation).
- Forcing an artifact when the user is still exploring a blank direction, or manufacturing options when there is no open decision.
- Letting brainstorm make the final decision — convergence belongs to grill, planning, or the user.

## Related skills

- `do-it-router` — sets tier, owns the decision ladder, and decides whether brainstorm is useful.
- `do-it-subagent-orchestration` — dispatch contract for fanned-out lenses.
- `do-it-grill` — converges the must-resolve stack and records resolved facts and decisions.
- `do-it-context` — sediments terms anchored during brainstorm or grill.
