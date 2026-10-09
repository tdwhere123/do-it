# Invariants

Project-owned rules, interpreted under the project's actual authority and
change process. Load-bearing invariant changes deserve explicit decisions.

> Optional examples: use only the sections that fit the project, following
> its conventions and existing documentation owners. Replace placeholders
> with actual invariants, not aspirations.

## Architecture

1. _<package or layer>_ owns _<responsibility>_; other layers must not
   redefine that responsibility.
2. _<adapter or boundary>_ is the only legal entry/exit point for
   _<external concern>_; provider-edge types stop at this boundary.
3. _<dependency direction rule, e.g. "domain types live in package X
   and apps import them; no app type leaks into domain">_.

## State And Events

4. _<event log / audit / persistence ordering rule>_.
5. _<who is allowed to mutate runtime truth>_.
6. _<event naming or schema rule>_.

## Contracts

7. _<public API rule, e.g. backward compatibility window>_.
8. _<schema or migration rule, e.g. additive-only writes during dual-
   write windows>_.

## Review

9. A worker `DONE` claim is not an acceptance signal; `do-it-review`
   and current proof decide acceptance.
10. Closeout requires fresh verification evidence on the integrated
    branch; evidence from an isolated worktree alone is not enough.

## How To Add Or Change An Invariant

- Follow the project's decision and review conventions; make the affected
  invariant and reason for changing it clear.
- If a new term needs a definition, use the single existing terms owner
  rather than creating a second glossary or automatically promoting it.
- Check affected code and documentation for contradictions; fix them within
  scope or record the remaining work through the project's usual mechanism.
