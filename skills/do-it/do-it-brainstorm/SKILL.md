---
name: do-it-brainstorm
description: "Problem: planning starts before the team has heard the proposal from anyone outside engineering, so product/UX/operability concerns surface as rework after merge. Fix: dispatch read-only persona subagents (CEO, UX, end-user, ops) in parallel before grill, capture their independent angles in one artifact, and hand the open decisions to grill for convergence."
---

# Do-It Brainstorm

## Purpose

Use this to widen the lens before grill narrows it. `do-it-grill` converges on the load-bearing premise; `do-it-brainstorm` first makes sure the team has actually *heard* the load-bearing premise from someone other than the implementer. Four read-only persona subagents (CEO / UX / end-user / Ops) run in parallel, each with a fixed lens, and each returns at most one decision question for grill to resolve.

This is divergent thinking with a fixed shape and a fixed budget. Free-form brainstorm dumps were absorbed into grill in a prior version of this plugin and removed for a reason — they produced low-signal "what if we" lists. This skill exists because the *fixed-shape* version of multi-perspective input has held up.

## How It Differs From Grill

| | `do-it-brainstorm` | `do-it-grill` |
|---|---|---|
| Mode | Divergent — many lenses, no consensus | Convergent — falsify or decide |
| Persona | Four named outside lenses (CEO/UX/end-user/Ops) | Single internal challenger |
| Output | `.do-it/brainstorm/<task>.md` (per-persona section + cross-persona tensions + open decisions) | `.do-it/grill/<task>.md` (facts + decisions with status) |
| Token budget | Each persona ≤ 150 lines, parallel ≤ 3 personas | Single sequential thread |
| Stop condition | All assigned personas returned | No execution-blocking item remains |
| Handoff | Hands open decisions to grill | Hands resolved decisions to planning |

Brainstorm never converges. Convergence is grill's job.

## When To Use

Trigger brainstorm when the proposal:

- introduces a new user-visible surface (UI, command, API, page);
- has a plausible product/business angle the engineer is not best placed to evaluate;
- crosses an operational boundary (deploy, migration, scaling, on-call);
- the user explicitly asks to "脑暴" / "brainstorm" / "多视角看一下";
- a `Heavy`-tier task lands without one.

Skip brainstorm when:

- the change is a tightly bounded mechanical edit (refactor, typo, dependency bump);
- the work is purely internal infrastructure with no user surface and no operational delta;
- a brainstorm artifact already exists for this task and the proposal has not materially changed.

## Tier Rules

### Light

Triggered only by explicit user request at Light tier (router does not auto-trigger). Run **one** persona — the one with the highest expected leverage given the task. Mark `Cross-persona tensions: not run` and proceed.

### Standard

Default for product/UX/release-adjacent Standard-tier work, or any explicit request at Standard.

- Pick **two or three** personas with the highest expected leverage. The router-recommended dispatch order: scan the task for keywords (`pricing` / `customer` → CEO; `screen` / `flow` / `accessibility` / `UI` → UX; `error` / `retry` / `slow` / `confused` → end-user; `deploy` / `migrate` / `alert` / `scale` / `oncall` → Ops). If two keywords tie, prefer in this order: CEO, end-user, UX, Ops.
- Dispatch in parallel.
- Record `Cross-persona tensions` if any persona's recommendation contradicts another's.

### Heavy

Parent-only unless explicitly assigned. Run **all four** personas in parallel. May additionally invoke existing review agents (`architect-reviewer`, `red-team-reviewer`, `plan-challenger`) when their lens is needed; those go to `.do-it/review/<task>.md` per `do-it-review-loop`, not into the brainstorm file.

## Personas

| Agent | Lens | Hand to grill as |
|---|---|---|
| `ceo-reviewer` | Value claim, market window, revenue path, pivot cost, opportunity cost | One business decision question |
| `ux-designer` | First-run discoverability, accessibility, interaction consistency, visual hierarchy, copy at decision moment | One design decision question |
| `end-user-advocate` | Real-condition usage (slow network, stale tab, interrupted, recovery), mental-model mismatch | One experience decision question |
| `ops-sre` | Deploy path, rollback, observability, failure modes, on-call burden, migration safety | One operational decision question |

Each persona is read-only, runs at Sonnet (`claude_model = "sonnet"` in TOML), and returns ≤ 150 lines per the schema in its agent file.

## Dispatch Pattern

For each persona selected by the tier rule, build a subagent prompt that follows `do-it-subagent-orchestration` exactly. Persona subagents always run at **Light** tier when the parent brainstorm is Light or Standard, and at **Standard** tier only when the parent brainstorm itself was assigned Heavy. Persona subagents never run at Heavy.

```
tier: Light
scope: <one sentence>
write ownership: read-only
forbidden paths: src/**, packages/**, apps/**, .do-it/**, dist/**
current truth: <facts the parent already verified>
failure-mode forecast: <which classes the persona must explicitly cover>
path map: not applicable
readiness target: docs-truth-ready
must-verify facts: <facts the persona must check itself>
stop condition: NEEDS_CONTEXT if scope is unclear, BLOCKED if forbidden path required, otherwise return a single response
return schema: see <persona> agent definition

You are a Standard-tier subagent. Do not expand into parent-level Heavy flow, broad planning, branch closeout, manifest/docs edits, or unrelated cleanup.
```

Forbidden paths are wide on purpose — these personas should not write anywhere. They produce text the parent then composes into the brainstorm artifact.

Run dispatched personas in **parallel** (single message with multiple `Agent` tool uses), not sequentially. Two-to-four parallel calls is the design point. Sequential dispatch defeats the purpose and burns context on the parent's running summary.

## Output Artifact

```
.do-it/brainstorm/<task-slug>.md
```

`<task-slug>` follows the same rule as `do-it-grill-log` (slug from user title, or short-hash, with optional session prefix). `<cwd>/.do-it/brainstorm/.gitkeep` should exist so the directory tracks in version control.

### File format

```markdown
---
task: <one-line title>
session_id: <id>
created: <YYYY-MM-DD>
status: open
personas_run: [ceo, ux, end-user, ops]
tier: <light | standard | heavy>
---

## Frame

<one-sentence problem statement the personas all received>

## Personas

### CEO / Product
<verbatim or distilled return from ceo-reviewer; cap ~30 lines>

### UX Designer
<verbatim or distilled return from ux-designer; cap ~30 lines>

### End-user Advocate
<verbatim or distilled return from end-user-advocate; cap ~30 lines>

### Ops / SRE
<verbatim or distilled return from ops-sre; cap ~30 lines>

## Cross-persona tensions

- <tension A: persona X says ..., persona Y says ..., conflict is ...>
- <tension B: ...>

(Or `not run` if Light tier; or `none surfaced` if Standard/Heavy and personas agreed.)

## Open decisions for grill

- [ ] <decision 1, lifted from a persona's "one question for the human">
- [ ] <decision 2, ...>
```

`status: open` means grill has not yet converged. Grill flips it to `converged` once the open decisions are resolved (`chosen` / `deferred` / `needs_user_decision`).

## Handoff to Grill

After writing the brainstorm artifact, the parent should:

1. Inspect the four returned messages for inflated scope, forbidden-path hits, or schema deviations. Reject and re-dispatch any persona that drifted.
2. Compose the artifact at the path above. The "Personas" section is each return distilled to ≤ 30 lines; the parent owns this distillation.
3. Lift the per-persona "one question" into "Open decisions for grill", deduplicated.
4. Trigger `do-it-grill` (explicit or via the existing prompt hook). Grill detects `.do-it/brainstorm/<task>.md` with `status: open` and runs in convergence mode (see `do-it-grill` "Convergence after brainstorm").

The parent does not converge inside brainstorm. If the parent feels the urge to pick a winner among the persona returns, that is grill territory.

## Token Discipline

- Personas in parallel ≤ 3 (router-selected). Light tier ≤ 1.
- Each persona return capped at ~150 lines per the agent definition; the artifact distills to ~30 lines per persona.
- The parent does not summarize all four personas back to the user inline. The artifact is the deliverable; the user reads the file or asks for a section.
- Do not re-run brainstorm if the artifact already exists for this task and the proposal has not materially changed. Append to "Open decisions for grill" instead.

## Common Mistakes

- Running personas sequentially because each persona's output "informs" the next. They are independent on purpose. Sequential dispatch is a slow grill, not a brainstorm.
- Letting the parent rewrite a persona's return in the persona's voice. Distill, do not editorialize.
- Inventing a fifth persona inline ("let me also be the lawyer for a moment"). Add a real agent or do not. The fixed shape is the value.
- Treating `Cross-persona tensions` as a debate to settle inside brainstorm. Surface, hand to grill.
- Skipping the artifact and only telling the user the result inline. The artifact is what the next session reads.

## Red Flags

- All four personas return effectively the same point. Either the prompt was too narrow (re-dispatch with more context) or the personas were not the right pick (revisit the tier rule).
- One persona returns "BLOCKED: requires Heavy escalation". Stop and either escalate the brainstorm to Heavy or drop that persona for this task.
- The parent's own context grows by more than a few hundred lines from the brainstorm. The parent is over-quoting; distill harder.

## Related Skills

- `do-it-router` — sets tier; brainstorm consumes tier to decide persona count.
- `do-it-subagent-orchestration` — dispatch contract used for each persona call.
- `do-it-grill` — receives the open decisions; runs convergence; flips brainstorm status to `converged`.
- `do-it-grill-log` — `.do-it/grill/<task>.md` references the brainstorm slug.
- `do-it-review-loop` — separate channel for review-grade lenses (architect, red-team, plan-challenger) that are review, not brainstorm.
- `do-it-context` — sediments any term anchored during the persona returns.
