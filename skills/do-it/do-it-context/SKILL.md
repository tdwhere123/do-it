---
name: do-it-context
description: "Problem: project terms drift across people and across LLM sessions; the same word means three different things in CLAUDE.md, the code, and the prompt — and grill / planning / review re-litigate the same definitions every turn. Fix: maintain one declarative `.do-it/CONTEXT.md` per repo with terms, invariants, and relationships in CONTEXT-FORMAT shape, append-only sediment from `do-it-grill`, single source for downstream skills."
---

# Do-It Context

## Purpose

`.do-it/CONTEXT.md` is the single canonical place where this project's terminology, invariants, and relationship-shapes live for AI workflows. Other skills (especially `do-it-grill`, `do-it-planning`, `do-it-review-loop`, `do-it-domain-language`) read it before debating definitions.

It is **not** a wiki, README replacement, or onboarding doc. It is a terse, declarative artifact intended to fit in the AI's working memory budget. Keep it under ~200 lines.

## When To Use

- The first time `do-it-grill` clarifies a term in this repo, write it back here so the next session does not re-litigate.
- When a constraint surfaces that the codebase will not enforce on its own (e.g. "user IDs are global, never per-tenant"), record it here.
- When two terms turn out to mean the same thing, pick one and put it here so the alias is killed at the source.
- When a relationship has cardinality that matters (1:1, 1:N, N:M with constraint), record the cardinality.

## When NOT To Use

- Onboarding narrative, history, or rationale → that belongs in `README.md` / `docs/` / commit messages.
- Tutorial content → README.
- Anything code can express clearly on its own → leave it in code.
- Status / TODO / current-work → `.do-it/plans/` or the issue tracker.

## File Layout

`.do-it/CONTEXT.md` consists of three sections, each declarative:

1. **Terms.** One line per term: definition + any aliases-to-avoid.
2. **Invariants.** One line per invariant: hard rule that the system depends on but does not enforce structurally.
3. **Relationships.** One line per relationship: shape, cardinality, key constraints.

See `CONTEXT-FORMAT.md` (in this skill directory) for the exact shape.

## Workflow

### Initial Setup

1. From repo root: `mkdir -p .do-it && touch .do-it/CONTEXT.md`.
2. Copy the structure from `CONTEXT-FORMAT.md` (in this skill) — the three section headers and zero entries to start.
3. Add one entry the first time `do-it-grill` clarifies a term.

### Sediment Updates (the common path)

When `do-it-grill` clarifies a term:

1. Open `.do-it/CONTEXT.md`.
2. Add or update **one** line under the right section.
3. Phrase it in the form `**<term>** (aliases: <list>): <definition, max 1 sentence>` for terms.
4. Do not edit unrelated lines in the same commit.

### Cleanup (less common)

Roughly quarterly, or when the file crosses ~200 lines:

1. Find duplicates and resolve them.
2. Find lines that no longer match the code; rewrite or delete.
3. Find lines that have moved into the type system / schema and can now be deleted.

## Common Rationalizations

- *"This belongs in the README."* — Maybe — but if the AI workflow needs it next turn, it has to live somewhere terse and declarative, and `README` is too long-form.
- *"It's already in the code."* — If grill keeps re-asking the same question, it's not _accessible enough_ in the code.
- *"I'll add it later."* — The next session will re-grill the same term. Three lines now save twenty later.

## Red Flags

- Terms in CONTEXT.md drift from the code's behavior — fix code or fix CONTEXT, do not let both diverge.
- Two adjacent lines define the same term differently — collapse.
- A line is longer than two sentences — split or move it elsewhere.
- The file grows past ~200 lines — cull.

## Related Skills

- `do-it-grill` — primary writer of new entries.
- `do-it-planning` — reads CONTEXT.md before drafting plan cards.
- `do-it-review-loop` — checks CONTEXT.md for contract terms before reviewing.
- `do-it-domain-language` — for the deeper "is this a coherent domain language" question.
