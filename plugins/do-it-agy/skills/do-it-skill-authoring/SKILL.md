---
name: do-it-skill-authoring
description: "Use when creating or revising a do-it skill, its description, references, or specialist delegation guidance so it adds needed judgment without prescribing ceremony."
---

# Skill Authoring

Improve a specific decision or instruction-quality problem, not an imagined
feature gap. An observed failure, repeated rediscovery, ambiguous wording, or a
concrete counterexample can reveal the problem. Read the current owner and any
upstream prompt you borrow from: distinguish a genuinely missing judgment from
an existing rule that needs a clearer question, example, or loading condition.

Separate writing quality from behavioral effectiveness. Authorized clarity,
structure, and example improvements need not wait for a model trial. Explain the
concrete weakness they address; do not claim they improved task outcomes until
measured. For a behavioral claim, preserve the motivating episode as a replayable
scenario (here, `evals/behavior/`) and compare against the current skill, or no
skill for a new one. A scenario that passes both ways does not show an effect.

## Description

The description decides whether the skill loads. Lead with the situations and
symptoms that call for this judgment, and distinguish near-miss tasks that do
not need it. Do not summarize the procedure: a model can follow a summarized
description instead of reading the body. Check the wording against realistic
prompts that should trigger the skill and near misses that should not.

## Body

Give the model a usable reasoning move: a question that distinguishes two
plausible explanations, a counterexample to an attractive wrong choice, a tool
pitfall, or a precise ownership, permission, or side-effect boundary. "Verify
carefully" adds little; "check that the failed test shows the predicted mismatch,
not an unrelated setup failure" tells the reader what to inspect and why. Include
the nearby valid case: an import error is relevant when importability is the
claimed defect. Add only guidance that addresses the named weakness. Explain the
reason for a constraint instead of escalating its emphasis. Match specificity to
fragility: judgment stays open, while fragile or irreversible operations deserve
exact commands or scripts.
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

Check descriptions against realistic trigger and near-miss requests; inspect
whether examples exercise the intended distinction rather than echoing the rule.
Check links and shipped copies with the repository's build and consistency gates.
For behavioral evaluation, verify the skill actually loaded, the relevant command
or assertion ran, and the scorer recognizes that evidence. A broken harness is
not evidence against the prompt. Rerun the motivating scenario on the relevant
hosts and model classes when available; name conditions not run and keep writing
validation separate from an unmeasured effectiveness claim. Observe how agents
actually navigate the skill: unread references, repeatedly reread sections, and
ignored guidance are evidence
for restructuring or deletion. Do not validate a ritual heading structure or a
target number of skills.
