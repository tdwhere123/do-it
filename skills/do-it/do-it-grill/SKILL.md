---
name: do-it-grill
description: "Problem: hidden assumptions and user-only decisions ship as rework. Fix: verify facts first, ask one decision question only when needed."
---

# Do-It Grill

## Purpose

Use this to pressure-test reasoning before work hardens into code, docs, commits, or claims. The goal is to verify the facts that can be verified locally, expose the decision that actually needs a user choice, and keep hidden delivery risk from leaking into implementation.

`do-it-review-loop` owns delivered diff review, QA intake, and multi-perspective findings. `do-it-grill` challenges whether that review is needed, sufficient, or honestly closed.

## How It Differs From a Q&A Template

A common failure is to dump a 5-question template at the user and call it grilling. That gets shallow, scattered answers. Instead:

1. **One premise at a time.** Pick the single most-load-bearing premise that, if wrong, would invalidate the most downstream work. Ask only that. Wait for the answer. Then pick the next.
2. **Anchor terms before debating intent.** If the user uses a term that has a definition in `CLAUDE.md`, `.do-it/CONTEXT.md`, or visible in code with a different shape — surface the conflict before going further.
3. **Verify, don't ask, when verification is cheap.** If the question can be answered with `rg`, `cat`, or a quick local command, do that and report what you found.
4. **Ask only for decisions.** Ask the user one focused question only when local truth cannot decide a preference, priority, or scope tradeoff that changes execution.
5. **Sediment what you learned.** When a term gets clarified or a constraint surfaces, append it to `.do-it/CONTEXT.md` (one line, declarative). Use `do-it-grill-log` for the per-task `.do-it/grill/<task>.md` artifact (`kind: fact|decision`, falsifier, status, evidence).

## When To Use

Use the grill when:

- the user asks to be grilled, challenged, or stress-tested;
- a plan has multiple plausible paths;
- acceptance criteria are vague;
- architecture, interface, release, phase, wave, or multi-agent coordination is involved;
- a review response seems too agreeable or under-evidenced;
- a closeout claim may outrun verification.

Skip the grill for tiny mechanical edits with obvious acceptance checks.

## Tier Rules

### Light

Use for bounded work:

- inspect the nearest truth;
- name the one assumption or risk that could change the route;
- ask at most one question, and only if a preference is needed;
- recommend the next route.

### Standard

Default for subagents and ordinary non-trivial planning:

- inspect code/docs/tests before asking;
- pick the single highest-leverage premise — ask, verify, decide, then move to the next;
- challenge goal, non-goals, acceptance, sequencing, and verification;
- return blockers, important risks, options, and a recommendation.

### Heavy

Parent-only unless explicitly assigned:

- wave, phase, architecture, interface, release, or multi-agent decisions;
- codebase exploration is mandatory;
- include scope lock, verified facts, decision options, gates, and residual risk.

## The Iterative Loop

Run this loop until every execution-blocking item is resolved: facts become `confirmed` or `refuted`, while user preferences become `chosen`, `deferred`, or `needs_user_decision`.

1. **Pick the most load-bearing premise.** What single belief, if wrong, would change the most downstream decisions?
2. **Try to falsify cheaply.** Read the file, grep for the symbol, run the unit test, glance at the schema. If you find evidence, jump to step 4.
3. **Ask one focused question** only when the remaining unknown is a user decision. Recommend a default option so the user has something to push back on.
4. **Record the outcome** in `.do-it/grill/<task>.md` (see `do-it-grill-log`). Use `kind: fact` with `confirmed/refuted` for evidence, or `kind: decision` with `chosen/deferred/needs_user_decision` for user preferences.
5. **Repeat** with the next-most-load-bearing premise, until the remaining unknowns no longer change the route.

## Anchoring Terms

When a term feels fuzzy, before you debate it:

1. Search `CLAUDE.md`, `.do-it/CONTEXT.md`, and `docs/` for an existing definition.
2. If a definition exists and the user is using it differently, **call out the conflict immediately**. Quote both definitions side by side. Ask which one applies.
3. If no definition exists and the term will be re-used, propose one in CONTEXT-FORMAT shape (see `do-it-context`) and write it back.
4. Avoid synonyms — if `payload` and `event body` mean the same thing in this conversation, pick one and stick to it.

## Code Reverification

When the user makes a factual claim about behavior ("the validator already checks X", "this is called from one place", "we don't ship Y in prod"):

1. Treat it as a premise, not a fact.
2. `grep` / open the file. Two minutes of reading beats five minutes of debate.
3. If the code disagrees, surface the disagreement with a path:line citation.
4. Update the grill log with the verified state.

## Lenses

Use these as checks, not personas:

- Truth: What has been verified locally, and what is only assumed?
- Scope: What is the smallest complete outcome?
- Acceptance: What exact evidence proves the work is done?
- Interface: Which contract or boundary will another part of the system rely on?
- Failure: What is the most likely way this plan ships a bug?
- Review: What would a skeptical reviewer block on?
- Maintenance: What future churn can be avoided without expanding scope?
- Delegation: Does each worker have a tier, ownership, verification, and stop conditions?

## Common Rationalizations

These are the "I'm done grilling" excuses that should each cost you another loop:

- *"It feels reasonable."* — Reasonable ≠ verified. Name the evidence.
- *"The user said it works that way."* — Treat as premise. Grep before believing.
- *"It would be a small refactor if wrong."* — Costed in tokens or in a follow-up sprint? Re-state.
- *"We can fix it in review."* — Maybe; but if grill catches it now, review carries fewer findings.
- *"There's no time to anchor terms."* — There's also no time to debug a contract mismatch in production.
- *"Both interpretations probably work."* — Then which one ships? Pick.

## Red Flags

Pause and re-grill when you see:

- The user agreeing immediately with whatever you propose. (Are they confirming or appeasing?)
- Acceptance criteria that say "looks good" or "works".
- A plan that names `Phase 2` of work that doesn't yet exist.
- "Should be straightforward" applied to a multi-package change.
- Terms used inconsistently in the same paragraph.
- A review response that has zero `Blocking` / `Important` items but the change touches a public interface.

## Codebase Exploration

For Standard and Heavy grills, inspect enough current truth to avoid theater:

- current diff and dirty files in scope;
- owning modules, call paths, tests, docs, or plans;
- existing terminology and conventions;
- nearby working examples;
- verification commands or evidence surfaces.

Stop exploration when the next unknown is a real user decision or the facts are sufficient to recommend a route.

## Output Shape

For a light grill:

- current truth checked;
- one route-changing assumption or risk;
- one question only if user preference blocks the next action;
- recommended route.

For a standard grill:

- current truth checked;
- grill log items (facts confirmed/refuted; decisions chosen/deferred/needs_user_decision) — usually written to `.do-it/grill/<task>.md`;
- blockers;
- important risks;
- options considered;
- recommended path;
- verification and review checks.

For a heavy grill:

- scope lock;
- verified facts;
- blockers;
- important risks;
- non-blocking opportunities;
- decision options with one recommended path;
- verification and review gates that must be satisfied.

## Severity

- `Blocking`: Must resolve before execution or closeout because it can make the work wrong, unsafe, or unverifiable.
- `Important`: Should resolve now because it can create rework, review failure, or unclear ownership.
- `Opportunity`: Useful architecture or quality improvement, but not a blocker unless tied to correctness or delivery risk.

## Common Mistakes

- Asking five generic questions at once instead of one focused premise.
- Challenging in the abstract without reading files.
- Turning every idea into a blocker.
- Asking about facts that codebase exploration can answer.
- Accepting a plan because it sounds reasonable while evidence is missing.
- Treating architecture taste as delivery truth.
- Using a fuzzy term repeatedly without ever defining it back to the user or to `.do-it/CONTEXT.md`.

## Related Skills

- `do-it-context` — set up and maintain `.do-it/CONTEXT.md` with project terms and invariants.
- `do-it-grill-log` — write per-task `.do-it/grill/<task>.md` artifacts (`kind`, falsifier, status, evidence).
- `do-it-planning` — consume the grill outcome into a plan card under `.do-it/plans/<task>.md`.
- `do-it-review-loop` — apply pressure to the delivered diff after grilling has set the bar.
