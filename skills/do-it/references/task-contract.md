# Task Contract v1

The durable work object for do-it. It records the confirmed world and
completion conditions. It is not a construction log, brainstorm transcript, or
progress tracker.

Runtime may point at one contract path. Git, evidence events, and the
worktree show progress. Cite `core §r-scope` and `core §r-verify` rather than
restating those rules here.

## When to persist

Create `.do-it/plans/<task>.md` only when at least one is true:

- a wrong decision is expensive or hard to reverse;
- another session or agent must continue the same work;
- several settled decisions must survive a context clear;
- there is a real dependency order or independent delivery unit;
- acceptance is easy to lose during implementation;
- the user asked for a written plan.

Otherwise finish in chat. Do not manufacture a file to look organized.

## Template

```markdown
---
schema: do-it/task-contract/v1
task_id: <stable-kebab-id>
---

# <Task title>

## Goal
<One observable outcome.>

## Decisions
- D1 [user|evidence|choice|assumption] <Decision another executor must not re-derive.>

## Boundary
- In: <authorized causal surface>
- Preserve: <contracts/behavior that must not change>
- Out: <explicit exclusions>

## Acceptance
- A1 <observable completion condition>
- A2 <observable completion condition>
```

Optional earned extensions, present only when they change execution:

```markdown
## Change Map
## Units
## Open
## Rejected
```

Empty sections, `N/A` filler, and progress checkboxes are invalid.

## Provenance

| Tag | Meaning | Settled? |
| --- | --- | --- |
| `[user]` | The user explicitly decided | Yes, until they reopen it |
| `[evidence]` | Current repository or runtime fact decides | Yes, until invalidating evidence |
| `[choice]` | Compared routes and picked one | Yes, without new invalidating evidence |
| `[assumption]` | Not yet proved | No — cannot masquerade as settled |

Reopen a settled decision only with invalidating evidence (`core §r-scope`).

## Readiness

Build may start when remaining unknowns cannot change:

- Goal;
- user-visible behavior;
- load-bearing authority or boundary;
- irreversible choice or cutover;
- Acceptance;
- whether a credible proof path exists.

Helper names, local function splits, and cheap-to-discover implementation
detail do not block.

## Runtime pointer

`.do-it/runtime/active-task` holds one repo-relative contract path. It is not a
second copy of the task. Clear it on close, merge, or drop. Each worktree has
its own runtime directory.

The older `.do-it/runtime/pointer` slug file is a best-effort hint only; the
contract file is authoritative when both exist.

## Validation

`node scripts/validate-task-contract.mjs <file>` checks required headings,
unique A-IDs, and the progress-checkbox ban. It does not judge whether the
work should have been persisted.
