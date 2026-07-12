# Glossary

Long-stable vocabulary used across the codebase, handbook, and task
cards. Active terse context lives in `.do-it/CONTEXT.md`; promote a term
here once it is durable project vocabulary (see the term-ownership rule
in `do-it-handbook` SKILL).

## Format

```
**<Term>** — <one-sentence definition>. <Optional second sentence
on where it is defined or measured.> Defined in <path:symbol> when
applicable.
```

Avoid:

- synonyms for terms already defined here. Pick one and stick to it.
- vague qualifiers ("usually", "in most cases"). If the term has
  exceptions, name them.
- circular definitions. If `A` is defined in terms of `B`, `B` must
  be defined first or in the same file.

## Core Vocabulary

> Replace the examples below with the project's actual terms.

**_Domain_** — _<one-sentence definition. Defined in
`packages/_/src/_.ts`>_.

**_Service_** — _<...>_.

**_Event_** — _<...>_.

## Process Vocabulary

**Light / Standard / Heavy** — Tier classification used by
`do-it-router` to size the workflow for a task. See `do-it-router`.

**Blocking / Important / Opportunity** — Severity used in review
findings. See `do-it-review`.

**Decide modes** — `do-it-decide` offers Grill when a premise or preference gates the route, Diverge when alternatives are genuinely unclear, and a plan card only when durable coordination needs it.

## Anti-Glossary (Terms To Avoid)

Names that have been deliberately retired or that conflict with
upstream terms. Listing them here saves a debate the next time someone
proposes them.

- _<retired term>_ — _<reason; replacement term>_.
