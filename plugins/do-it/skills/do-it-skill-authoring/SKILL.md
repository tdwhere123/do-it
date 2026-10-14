---
name: do-it-skill-authoring
description: "Use when creating or revising a do-it skill, its description, references, or specialist delegation guidance so it adds needed judgment without prescribing ceremony."
---

# Skill Authoring

Start from an observed failure or repeated rediscovery, not an imagined need.
Capture it as a reproducible behavior scenario (in this repository,
`evals/behavior/`) and compare the revision against the current skill, or no
skill for a new one. Write the least guidance that changes the observed
behavior. A scenario that passes with and without the change does not show
the skill helps.

## Description

The description decides whether the skill loads. Lead with the situations and
symptoms that call for this judgment, and distinguish near-miss tasks that do
not need it. Do not summarize the procedure: a model can follow a summarized
description instead of reading the body. Check the wording against realistic
prompts that should trigger the skill and near misses that should not.

## Body

Give the model what it would not do well unaided: distinctive questions,
distinctions, counterexamples, tool pitfalls, and precise ownership, permission,
and side-effect boundaries. Explain why a constraint exists instead of
escalating its emphasis. Match specificity to fragility: judgment stays open,
while fragile or irreversible operations deserve exact commands or scripts.
Deterministic checks belong in scripts, validators, or hooks rather than prose.

Put load-bearing guidance first; hosts may retain only the opening of a long
skill after context compaction. Use one term per concept. Do not repeat Core or
another skill's guidance; link its owner with a concrete loading condition.
Keep references one level from SKILL.md, and give a long reference a short
contents list so a partial read still shows its scope.

Describe what complete work must establish and let the model choose methods
and sequence. Do not recreate task tiers, compulsory phase chains, worker or
review quotas, stop-status taxonomies, mandatory reports, anti-rationalization
tables, or a fixed skill anatomy.

## Delegation guidance

When a skill recommends independent contexts, say what independence adds: fresh
evidence, an unanchored challenge, a specialist lens with a concrete question,
or separable work that benefits from parallel inspection. Also say when it adds
nothing: one reader can hold the scope, several lenses apply to the same slice,
or splitting would break a chain that one reader should follow end to end.
Perspectives are questions, not headcount; one delegate can carry several.
Separate source facts and settled decisions from parent hypotheses, name write
scopes, and leave integration and verification with the parent.

## Validation

Check the description, links, examples, and shipped copies against the skill's
purpose with the repository's build and consistency checks. Rerun the motivating
scenario on the hosts and model classes the skill ships to when available, and
name the conditions not run. Observe how agents actually navigate the skill:
unread references, repeatedly reread sections, and ignored guidance are evidence
for restructuring or deletion. Do not validate a ritual heading structure or a
target number of skills.
