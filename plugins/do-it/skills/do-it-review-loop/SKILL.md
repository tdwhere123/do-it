---
name: do-it-review-loop
description: "Use when a delivered diff or worker result needs PR-style correctness review before the parent accepts it."
---

# Do-It Review Loop

## Purpose

Find defects, scope drift, and maintainability risk before closeout. Findings-first, evidence-backed.

**In one sentence:** freeze scope, trace proof path, read diff, emit one batch of findings by severity — no clean claim while Blocking/Important remain.

**Mandatory trigger:** Heavy OR interface-breaking change (`dim_needs_review_loop=1`) — required before any done claim; not for planning/grill/discussion turns. `verification-gate` Stop hook enforces transcript marker. Escape clauses: [`../references/dimensions.md`](../references/dimensions.md). Fix path: `do-it-fix-loop` § Batch vs Pointwise on the complete batch below.

## Completion Criterion

Review is clean only when:

- [ ] Scope frozen (files, commit, range, or task).
- [ ] Proof path mapped and checked ([`../references/workflow-kernel.md`](../references/workflow-kernel.md) § Path Map Chain).
- [ ] Five axes checked at depth required by intensity ([`../references/review-lenses.md`](../references/review-lenses.md) § Review Axes).
- [ ] Comments lens if comments changed; YAGNI lens if new abstraction/export/dependency/`Phase 2` scaffolding ([`../references/review-lenses.md`](../references/review-lenses.md)).
- [ ] Findings emitted as one complete batch (`Blocking` / `Important` / `Opportunity`), severity-ordered.
- [ ] Every Blocking/Important fixed, user-deferred, or sent to `do-it-fix-loop` with batch-vs-pointwise decision.
- [ ] Verification evidence inspected for freshness and surface coverage.

State explicitly any item you cannot check.

## Review Intensity

Canonical axis for review effort — risk-selected, not routing tier synonym:

| Intensity | Who | When |
| --- | --- | --- |
| **review-quick** | Parent inline | Light+touches_code; Standard+low risk; no new dependency/interface |
| **review-deep** | One `reviewer` subagent | Standard+non-local risk, explicit review/subagent request; Heavy without high-risk lenses |
| **review-adversarial** | Parallel multi-lens | Heavy+(breaks_interface OR crosses_packages OR security/migration); any tier if explicit |

Pick smallest intensity covering concrete failure modes; name why if skipping a higher one.

**Lens add-ons (any intensity):** comments lens when comments changed; YAGNI when abstraction/export/dependency/`Phase 2` or write-quality-lint flags — silent skip is a finding.

Heavy adversarial default stack: `reviewer` + `red-team-reviewer` + `spec-compliance-reviewer`; add `architecture-taste-reviewer` if research-first triggers; `code-quality-cleaner` if new abstraction surface; comments lens if comments changed. Heavy multi-lens policy: [`../references/review-lenses.md`](../references/review-lenses.md) § Heavy Multi-Lens Defaults.

### Picking Intensity

- tier=Light, touches_code=1 → review-quick
- tier=Standard + low/local risk → review-quick
- tier=Standard + named non-local risk, explicit review, or subagent request → review-deep
- tier=Heavy + (breaks_interface OR crosses_packages OR security/migration) → review-adversarial
- tier=Heavy other → review-deep + comments lens when applicable

### Inline Self-Review Prompt (review-quick)

Parent runs internally without subagent:

> Review the diff above for: (a) obvious correctness regression, (b) missing tests if behavior changed, (c) error handling at boundaries, (d) comment discipline violations (5 allowed categories: type annotations / @anchor: / see also: / invariant: / tool directives — flag narrative or task-reference comments). Output: Blocking findings only. Emit marker on **its own line, line-anchored**: `inline-review: clean` or `inline-review: <one-line finding>`. **If breaks_interface=1, marker MUST name checked surface** (e.g. `inline-review: interface clean`). Legacy `inline-review-clean: yes` accepted.

`verification-gate` honors marker only at line start in latest assistant text. Under 5KB diff: inline OK; larger → review-deep.

Standard flow summary: freeze scope → goal/coverage contract → map proof path → read diff → check forecast/path map/readiness/evidence → emit complete batch → fix-loop on Blocking/Important. Lens and axis detail: [`../references/review-lenses.md`](../references/review-lenses.md).

## Severity

- **Blocking:** wrong, unsafe, unverifiable, or out of scope.
- **Important:** likely regression, rework, review failure, ownership confusion.
- **Opportunity:** useful cleanup; not required unless tied to correctness.

## Finding Shape

Per [`../references/workflow-kernel.md`](../references/workflow-kernel.md) § Finding Schema: severity; location; issue; cause_class; required_fix; NOT_CHECKED (required even if empty). Optional: stable ID when multiple; repro/witness; prevention for Blocking/Important.

## Closeout Gate

Not clean while Blocking/Important unresolved. Fixable in scope → `do-it-fix-loop` now. Deferred Opportunity must be explicit. Blocking/Important fixes need closure record (cause + prevention).

## Verification

Before calling review clean: scope frozen; axes at required depth; evidence fresh; generated/install/dead-code claims proven when present; no unresolved Blocking/Important. Forecast/path map staleness rules: [`../references/review-lenses.md`](../references/review-lenses.md) § Review Rules.

## References

- Lenses, axes, proof coverage, QA intake: [`../references/review-lenses.md`](../references/review-lenses.md)
- Forecast, path map, shared anti-skip: [`../references/workflow-kernel.md`](../references/workflow-kernel.md)
