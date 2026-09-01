---
name: do-it-skill-authoring
description: "Use when creating or updating do-it skills: write predictable model-invoked descriptions, progressive disclosure, leading words, and hook-aware escape behavior."
---

# Do-It Skill Authoring

## Purpose

Use this to write concise, operational skills that future agents can actually
follow. Skills should be do-it-native, not raw vendored copies.

**Predictability first** (process repeatability, not identical outputs): prune
descriptions for context load; one trigger branch per distinct case; put steps
in `SKILL.md` and push rare reference behind links; prefer **leading words**
the model already knows (`deep module`, `seam`, `tracer bullet`, `red before green`)
over restating the same idea three ways.

The minimum useful skill is a triggerable workflow: frontmatter, tier/process,
stop conditions, anti-rationalization checks, red flags, and verification.

## Tiers

### Light

Use for a small wording or metadata repair.

- Read the existing skill and adjacent style.
- Patch the smallest text needed.
- Validate frontmatter and scope.

### Standard

Use for normal skill creation or rewrite. When a child is assigned this work,
Standard is the default depth — not a reason to dispatch.

1. Inspect the existing local skill, nearby do-it skills, and relevant upstream sources.
2. Identify the trigger, tiering, required inputs, workflow, stop conditions, red flags, verification, and output shape.
3. Write YAML frontmatter with `name` and `description`.
4. Keep `SKILL.md` concise; move heavy references out only when truly needed.
5. Prefer bullets, checklists, and return schemas over narrative.
6. Encode Light, Standard, and Heavy behavior.
7. State that Heavy is parent-only or explicitly assigned when delegation is possible.
8. Verify frontmatter, file paths, and that edits stayed within ownership.

### Heavy

Use for workflow-wide skill sets, router changes, install-adjacent skill
publication, or cross-skill consistency. Heavy is parent-only unless explicitly
assigned.

Parent-only unless explicitly assigned: child agents should write only the
skill slice they were given.

- Build a cross-skill contract before writing many files.
- Keep router, manifest, install, docs, and agent changes under their explicit owners.
- Check for naming collisions and duplicated behavior.
- Run installer/doctor/package validation only when those surfaces are in scope.

## Stop Conditions

Stop before editing or publishing a skill when:

- the trigger overlaps another skill and the routing boundary is unclear;
- the skill would introduce a host, command, manifest target, or install path
  not present in the repo;
- Heavy behavior would be available to subagents without explicit assignment;
- generated plugin or installed copies would drift from the maintained source.

## Minimum Skill Anatomy

Finding and review returns must follow [`../references/workflow-kernel.md`](../references/workflow-kernel.md) § Finding Schema.

Every installed do-it skill should include, or intentionally inherit from a
nearby skill:

- **Trigger:** frontmatter `description` starts with `Use when...` and names
  activation conditions, not process steps.
- **Purpose / When to Use:** the body tells the agent why this skill exists and
  when it is the right tool.
- **Tier or Process:** Light / Standard / Heavy behavior, or another explicit
  step sequence when tiers do not fit.
- **Stop Conditions:** when to ask, return `BLOCKED`, return
  `Needs more evidence`, or escalate to another do-it skill.
- **Common Rationalizations:** excuses an agent might use to skip the workflow,
  paired with the do-it-native correction.
- **Red Flags:** observable signs the workflow is being violated.
- **Verification:** evidence required before the skill's work can be claimed.

Do not force identical headings into tiny support skills when the same checks
are already expressed as `Common Mistakes`, `Review Rules`, `Failure Handling`,
or another do-it-native anti-skip section. The behavior matters more than the
heading name.

## Skill Quality Checklist

- Description starts with `Use when...` and describes triggers, not the whole workflow.
- Body tells the agent what to do now.
- The skill has clear stop conditions for uncertainty.
- Tiers are operational, not decorative.
- Common rationalizations, red flags, or equivalent do-it-native anti-skip
  rules are present.
- Subagent defaults and parent-only Heavy behavior are explicit when relevant.
- Hot-path rules name a failure mode, owning layer, and a behavior eval that
  could show benefit — or they do not ship.
- Cross-version contracts use HTML anchors, not English regex.
- Examples are short and only included when they remove ambiguity.
- No broad history, changelog, or implementation diary in `SKILL.md`.
- External workflow material is rewritten into do-it terminology before it is
  installed.
- Universal execution rules (evidence, scope, verify, report, boundary) are NOT
  restated in satellite skills — cite `core §<rule_id>` instead.

## Contract Anchors
<!-- do-it-contract:authoring.contract-anchors -->

Do not lock skill meaning with English regex. Mark cross-version contracts with
stable HTML comments of the form `<!-- do-it-contract:<skill>.<id> -->`. Keep
3–6 real contracts per skill. Prose may be reworded; deleting an anchor is a
contract break. Validators check IDs, ownership, and cross-links — not full
sentences.

## Failure Mode And Eval
<!-- do-it-contract:authoring.failure-mode-eval -->

Every hot-path rule must answer:

1. Which observable failure does it prevent?
2. Why is native model behavior not enough?
3. Which layer owns it (fixed skill, adaptive, project truth, task state, hook,
   validator)?
4. What behavior eval could show benefit?
5. Can a more general principle replace several checklist items?
6. If it does not pay, how is it deleted or rolled back?

A rule that cannot name a failure mode and an eval does not belong on the hot
path.

## Delegation Budget
<!-- do-it-contract:authoring.delegation-budget -->

Default **0** subagents; at most **one** targeted second look. No fixed agent
count. "Heavy" is not a dispatch reason. Child agents stay on the assigned
slice; they must not commit, merge, revert peer work, or expand write scope.
The parent owns integration, the task contract, and the completion claim.
Budget: [`../references/workflow-kernel.md`](../references/workflow-kernel.md)
§ Delegation Budget.

## Multi-Host Checklist

Shared skills must stay host-neutral in the body:

- No hard-coded tool names (`Bash`, `MultiEdit`) — use intent ("run verify",
  "edit file") or point to [`../references/host-vocabulary.md`](../references/host-vocabulary.md).
- Hook behavior references kernel script names (`write-quality-lint.sh`), not
  host event names — per-host mapping lives in
  [`../references/host-{codex,claude,cursor,opencode}.md`](../references/host-vocabulary.md).
- Truth planes include `live-cursor` / `live-opencode` when install or hook
  claims need host-specific proof.
- Progressive disclosure: move Integrity, DIM, pointer, and quality-family detail
  to `skills/do-it/references/` instead of bloating `SKILL.md`.
- After edits, run `node scripts/check-skill-links.mjs` and hook tests when hooks
  or references change.

## Where a Rule Lives

Before writing a rule, pick its layer — the wrong layer either puts numbers
where taste is needed or taste where a machine is reliable:

| Layer | Holds | Test |
|---|---|---|
| `do-it-core` | Universal execution protocol (evidence, scope, verify, report, boundary) | Single authority; satellites cite it, hooks quote the TSV |
| Skill prose | Judgment rules needing context and taste (seams, phases, reuse) | Could two reasonable agents disagree? → skill |
| Hook (`write-quality-lint.sh` etc.) | Deterministic checks with numbers (line counts, pattern bans) | Can a script decide it every time? → hook |
| Validator (`scripts/validate-*.mjs`) | Drift contracts across registry/scanner/docs/tests | Is it a closed set that must stay synchronized? → validator |

A skill keeps at most a one-line pointer to the hook family that owns the
numbers; never restate thresholds in prose where they drift. The one prose
home for hook numbers is the family reference table
(`references/write-quality-families.md`) — skills and registry descriptions
cite it. Numbers a hook cannot check (e.g. cross-language function length)
stay in the skill that owns the judgment. New hook
families are a closed set: registry (`hooks/data/quality-families.tsv`),
scanner emission, `references/write-quality-families.md`, and a direct test
reference must land together — `validate:quality-families` blocks drift.

## Common Rationalizations

- *"The upstream skill already says this well."* — The installed package ships
  do-it vocabulary and host assumptions; rewrite the method instead of copying
  text.
- *"This skill is obvious enough without stop conditions."* — Future agents
  fail at the edges; stop conditions are the edge contract.
- *"Verification can live in the task plan."* — Skill-level verification keeps
  repeated workflows from depending on one plan author's memory.

## Red Flags

- The description summarizes steps instead of naming activation triggers.
- A skill tells agents what to value but not what to do next.
- Heavy behavior is available to subagents without explicit parent assignment.
- The body introduces a new host, command, manifest target, or install surface
  that the repo does not actually ship.
- The wording uses upstream skill names as installed do-it public concepts.

## Verification

For each edited skill:

- file exists at the intended path;
- YAML frontmatter has `name` and `description`;
- description is 200 characters or fewer and trigger-focused;
- required tier and delegation rules are present;
- stop conditions, anti-rationalization checks, red flags, and evidence
  requirements are present or intentionally covered by do-it-native equivalents;
- content does not claim unsupported install or manifest state.
