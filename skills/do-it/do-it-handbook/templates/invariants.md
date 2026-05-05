# Invariants

Rules that always win over lower-level docs and per-task convenience.
A change to this file is a project-shape decision, not a routine edit.

> Replace the placeholder sections below with the project's actual
> invariants. Keep the file short — invariants are load-bearing, not
> aspirational.

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

9. A worker `DONE` claim is not an acceptance signal; the review
   protocol in `workflow/review-protocol.md` decides acceptance.
10. Closeout requires fresh verification evidence on the integrated
    branch; evidence from an isolated worktree alone is not enough.

## How To Add Or Change An Invariant

- Open a task card. Invariant changes are not back-channel edits.
- Reference the invariant by number in the card and in the PR.
- Add the change reason in `glossary.md` if the new invariant
  introduces a term.
- After landing, sweep the codebase for places that contradict the new
  invariant and either fix them or open a backlog issue with a close
  condition.
