---
name: do-it-grill-log
description: "Problem: a grill in turn 1 produces sharp premises that get forgotten by turn 5; planning skips them, verification ignores them, and the same blind spot ships in different shape next sprint. Fix: write each premise (with falsifier and decision) into `.do-it/grill/<task>.md` as it is tested, link from the plan card, and require verification-gate to read it before claiming done."
---

# Do-It Grill Log

## Purpose

`.do-it/grill/<task>.md` is the per-task artifact that records every premise grilling has actually pressure-tested, the cheap falsifier you used, and the resolution. It outlives any single chat turn and feeds `do-it-planning` and `do-it-verification-gate`.

Without it, grilling is just a vibe — once context compacts, every signal is gone.

## When To Use

- Inside `do-it-grill` after a premise has been tested or refuted — write the result here.
- Inside `do-it-planning` to confirm no `pending` premise blocks the plan.
- Inside `do-it-verification-gate` (and the gate hook) — fail closeout if any premise is still `pending`.

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

## Premises tested

- [ ] **<the load-bearing premise, stated as a claim>**
  - falsifier: <the cheap check used to test it (grep, file read, single command)>
  - decision: <pending | confirmed | refuted>
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

When all premises are `confirmed` or `refuted`, change frontmatter `status: open` → `status: resolved`.

## Style rules

- One bullet per premise. No nested bullets in the bullet body — each premise is independent.
- Falsifier must be cheap and deterministic. "Read the spec" is not a falsifier; "grep -F 'createOrder' src/" is.
- Evidence is the literal artifact: a path, a line number, a snippet of output. Never paraphrase.
- "Anchored terms" entries get sedimented to `.do-it/CONTEXT.md` (see `do-it-context`) — this section is just a working pad.
- Failure modes section captures predicted modes by category; it is permission-to-stop-thinking, not a binding promise.

## Append-only discipline

- New premises are appended; existing premises are mutated in place (decision `pending` → `confirmed`/`refuted`, evidence filled in). Never delete a premise — refute it instead.
- The frontmatter `status` flips to `resolved` once the last `pending` premise resolves. Do not flip it back to `open` retroactively without a new entry explaining why.

## Worked example

```markdown
---
task: dedupe grill across same session
session_id: s1a2
created: 2026-05-02
status: resolved
---

## Premises tested

- [x] **Same-session re-grill is wasted unless prompt diverges materially.**
  - falsifier: count tokens injected for back-to-back implement requests in one transcript.
  - decision: confirmed
  - evidence: hooks/grill-prompt.sh:38 — emits ~300 tokens; second call adds zero signal.
- [x] **Heavy tier still warrants full template even on second prompt.**
  - falsifier: simulate Heavy + already-grilled — does TIER==Heavy branch fire?
  - decision: confirmed
  - evidence: hooks/grill-prompt.sh:80 sets TRIGGER=heavy-tier independent of grilled flag.

## Anchored terms

- **grilled**: a session-state flag in `${session_dir}/state.json`; values `1` (grilled this session), `skip-question` (router suppressed grill because turn was a question).

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

- All decisions are `confirmed`. (Are you grilling, or rubber-stamping?)
- All decisions are `refuted` and the plan still proceeds unchanged. (Why grill?)
- `status: resolved` with `pending` items remaining. (Do not flip status until each item resolves.)
- File grows past ~150 lines for a single task. (Probably needs splitting into sub-tasks, or the task is too broad.)

## Related Skills

- `do-it-grill` — primary writer.
- `do-it-context` — destination for sediment of "anchored terms".
- `do-it-planning` — must read this file before producing the plan card; references the slug in plan frontmatter.
- `do-it-verification-gate` — must check that no `pending` premise remains before allowing closeout.
