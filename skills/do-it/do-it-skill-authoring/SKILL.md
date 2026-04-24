---
name: do-it-skill-authoring
description: Use when creating, rewriting, reviewing, or maintaining do-it skills, workflow skills, agent instructions, or progressive-disclosure skill files.
---

# Do-It Skill Authoring

## Purpose

Use this to write concise, operational skills that future agents can actually
follow. Skills should be do-it-native, not raw vendored copies.

## Tiers

### Light

Use for a small wording or metadata repair.

- Read the existing skill and adjacent style.
- Patch the smallest text needed.
- Validate frontmatter and scope.

### Standard

Use for normal skill creation or rewrite. This is the default for subagents.

1. Inspect the existing local skill, nearby do-it skills, and relevant upstream sources.
2. Identify the trigger, tiering, required inputs, workflow, stop conditions, and output shape.
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

## Skill Quality Checklist

- Description starts with `Use when...` and describes triggers, not the whole workflow.
- Body tells the agent what to do now.
- The skill has clear stop conditions for uncertainty.
- Tiers are operational, not decorative.
- Subagent defaults and parent-only Heavy behavior are explicit when relevant.
- Examples are short and only included when they remove ambiguity.
- No broad history, changelog, or implementation diary in `SKILL.md`.

## Verification

For each edited skill:

- file exists at the intended path;
- YAML frontmatter has `name` and `description`;
- description is 200 characters or fewer and trigger-focused;
- required tier and delegation rules are present;
- content does not claim unsupported install or manifest state.
