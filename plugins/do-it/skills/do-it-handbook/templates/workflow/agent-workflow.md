# Agent Workflow

Execution flow for non-trivial work. Light-tier mechanical edits skip
most of this; Standard and Heavy tiers follow it.

## Per-Card Pipeline

1. Read the relevant task card (under `.do-it/plans/`) or PR brief.
   If the work area only has a README and no card, read the README
   and split a task card or get explicit user scope before
   implementing code.
2. Read `invariants.md`.
3. Read the affected handbook pages (`architecture.md`,
   `code-map.md`, the relevant glossary entries).
4. Freeze scope from the card's §2-§5.
5. For multi-package or live-path work, map the producer / consumer
   path before dispatching a worker.
6. Write or update tests first when practical
   (see `do-it-tdd`).
7. Implement the smallest change that satisfies the card.
8. Verify using the card's §5 commands.
9. Run `do-it-review-loop` against the diff before marking
   the card done.
10. Run a targeted doc/code consistency sweep for changed contracts.

## Per-Wave Pipeline

A "wave" is a set of cards that share a goal and may need to land
together.

1. Confirm every card has a clear `Prerequisite`, `Blocks`, and
   readiness target.
2. Execute independent cards in parallel only when their **write
   sets do not overlap**. Cards that touch shared barrel files
   (e.g. package index files) MUST serialize through a barrel-update
   card.
3. Stop dependent workers when the prerequisite card is still under
   review or when shared-contract work is not yet green.
4. Review each card against `invariants.md` and its acceptance
   criteria.
5. Re-review every fix loop before merge; worker `DONE` is not an
   acceptance signal.
6. Update `runtime-status.md` after each completed card.

## Phase / Worktree Pipeline

When the work spans multiple waves or touches risky shared files:

1. Create an isolated worktree (`do-it-worktree-isolation`).
2. Verify the intended base branch and record its current status.
3. Dispatch card or wave workers from the phase controller only
   after the controller freezes scope, dependencies, shared-file
   ownership, and merge order.
4. Keep phase work out of the main checkout until build, tests, and
   review/fix-loop closure on the phase branch are complete.
5. Merge back to main only after the final reviewer pass reports
   zero unresolved Blocking or Important findings on the integrated
   branch.
6. After merging, rerun gate verification on `main`. Evidence from
   the worktree alone is not enough for closeout.

## Anti-Tail Discipline

- **One card, one goal.** If you discover the card needs two goals,
  split it before continuing.
- **No silent scope expansion.** A new file outside §2 means open a
  backlog issue or update §2 explicitly.
- **No mocking the database in integration tests** unless the card
  says so. Mock/prod divergence is a recurring incident class.
- **No commit during a fix loop without re-running review** — partial
  fixes ship under the cover of "addressed".

## Light-Tier Shortcut

For Light-tier work (mechanical refactors, one-symbol renames,
dependency bumps):

1. Skip the per-card pipeline; describe scope inline in the PR.
2. Verify with the smallest test command that touches the changed
   surface.
3. No handbook updates required unless `code-map.md` would otherwise
   become wrong.
