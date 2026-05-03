---
name: do-it-grill-log
description: "Problem: grills blur facts and choices, so pending preferences block work or vanish. Fix: log each item as kind fact or decision with the right status."
---

# Do-It Grill Log

## Purpose

`.do-it/grill/<task>.md` is the per-task artifact that records every fact or decision grilling has actually pressure-tested, the cheap falsifier you used when one exists, and the resolution. It outlives any single chat turn and feeds `do-it-planning` and `do-it-verification-gate`.

Without it, grilling is just a vibe — once context compacts, every signal is gone.

## When To Use

- Inside `do-it-grill` after a fact has been tested or a user decision has been made — write the result here.
- Inside `do-it-planning` to confirm no unresolved item blocks the plan.
- Inside `do-it-verification-gate` (and the gate hook) — fail closeout only when an unresolved decision still changes execution or a factual premise is still unverified.

## File Path

```
.do-it/grill/<task-slug>.md
```

`<task-slug>` should be:

- the slug from the user's task title (lowercased, dash-separated, ≤32 chars), if one is obvious;
- otherwise the first 8 characters of the SHA-1 of the user's first prompt this turn;
- prefixed with the short session id when collisions are likely (e.g. `s1a2-fix-login`).

`<cwd>/.do-it/grill/.gitkeep` should exist so the directory tracks in version control.

## File Format

```markdown
---
task: <one-line title>
session_id: <id>
created: <YYYY-MM-DD>
status: open
---

## Items tested

- [ ] **<the load-bearing fact or decision, stated as a claim>**
  - kind: <fact | decision>
  - falsifier: <the cheap check used to test a fact, or `user choice required` for a decision>
  - status: <confirmed | refuted | chosen | deferred | needs_user_decision>
  - evidence: <link / file:line / grep output snippet>

## Anchored terms

- **<term>**: <definition> ← from CLAUDE.md / .do-it/CONTEXT.md / clarified this turn

## Failure modes considered

- correctness: ...
- contract: ...
- migration: ...
- performance: ...
- security: ...
- UX: ...
```

Use `confirmed` / `refuted` only for facts. Use `chosen` / `deferred` / `needs_user_decision` only for user preferences or product decisions. A `needs_user_decision` item blocks only when it changes the next execution step. When every blocking item is resolved, change frontmatter `status: open` → `status: resolved`.

## Style rules

- One bullet per item. No nested bullets in the bullet body — each item is independent.
- Falsifier must be cheap and deterministic. "Read the spec" is not a falsifier; "grep -F 'createOrder' src/" is.
- Evidence is the literal artifact: a path, a line number, a snippet of output. Never paraphrase.
- "Anchored terms" entries get sedimented to `.do-it/CONTEXT.md` (see `do-it-context`) — this section is just a working pad.
- Failure modes section captures predicted modes by category; it is permission-to-stop-thinking, not a binding promise.
- Do not mark a user preference as `confirmed`; if the user chose it, use `chosen`.
- Do not block closeout on a `deferred` preference unless the current implementation still depends on it.

## Append-only discipline

- New items are appended; existing items are mutated in place (`needs_user_decision` → `chosen`/`deferred`, or fact status filled in). Never delete an item — refute or defer it instead.
- The frontmatter `status` flips to `resolved` once no execution-blocking item remains. Do not flip it back to `open` retroactively without a new entry explaining why.

## Worked example

```markdown
---
task: dedupe grill across same session
session_id: s1a2
created: 2026-05-02
status: resolved
---

## Items tested

- [x] **Same-session re-grill is wasted unless prompt diverges materially.**
  - kind: fact
  - falsifier: count tokens injected for back-to-back implement requests in one transcript.
  - status: confirmed
  - evidence: hooks/grill-prompt.sh:38 — emits ~300 tokens; second call adds zero signal.
- [x] **Question turns must not consume the real same-session grill marker.**
  - kind: fact
  - falsifier: simulate question prompt followed by work prompt and inspect session state.
  - status: confirmed
  - evidence: hooks/router.sh sets `last_prompt_kind`, while hooks/grill-prompt.sh treats `grilled=1` as the real de-dup marker.

## Anchored terms

- **grilled**: a session-state flag in `${session_dir}/state.json`; value `1` means a real grill reminder fired this session. Question turns use `last_prompt_kind=question`.

## Failure modes considered

- correctness: forgetting to flip `grilled=1` would cause repeated injection — covered.
- contract: external scripts reading `state.json` would see new key — acceptable, additive.
```

## Common Rationalizations

- *"I'll record it later."* — Later means after compaction, which means never.
- *"It's obvious why I confirmed this."* — Obvious to you now, not to verification next turn.
- *"This is too small to log."* — Then this premise wasn't load-bearing; you should not have grilled it.
- *"I changed my mind, let me delete that line."* — Mutate decision in place; `refuted` with evidence is more honest.

## Red Flags

- Every fact is `confirmed`. (Are you grilling, or rubber-stamping?)
- All facts are `refuted` and the plan still proceeds unchanged. (Why grill?)
- `status: resolved` with execution-blocking `needs_user_decision` items remaining. (Do not flip status until each blocking item resolves.)
- File grows past ~150 lines for a single task. (Probably needs splitting into sub-tasks, or the task is too broad.)

## Related Skills

- `do-it-grill` — primary writer.
- `do-it-context` — destination for sediment of "anchored terms".
- `do-it-planning` — must read this file before producing the plan card; references the slug in plan frontmatter.
- `do-it-verification-gate` — must check that no execution-blocking unresolved item remains before allowing closeout.
