---
name: do-it-domain-language
description: Use when code, docs, user language, or plans need canonical terms, domain model clarity, naming alignment, or contradiction checks before design or implementation.
---

# Do-It Domain Language

## Purpose

Use this to make domain terms explicit before names become code, docs, schemas, UI labels, or agent handoffs. The output is a small canonical language map with contradictions and proposed resolutions.

## Tier Rules

### Light

Use for a local naming decision. Inspect nearby code and docs, pick the least surprising term, and note aliases if needed.

### Standard

Default for subagents and non-trivial naming or model work. Build a glossary from user language, docs, code, tests, schemas, and UI text.

### Heavy

Parent-only unless explicitly assigned. Use for phase plans, data models, public APIs, workflow policy, migrations, or widespread terminology drift.

## Sequence

1. Collect terms from the user request, docs, code, tests, schemas, logs, and UI copy.
2. Group synonyms, aliases, abbreviations, and deprecated terms.
3. Identify contradictions between code, docs, user language, and runtime behavior.
4. Define canonical terms using domain meaning, not implementation convenience.
5. Name domain entities, actions, states, invariants, and forbidden states.
6. Recommend where terminology must change now and what can wait.
7. Feed interface or architecture implications into the relevant do-it skill.

## Glossary Shape

| Term | Definition | Source evidence | Aliases | Status |
| --- | --- | --- | --- | --- |
| canonical-term | ... | file/docs/user | old-term | canonical |

Status values:

- `canonical`: use in new code/docs.
- `alias`: acceptable when preserving compatibility.
- `deprecated`: avoid in new work, migrate when touched.
- `conflict`: current sources disagree and need a decision.

## Contradiction Checks

Look for:

- user term means one thing, code term means another;
- docs describe a concept that code models differently;
- UI label hides a backend state distinction;
- schema names encode transport detail instead of domain meaning;
- tests use legacy terms that make new behavior ambiguous;
- agents or task cards use different names for the same ownership boundary.

## Output Shape

- Scope scanned.
- Canonical glossary.
- Contradictions and proposed resolution.
- Domain entities, actions, states, and invariants.
- Required naming changes for current work.
- Deferred terminology cleanup, if any.
- Interface or architecture follow-ups.

## Common Mistakes

- Renaming code broadly when a glossary is enough for the current task.
- Picking names from implementation detail instead of domain meaning.
- Treating aliases as harmless when they create conflicting behavior.
- Ignoring docs or UI copy while changing API names.
- Letting a subagent redefine canonical language outside its assigned slice.
