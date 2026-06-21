# Grill reference — lenses, rationalizations, red flags

Load this when a grill stalls or you want the full challenge set. The loop in `SKILL.md` is enough for the common case; this file is progressive disclosure, not a checklist to run every time.

## Lenses (checks, not personas)

- **Truth** — what is verified locally, and what is only assumed?
- **Necessity** — does this need to exist, or does an existing capability cover it? (decision ladder rung 1)
- **Scope** — what is the smallest complete outcome?
- **Acceptance** — what exact evidence proves the work is done?
- **Interface** — which contract or boundary will another part of the system rely on?
- **Failure** — what is the most likely way this plan ships a bug?
- **Review** — what would a skeptical reviewer block on?
- **Maintenance** — what future churn can be avoided without expanding scope?
- **Delegation** — does each worker have a tier, ownership, verification, and stop condition?

## Rationalizations that should each cost another loop

- *"It feels reasonable."* — Reasonable ≠ verified. Name the evidence.
- *"The user said it works that way."* — Treat as premise. Grep before believing.
- *"It would be a small refactor if wrong."* — Costed in tokens, or in a follow-up sprint? Re-state.
- *"We can fix it in review."* — Maybe; but caught now, review carries fewer findings.
- *"There's no time to anchor terms."* — There's also no time to debug a contract mismatch in production.
- *"Both interpretations probably work."* — Then which one ships? Pick.
- *"We might need it later."* — That is rung 1. Skip it until the need is real.

## Red flags — pause and re-grill

- The user agreeing immediately with whatever you propose. (Confirming, or appeasing?)
- Acceptance criteria that say "looks good" or "works".
- A plan that names `Phase 2` of work that does not yet exist.
- "Should be straightforward" applied to a multi-package change.
- Terms used inconsistently in the same paragraph.
- A review response with zero `Blocking` / `Important` items on a change that touches a public interface.
- A new abstraction, layer, or dependency defended by a longer paragraph than the code it replaces — the prose is complexity smuggled back in.

## Severity

- `Blocking` — must resolve before execution or closeout: can make the work wrong, unsafe, or unverifiable.
- `Important` — should resolve now: can create rework, review failure, or unclear ownership.
- `Opportunity` — useful architecture or quality improvement, not a blocker unless tied to correctness or delivery risk.

## Common mistakes

- Asking five generic questions at once instead of one focused premise.
- Asking open technical questions when assumptions mode would let the user confirm or correct a concrete proposal.
- Challenging in the abstract without reading files.
- Turning every idea into a blocker.
- Asking about facts that codebase exploration can answer.
- Accepting a plan because it sounds reasonable while evidence is missing.
- Treating architecture taste as delivery truth.
- Using a fuzzy term repeatedly without ever defining it back to the user or to `.do-it/CONTEXT.md`.
