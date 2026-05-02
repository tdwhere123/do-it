# `.do-it/CONTEXT.md` Format

This is the canonical shape for the per-project context file consumed by `do-it-grill`, `do-it-planning`, and other workflow skills. Keep the file terse, declarative, and under ~200 lines.

## Sections

```markdown
# CONTEXT

## Terms

- **<term>** (aliases: <comma-separated list of phrases to NOT use>): <one-sentence definition>.
- **<term>**: <definition>.

## Invariants

- <hard rule the system depends on but does not enforce structurally>. (origin: <one of: legal, perf, contract, data-shape, deployment>)
- <invariant>. (origin: …)

## Relationships

- <A> :: <B> — <cardinality> — <key constraint or note>.
- <A> :: <B> — <cardinality>.
```

## Worked example

```markdown
# CONTEXT

## Terms

- **prompt** (aliases: input, request, message): the raw text the user typed in the current Claude Code turn before any hook expansion. Distinct from `system-reminder` which the hooks emit.
- **session_id**: the Claude Code conversation identifier; stable across compaction; resets across `/clear`.
- **tier**: one of Light / Standard / Heavy as classified by `hooks/router.sh`. Influences which downstream skills auto-activate.

## Invariants

- Hooks must complete in <1s wall time. (origin: deployment — Claude Code times out at 25s but UX needs <1s.)
- `do-it install` is byte-equal across reruns when no source changed. (origin: contract — `do-it doctor` relies on this.)

## Relationships

- session :: state.json — 1:1 — file at `${CLAUDE_PLUGIN_DATA}/sessions/<id>/state.json`, written by hooks via `do_it_session_state_set`.
- skill :: agent — N:N — agents may load multiple skills; skills may be referenced by multiple agents.
```

## Style rules

- **Declarative not narrative.** No "we used to…", no "originally…". State the current truth.
- **One line per entry.** Wrap with two-space indent if you must, but rarely needed.
- **Aliases get killed, not coexist.** If you list `(aliases: …)` you are committing to use the canonical term in code reviews and docs.
- **Origin is optional but valuable** for invariants — when something later "doesn't make sense", `(origin: legal)` tells the next reader they cannot just remove it.
- **Cardinality is not optional** for relationships. `1:1`, `1:N`, `N:M` — pick.

## Anti-patterns

- Tutorials → README.
- TODO lists → `.do-it/plans/<task>.md`.
- Architecture rationale → ADR / `docs/`.
- Code samples → tests / examples in source.
- Long-form prose under any section heading.

## Drift detection

When you change code, ask: "does this invalidate any line in `.do-it/CONTEXT.md`?". If yes, update CONTEXT in the same commit. The file is allowed to drift slightly behind code, but should not be allowed to drift opposite to it.
