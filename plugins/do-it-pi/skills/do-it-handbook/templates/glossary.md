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

**Decision-changing unknown** — the unknown that would change the route
if answered wrongly. See `do-it-decide`.

**Cheapest resolver** — the cheapest reliable method that can settle
that unknown. See `do-it-decide` and `decision-resolvers.md`.

**Decision boundary** — the fact under which each viable route wins when
no route dominates. See `do-it-decide`.

**Readiness** — the check that a four-heading contract is earned before
execution. See `task-contract.md`.

**Task Contract** — Goal / Decisions / Boundary / Acceptance. Plans are
earned contracts, not progress logs. See `task-contract.md`.

## Anti-Glossary (Terms To Avoid)

Names that have been deliberately retired or that conflict with
upstream terms. Listing them here saves a debate the next time someone
proposes them.

- Grill — retired Decide mode (premise/preference interview). Use cheapest resolver.
- Diverge — retired Decide mode (unclear alternatives). Use decision-changing unknown and decision boundary.
- Plan Card — retired durable coordination artifact. Use the four-heading Task Contract.
- Slice — retired Decide mode. Use the active contract Boundary.
- _<retired term>_ — _<reason; replacement term>_.
