---
name: do-it-brainstorm
description: "Use when planning needs divergent product and architecture option mapping before grill converges on decisions."
---

# Do-It Brainstorm

## Purpose

Use this to understand what the requirement is and what shape it could take before `do-it-grill` narrows it. Brainstorm is divergent, but it is not a fixed four-persona ritual. The default pass always includes two core read-only lenses:

- `product-strategist`: requirement shape, product boundary, core goal, and option tradeoffs.
- `architecture-strategist`: architecture foundation, extension modules, stage closure, boundaries, and verification route.

Supplemental lenses are added only when the task needs them. Brainstorm surfaces possible shapes, product and architecture boundaries, option benefits/costs/risks, and the questions grill must converge. It does not settle the decision itself.

## How It Differs From Grill

| | `do-it-brainstorm` | `do-it-grill` |
|---|---|---|
| Mode | Divergent: widen with product, architecture, and task-fit lenses | Convergent: falsify facts and settle load-bearing decisions |
| Default lenses | Product core + architecture core | Single internal challenger loop |
| Output | Discussion-first summary or `.do-it/brainstorm/<task>.md` | `.do-it/grill/<task>.md` |
| Stop condition | Enough lens input to describe requirement shape, boundaries, options, and grill questions | No execution-blocking item remains |
| Handoff | Hands `Must Resolve In Grill` to grill | Hands resolved decisions to planning or execution |

Brainstorm never converges. It may compare options and name tradeoffs, but the final route is chosen by grill, planning, or the user.

## When To Use

Trigger brainstorm when the proposal:

- introduces a new user-visible or operator-visible surface;
- has product, business, positioning, workflow, or opportunity-cost implications;
- changes architecture shape, module boundaries, install/runtime policy, public commands, or verification strategy;
- crosses operational, reliability, security, domain-language, or release boundaries;
- lacks enough project context and the user wants to discover the requirement shape before artifacts;
- the user explicitly asks to "脑暴" / "brainstorm" / "多视角看一下";
- a Heavy-tier task lands without an existing brainstorm or equivalent discussion.

Skip brainstorm when:

- the change is a tightly bounded mechanical edit;
- the work is pure internal cleanup with no product, architecture, operator, or release tradeoff;
- a current brainstorm artifact exists for the same proposal and the frame has not materially changed.

## Lens Selection

Always run the two core lenses unless the user explicitly requests a single named lens:

- `product-strategist`
- `architecture-strategist`

Then add supplements only when the task calls for them:

| Supplemental lens | Use when |
|---|---|
| `ux-designer` | UI, flow, discoverability, accessibility, visual hierarchy, or user-facing copy could change the requirement shape. |
| `end-user-advocate` | Real-use conditions, recovery, stale state, interruption, or mental-model mismatch matters. |
| `ops-sre` | Deployment, rollback, observability, migration, scale, on-call, or incident recovery matters. |
| `ceo-reviewer` | Board-level business tradeoff, revenue path, market window, pricing, or competitive pressure matters. |
| `red-team-reviewer` | Security, persistence, concurrency, replay, partial failure, or adversarial misuse might change the route. |
| `domain-language-reviewer` | Terms, names, public concepts, or domain models are overloaded or contradictory. |
| `plan-challenger` | Scope, acceptance criteria, sequencing, or route sizing is the main uncertainty. |

Do not run every lens by default. If two supplemental lenses overlap, choose the one whose output can change the next implementation route.

## Tier Rules

### Light

Use only when the user explicitly asks for brainstorm on a Light task.

- Run `product-strategist` if the question is about demand, boundary, core goal, or option tradeoffs.
- Run `architecture-strategist` if the question is about foundation, extension modules, boundary, stage closure, or verification.
- If neither clearly dominates, run both cores.
- Prefer an inline discussion summary over an artifact unless the user asks for a durable file.

### Standard

Default for normal product, UX, command, workflow, release-adjacent, or architecture-adjacent work.

- Run both core lenses.
- Add zero to two supplemental lenses based on the task frame and repo truth.
- Produce either an inline decision stack or `.do-it/brainstorm/<task>.md` when the next session must read it.

### Heavy

Parent-only unless explicitly assigned.

- Run both core lenses.
- Add the minimum supplemental lenses needed for product, operator, security, domain, release, or scope risk.
- For release/workflow/policy work, include at least one install/release or skill-quality review later in `do-it-review-loop`; review lenses are not substitutes for brainstorm lenses.
- Write the artifact unless the user explicitly asked for discussion only.

## Dispatch Pattern

Each selected lens is read-only and should receive the same frame plus the facts the parent already verified. Lenses may inspect current truth when needed, but they must not write.

Use the `do-it-subagent-orchestration` contract when delegating:

```text
tier: Light or Standard
scope: <one sentence>
write ownership: read-only
forbidden paths: src/**, packages/**, apps/**, .do-it/**, dist/**, agents/**, skills/**
current truth: <facts the parent verified>
failure-mode forecast: <classes this lens must cover>
path map: not applicable, unless architecture-strategist needs a high-level boundary map
must-verify facts: <facts the lens must check itself>
stop condition: NEEDS_CONTEXT if the frame is too vague, BLOCKED if forbidden writes are required, otherwise return the schema
return schema: see the selected agent definition
```

Run independent lenses in parallel when the host supports parallel subagents. If the host or task cannot support delegation, the parent may run a compact local version of the same lenses, but must label it as local and avoid pretending independent agents ran.

## Discussion-First Mode

Use discussion-first mode when the project or task frame is too blank to justify an artifact:

- no repo exists or the repo has no relevant product/architecture truth;
- the user is exploring direction, not asking for a durable handoff;
- selected lenses return `NEEDS_CONTEXT` because the goal, audience, or boundary is unknown.

Return a concise stack:

- `Requirement shape`: what the demand appears to be and what forms it could take.
- `Product boundary`: what is in scope, what is out of scope, and which line matters.
- `Core goal`: the success target for this stage.
- `Options`: multiple viable paths with benefits, costs, risks, and when to choose each.
- `Architecture foundation`: the core bottom layer and invariants.
- `Extension modules`: later or optional modules and how they attach.
- `Must resolve in grill`: decisions that change product direction, foundation, implementation route, or verification.
- `Can decide during planning`: details that can be settled after direction is chosen.
- `Context still needed`: only facts that cannot be read locally and would change execution.

Do not force `.do-it/brainstorm/<task>.md` in discussion-first mode. Create an artifact only when there is enough context for future sessions to reuse.

## Output Artifact

When durable handoff is useful, write:

```text
.do-it/brainstorm/<task-slug>.md
```

`<task-slug>` follows the same rule as `do-it-grill-log`: slug from the user title or a short hash, with an optional session prefix. `<cwd>/.do-it/brainstorm/.gitkeep` should exist when the project tracks do-it artifacts.

### File Format

```markdown
---
task: <one-line title>
session_id: <id>
created: <YYYY-MM-DD>
status: open
lenses_run: [product-strategist, architecture-strategist, ...]
tier: <light | standard | heavy>
mode: <artifact | discussion-first>
---

## Frame

<one-sentence problem statement all lenses received>

## Core Lenses

### Product Strategy
<distilled requirement shape, product boundary, core goal, and option tradeoffs from product-strategist; cap ~30 lines>

### Architecture Strategy
<distilled foundation, extension modules, stage closure, and verification route from architecture-strategist; cap ~30 lines>

## Supplemental Lenses

### <Lens Name>
<distilled return; cap ~30 lines>

Or `none selected`.

## Requirement Shape

<what the demand appears to be, including plausible forms it could take>

## Product Boundary

- In scope: <what belongs to this product or feature>
- Out of scope: <what does not belong here>
- Boundary risk: <what breaks if this line is wrong>

## Core Goal

<the stage-defining success target>

## Options

### Option A: <name>

- Benefits: <why it helps>
- Costs: <what it consumes or complicates>
- Risks: <how it can fail or mislead>
- Choose when: <conditions where this path fits>

### Option B: <name>

- Benefits: <why it helps>
- Costs: <what it consumes or complicates>
- Risks: <how it can fail or mislead>
- Choose when: <conditions where this path fits>

## Architecture Foundation

- Core bottom layer: <foundation pieces and invariants>
- Ownership/contract: <stable boundaries others depend on>
- Stage closure: <what should finish now unless there is a concrete reason not to>

## Extension Modules

- <module or capability that can attach later without reshaping the foundation>

## Grill Handoff

### Must Resolve In Grill

- <decision or premise that changes product direction, foundation, implementation route, proof path, or operator behavior>

### Can Decide During Planning

- <detail that should not block requirement discovery or grill convergence>

## Tensions

- <lens A says ..., lens B says ..., conflict is ...>

Or `none surfaced`.
```

`status: open` means grill has not converged on `Must Resolve In Grill`. Grill flips it to `converged` once every execution-blocking item is resolved or explicitly deferred.

## Research handoff (Heavy or new architectural surface)

When brainstorm produces options that involve a new architectural surface (new dependency / datastore / framework / protocol), do NOT batch-ask the user three generic questions here. Instead, hand specific candidate-choice questions to grill as `Must Resolve` items.

Grill follows the "ask one focused question" rule (see `do-it-grill`). The brainstorm artifact lists the architectural-surface decisions that grill must drive; grill picks the highest-leverage one and asks. This preserves the question-budget discipline.

Out of scope here: bug fixes, refactors of existing code, incremental changes within an existing module.

## Handoff To Grill

After discussion or artifact creation:

1. Inspect selected lens returns for forbidden-path hits, unsupported claims, and schema drift.
2. Deduplicate `Must Resolve In Grill` and remove questions that local verification can answer immediately.
3. Preserve the option tradeoffs; do not collapse them into one answer inside brainstorm.
4. Trigger or recommend `do-it-grill` when any must-resolve item changes execution.
5. If all must-resolve items can be verified locally and no user preference remains, the parent may proceed to planning/execution and record why grill is not needed.

## Token Discipline

- Core lenses are default; supplemental lenses are justified by task risk.
- Do not summarize every lens inline when an artifact exists; return the path plus requirement shape, options, and grill handoff summary.
- Keep each distilled lens section to about 30 lines.
- Do not re-run brainstorm if the existing artifact still matches the proposal; append only if the frame materially changed.

## Common Mistakes

- Treating `ceo-reviewer`, `ux-designer`, `end-user-advocate`, and `ops-sre` as the fixed default set. They are supplements now.
- Calling `architect-reviewer` instead of `architecture-strategist` before implementation. The former reviews delivered or planned architecture risk; the latter explores system shape during brainstorm.
- Forcing an artifact when the user is still exploring a blank product direction.
- Letting brainstorm make the final decision. Brainstorm maps the requirement shape and options; convergence belongs to grill, planning, or the user.
- Running many overlapping supplements when the two core lenses already identify the route.

## Related Skills

- `do-it-router` — sets tier and decides whether brainstorm is useful.
- `do-it-subagent-orchestration` — dispatch contract for selected lenses.
- `do-it-grill` — converges the must-discuss stack.
- `do-it-grill-log` — records resolved facts and decisions.
- `do-it-review-loop` — reviews delivered diff, skill quality, install readiness, and release risk after implementation.
- `do-it-context` — sediments terms anchored during brainstorm or grill.
