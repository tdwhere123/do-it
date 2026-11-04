---
name: do-it-context
description: "Use when project terms, relationships, or invariants drift between user language, docs, and implementation, or when stable project knowledge keeps being rediscovered or the user asks to document it."
---

# Project Context

Resolve ambiguous names and conflicting facts against current code, project
instructions, and the user's intended meaning. Separate domain concepts from
implementation labels; make important relationships and invariants explicit.
Separate observed project facts from assumptions and transient task status.

Test understanding through relationships, not just definitions. Could a reader
explain in their own words what the system promises, which component decides,
and how the result reaches its consumer? If every term is defined but that
explanation is impossible, identify the missing connection instead of adding
more glossary entries. Look for definitions and linked context before reporting
a gap; ordinary engineering terms need not be redefined.

Persist knowledge only where it prevents repeated confusion or rediscovery, or
when the user asks. Reuse the project's existing instructions, glossary, or
documentation owner first; a small existing file may be enough. Keep stable
invariants, architecture relationships, and terms apart from temporary task
progress, which belongs in explicit task notes or the project's worklog. Include
only entries that help decisions, with source links when useful, and update
consumers of renamed concepts without inventing a second source of truth. Record
why a constraint holds and when it would stop applying, not just its current
value. Existing tests or validation may already preserve the rule; do not turn
an enforceable invariant into another paragraph agents must remember.

No `.do-it` tree is required. For an explicit bootstrap request, the files in
[templates](templates/README.md) are optional starting points: create only
useful missing files, preserve existing contents, and explain where the project
should maintain them. Do not automatically migrate, overwrite, or remove user
plans, profiles, memory, or old directories.
