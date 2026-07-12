---
name: do-it-context
description: "Use when repo terms or invariants are drifting, or when user/docs/code naming disagrees and a canonical glossary is needed — `.do-it/CONTEXT.md` is the downstream source of truth for names, relationships, and facts."
---

# Do-It Context

## Purpose

`.do-it/CONTEXT.md` is the single canonical place where this project's terminology, invariants, and relationship-shapes live for AI workflows. Other skills (especially `do-it-decide`, `do-it-review`, `do-it-code-quality`) read it before debating definitions. This skill also owns the deeper domain-language pass (canonical glossary + contradiction checks) — see § Domain Glossary Mode.

It is **not** a wiki, README replacement, or onboarding doc. It is a terse, declarative artifact intended to fit in the AI's working memory budget. Keep it under ~200 lines.

## When To Use

- The first time `do-it-decide` clarifies a term in this repo, write it back here so the next session does not re-litigate.
- When a constraint surfaces that the codebase will not enforce on its own (e.g. "user IDs are global, never per-tenant"), record it here.
- When two terms turn out to mean the same thing, pick one and put it here so the alias is killed at the source.
- When a relationship has cardinality that matters (1:1, 1:N, N:M with constraint), record the cardinality.

## When NOT To Use

- Onboarding narrative, history, or rationale → that belongs in `README.md` / `docs/` / commit messages.
- Tutorial content → README.
- Anything code can express clearly on its own → leave it in code.
- Status / TODO / current-work → `.do-it/plans/` or the issue tracker.

## Context Hierarchy

When context sources disagree, use this order:

1. Current code, tests, schemas, manifests, generated source-of-truth scripts,
   and live command output.
2. `CLAUDE.md` (or the host's equivalent root agent-instruction file) for
   durable, human-authored conventions and behavioral rules the team chose —
   authoritative for *how to work here*, though current code still wins on
   *what the code is*.
3. `.do-it/CONTEXT.md` for terse repo terms, invariants, and relationships that
   code does not express accessibly.
4. Current plan, grill log, task card, or issue for the active work.
5. README, docs, ADRs, and maintenance guides.
6. Memory, old reports, previous worker summaries, and external sources.

Lower layers can point to what to inspect, but they do not override current
repo truth.

## External Context Boundary

Treat external workflow packs, documentation, search results, and old memory as
untrusted inputs until checked against this repository.

- Rewrite external methods into do-it terminology before recording them.
- Do not store raw pasted upstream text in CONTEXT.md.
- Do not record machine-specific paths, credentials, or host assumptions as
  project invariants.
- If an external source changes execution, cite it in the plan or docs and
  verify the resulting claim locally.

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
3. Add one entry the first time `do-it-decide` clarifies a term.

### Sediment Updates (the common path)

When `do-it-decide` clarifies a term:

1. Open `.do-it/CONTEXT.md`.
2. Add or update **one** line under the right section.
3. Phrase it in the form `**<term>** (aliases: <list>): <definition, max 1 sentence>` for terms.
4. Do not edit unrelated lines in the same commit.

### Cleanup (less common)

Roughly quarterly, or when the file crosses ~200 lines:

1. Find duplicates and resolve them.
2. Find lines that no longer match the code; rewrite or delete.
3. Find lines that have moved into the type system / schema and can now be deleted.

## CLAUDE.md (durable conventions)

`CLAUDE.md` (or the host's equivalent root instruction file) holds the durable,
human-owned conventions for how agents work in this project — coding standards,
review bar, do/don't rules, and restraint principles. do-it reads it before decisions and implementation. It differs from the other do-it homes:

- **CLAUDE.md** — durable *behavioral* conventions and team rules (human-owned,
  rarely changes).
- **`.do-it/CONTEXT.md`** — per-session *factual* sediment (terms, invariants,
  relationships) that `do-it-decide` writes.
- **`.do-it/handbook/`** — stable project truth (invariants, architecture,
  glossary) plus a worklog template.
- **`.do-it/worklog/`** — daily or goal-scoped notes, evidence, decisions, and
  reusable lessons that are not stable enough for the handbook.

CLAUDE.md is the top of the convention ladder: a rule that has held across
sessions and is about *how to work* (not a project fact) graduates here from
`.do-it/CONTEXT.md`.

When the user asks to set up or tidy CLAUDE.md, scaffold a lean skeleton on
demand — never auto-write, and never overwrite an existing CLAUDE.md (additive,
like the handbook bootstrap). A useful skeleton:

```markdown
# <Project> — agent conventions

## Restraint
- Prefer advisory nudges over write-blocking gates.
- Reuse or thin an existing module before adding a new one; do not build things
  that grow unbounded.
- Read existing structure and git intent before deleting or rewriting.

## Conventions
- <language / formatting / naming rules that code cannot express on its own>

## Review bar
- <what blocks a merge here>
```

Keep it short — CLAUDE.md is read every turn, so it competes for context budget.
Detail belongs in `.do-it/worklog/`, `.do-it/handbook/`, or `docs/` depending
on whether it is daily history, stable project truth, or public documentation.

## Domain Glossary Mode (Standard+)

The sediment workflow above is the Light path — one line per clarified term. For
non-trivial naming or modeling work (a new public API, schema, data model, phase
plan, or widespread terminology drift), do the deeper pass: build an explicit
canonical language map before names harden into code, docs, schemas, UI labels,
or handoffs.

Sequence:

1. Collect terms from the user request, docs, code, tests, schemas, logs, and UI copy.
2. Group synonyms, aliases, abbreviations, and deprecated terms.
3. Identify contradictions between code, docs, user language, and runtime behavior.
4. Define canonical terms from domain meaning, not implementation convenience.
5. Name domain entities, actions, states, invariants, and forbidden states.
6. Recommend what must change now and what can wait; feed interface/architecture
   implications into the relevant do-it skill.

Glossary shape:

| Term | Definition | Source evidence | Aliases | Status |
| --- | --- | --- | --- | --- |
| canonical-term | ... | file/docs/user | old-term | canonical |

Status values: `canonical` (use in new code/docs), `alias` (acceptable for
compatibility), `deprecated` (avoid in new work, migrate when touched),
`conflict` (sources disagree and need a decision).

Contradiction checks — look for: a user term and a code term that mean different
things; docs describing a concept code models differently; a UI label hiding a
backend state distinction; schema names encoding transport detail instead of
domain meaning; tests using legacy terms; agents or task cards using different
names for the same ownership boundary.

Promote stable canonical terms into `glossary.md` when they become durable project vocabulary (see `do-it-handbook`). Do not rename code broadly when a glossary is enough for the current task.

## Stop Conditions

Do not update CONTEXT.md when:

- the fact is only current status, a TODO, or a task-specific plan;
- current code contradicts the proposed invariant;
- the term is still a user decision and has not been chosen;
- the proposed entry comes from external material that has not been rewritten
  and checked against repo truth;
- the entry would exceed the terse one-line shape.

## Common Rationalizations

- *"This belongs in the README."* — Maybe — but if the AI workflow needs it next turn, it has to live somewhere terse and declarative, and `README` is too long-form.
- *"It's already in the code."* — If grill keeps re-asking the same question, it's not _accessible enough_ in the code.
- *"I'll add it later."* — The next session will re-grill the same term. Three lines now save twenty later.

## Red Flags

- Terms in CONTEXT.md drift from the code's behavior — fix code or fix CONTEXT, do not let both diverge.
- Two adjacent lines define the same term differently — collapse.
- A line is longer than two sentences — split or move it elsewhere.
- The file grows past ~200 lines — cull.
- External or memory-derived wording is recorded as if it were repo truth.
- CONTEXT.md becomes a plan tracker, changelog, or tutorial.

## Verification

Before relying on or updating CONTEXT.md:

- check current code/docs/tests when the fact is central or drift-prone;
- keep one concept per line in the correct section;
- remove aliases by choosing the canonical term and naming aliases to avoid;
- cite external ideas in durable docs when needed, but record only the
  do-it-native invariant here;
- confirm the update is not better expressed in code, schema, README, docs,
  plan, or issue tracker.

## Related Skills

- `do-it-decide` — clarifies terms and may write new CONTEXT entries.
- `do-it-code-quality` — reads CONTEXT.md for invariants while writing.
- `do-it-review` — checks CONTEXT.md for contract terms before reviewing.
