---
name: do-it-grill
description: "Pressure-test the load-bearing premises and necessity of a plan before it hardens into code, commits, or claims. Use when hidden assumptions or user-only decisions gate planning, implementation, or closeout, or when asked to grill, challenge, or stress-test."
---

# Do-It Grill

Pressure-test reasoning before it hardens into code, commits, or claims. Verify the facts you can verify locally, challenge whether the work needs to exist at all, and surface the one decision that genuinely needs the user — then stop.

**In one sentence:** be relentless — one premise at a time, falsify with code first, ask the user only when local truth cannot decide, and always offer a recommended default.

`do-it-brainstorm` diverges (maps requirement shape and options) and runs first when both run; grill converges and never re-diverges. `do-it-review-loop` reviews a delivered diff; grill challenges whether that review is needed, sufficient, or honestly closed.

## The loop

Run until every load-bearing premise is either verified against a source or logged as an explicit user decision — no execution-blocking unknown remains.

### Completion criterion

Grill is done only when:

- [ ] Necessity has been checked (decision-ladder rung 1: does this need to exist?).
- [ ] Every premise that could change the route is confirmed, refuted, or logged as a user decision.
- [ ] Each user decision names 2-3 options, the tradeoffs, and the recommended default you chose.
- [ ] The grill log (`.do-it/grill/<task>.md`) reflects the current state with citations or explicit user choices.

If you reach a point where the next execution step depends on an unresolved user preference, stop and ask that one question. Do not proceed past an open decision.

1. **Necessity first.** Before grilling *how*, grill *whether*: does this need to exist, or does an existing capability already cover it? This is the decision ladder's rung 1 (see `do-it-router` § Restraint) and is usually the most load-bearing premise.
2. **Pick the most load-bearing premise.** The single belief that, if wrong, changes the most downstream work. One at a time — do not dump a five-question template; that gets shallow, scattered answers.
3. **Falsify it cheaply — explore, don't ask.** If `rg`, opening the file, or a quick test can settle it, do that and cite `path:line`. Treat every user claim about behavior ("X is already validated", "called from one place") as a premise to grep, not a fact; if the code disagrees, surface the disagreement with a citation.
4. **Ask only for decisions — one at a time, with a recommended answer.** When local truth cannot decide a preference, priority, or scope tradeoff, ask one focused question: one or two sentences of why-it-matters-now, 2-3 real options with benefit/cost/risk, and your recommended default so the user has something concrete to accept or correct. If the user answers only part, record the settled part and ask the next smallest unresolved decision.

### Question-tool discipline

A "focused question" must be delivered as a single decision, not as a paragraph of three questions. If the host exposes a question tool (e.g. `question`), use it for every user decision. Each call must:

- ask exactly one thing the next step depends on;
- provide 2-3 real options, not one option dressed up three ways;
- state the benefit, cost, and risk of each option in one line;
- name a recommended default;
- pause for the answer before asking the next question.

Do not batch unresolved decisions into a single prose message. Do not ask "What do you think?" without options. Do not recommend an option unless you can also explain the tradeoff that makes it the default.
5. **Record and sediment.** Log each result in `.do-it/grill/<task>.md` (§ Grill log). When a term or constraint gets clarified, append one declarative line to `.do-it/CONTEXT.md`.

## When to use / skip

Grill when: asked to grill, challenge, or stress-test; a plan has multiple plausible paths; acceptance criteria are vague; architecture, interface, release, phase, wave, or multi-agent coordination is involved; a review response seems too agreeable or under-evidenced; a closeout claim may outrun verification.

Skip for tiny mechanical edits with obvious acceptance checks.

## Tiers

- **Light** — bounded work: inspect the nearest truth, name the one route-changing assumption or risk, ask at most one question (only if a preference blocks the next step), recommend the route. Does not consume brainstorm.
- **Standard** — default for subagents and ordinary non-trivial planning: inspect code/docs/tests before asking, run the loop premise by premise, return blockers, important risks, options, and a recommendation. Must read a brainstorm artifact when one exists.
- **Heavy** — parent-only unless assigned: wave/phase/architecture/interface/release/multi-agent decisions; codebase exploration is mandatory; return scope lock, verified facts, decision options with one recommendation, gates, and residual risk.

## Anchoring terms

When a term feels fuzzy, before debating it: search `CLAUDE.md`, `.do-it/CONTEXT.md`, and `docs/` for an existing definition. If one exists and the user is using it differently, quote both side by side and ask which applies. If none exists and the term will recur, propose one (CONTEXT-FORMAT shape, see `do-it-context`) and write it back. Pick one term per concept; do not let synonyms (`payload` vs `event body`) drift in the same conversation.

## Assumptions mode

When the user may lack the technical vocabulary, or the codebase has strong existing patterns, do not ask open technical questions. Read current truth first, state the assumptions you would use if the user said nothing (with confidence and evidence), and ask the user to confirm or correct only the one that changes the most downstream work. Rephrase technical choices in product or operator language when that is clearer. Verify cheap assumptions instead of asking; present genuine preferences as a choice — never smuggle an unverified preference in as an assumption.

## Convergence after brainstorm

When `.do-it/brainstorm/<task>.md` exists with `status: open` (Standard/Heavy must read it; Light only skims):

1. Read `Requirement Shape`, `Options`, `Architecture Foundation`, and the `Must Resolve In Grill` list — each entry is a candidate premise the lenses thought a human or local verification had to settle.
2. Rank by route-impact (cross-lens tensions usually outrank single-lens one-offs) and resolve each via the loop.
3. Add `brainstorm: <slug>` to the grill log frontmatter so `do-it-planning` and `do-it-verification-gate` can trace the lineage.
4. Once every execution-blocking item is resolved, flip the brainstorm artifact's `status: open` → `converged`. Do not delete it. Do not regenerate lens angles inside grill — if a lens return is thin, re-run that brainstorm lens with narrower scope.

## Grill log

Record every pressure-tested fact or decision in `.do-it/grill/<task>.md` so the signal survives context compaction and feeds `do-it-planning` and `do-it-verification-gate`. Standard and Heavy write it; Light and discussion-first may keep it inline.

`<task-slug>`: the user's task title (lowercased, dash-separated, ≤32 chars), else the first 8 chars of the SHA-1 of the first prompt; prefix with the short session id on collision. Keep `.do-it/grill/.gitkeep` so the directory tracks in git.

```markdown
---
task: <one-line title>
session_id: <id>
created: <YYYY-MM-DD>
status: open            # → resolved when no execution-blocking item remains
brainstorm: <slug>      # only when converging a brainstorm artifact
---

## Items tested
- [ ] **<the load-bearing fact or decision, stated as a claim>**
  - kind: <fact | decision>
  - status: <confirmed | refuted | chosen | deferred | needs_user_decision>
  - evidence: <file:line / grep output / explicit user choice — the literal artifact, never paraphrased>

## Anchored terms
- **<term>**: <definition> ← from CLAUDE.md / .do-it/CONTEXT.md / clarified this turn
```

Use `confirmed`/`refuted` only for facts, `chosen`/`deferred`/`needs_user_decision` only for decisions. Append new items and mutate existing ones in place — never delete an item; refute or defer it with evidence. Anchored terms sediment to `.do-it/CONTEXT.md` (see `do-it-context`). A `needs_user_decision` item blocks only when it changes the next execution step; flip `status: resolved` once none remain.

## Reference

The challenge taxonomy (eight lenses), the "I'm done grilling" rationalizations to push past, red flags that warrant another loop, severity definitions, and common mistakes live in [`references/checks.md`](references/checks.md). Load it when a grill stalls or you need the full lens set; the loop above is enough for the common case.

## Related skills

- `do-it-router` — sets tier and owns the decision ladder that grill's necessity rung references.
- `do-it-brainstorm` — divergent pass that runs first; produces the open decisions grill converges.
- `do-it-context` — `.do-it/CONTEXT.md` is the sediment destination for anchored terms.
- `do-it-planning` — consumes the grill outcome into a plan card under `.do-it/plans/<task>.md`; reads the grill slug.
- `do-it-review-loop` — applies pressure to the delivered diff after grilling sets the bar.
