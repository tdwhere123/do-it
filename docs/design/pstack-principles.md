# pstack Principles — Source And Disposition

Decision record for absorbing pstack engineering-principle *reasoning
moves* into existing do-it skill owners. It is not a skill, checklist, or
runtime. No model A/B was run; writing quality and measured task
effectiveness stay separate.

## Source

Inspected at research time by cloning
[michael-denyer/pstack-claude](https://github.com/michael-denyer/pstack-claude).
`HEAD` was already the previously verified revision:

- **Revision:** [`79b36d9b53a53c78e5ec26bf6ce7dade76686c87`](https://github.com/michael-denyer/pstack-claude/tree/79b36d9b53a53c78e5ec26bf6ce7dade76686c87)
  (`79b36d9 Drop the pi agent tools: off prompt sentence, release 0.9.128`)
- **License:** MIT (`LICENSE`). Copyright (c) 2026 Lauren Tan; (c) 2026
  Michael Denyer.
- **Lineage:** `NOTICE.md` attributes `plugins/pstack/skills/principle-*/`
  to [cursor/plugins/pstack](https://github.com/cursor/plugins/tree/e46364b8be46000b7df0f260550cd712afbb8d36/pstack)
  (and later cursor/plugins/pstack commits named there), MIT, (c) 2026
  Lauren Tan. The Claude port's modifications are (c) 2026 Michael Denyer.

**Paths read (bodies, frontmatter, and the principle index):**

- `plugins/pstack/skills/poteto-mode/SKILL.md` (Principles index)
- `plugins/pstack/skills/principle-*/SKILL.md` (24 leaves)
- Related context only: `plugins/pstack/skills/architect/SKILL.md`,
  `plugins/pstack/skills/architect/references/design-red-flags.md`,
  `plugins/pstack/hooks/pre-tool-use.sh` (host-model gate, not a principle
  checker)

Several leaves are description-heavy; the body is a fragment
(`exhaust-the-design-space`, `migrate-callers-then-delete-legacy-apis`,
`guard-the-context-window`, `encode-lessons-in-structure`). Dispositions
use the leaf that actually states the move (frontmatter, body, or index
line), not a paraphrase of this file.

These are original do-it adaptations, not vendored prompt text. Rejected
as product shape: 24 principle skills, a mandatory 24-step checklist,
keyword bans for architecture judgment, a persistent policy database, and
expanding the Core bootstrap excerpt (642 characters; unchanged).

## Nearby valid cases (apply to every row)

- Foundations are data, legal states, and access patterns — not a
  premature framework.
- Subtraction must not violate an actual compatibility promise or delete
  recovery or history the contract still needs.
- Two or three options are for consequential unfamiliar choices, not
  every edit.
- A reusable script must repay its cost; it is not compulsory.
- Bounding context does not justify dropping user decisions or needed
  evidence.
- Continuing authorized reversible work does not authorize secrets,
  spend, destruction, or push.
- Temporary breakage does not authorize exposing a broken intermediate
  to live consumers, including live-linked callers that would reload it.

## Disposition key

- **strengthened** — unique question, counterexample, or distinction
  added to the named owner.
- **covered** — current owner already carries the move; listed so this
  file is complete.
- **executable** — a deterministic check already owns the detectable
  fragment; no new family.
- **exception** — deliberately not imported, or imported only with the
  nearby valid case.

No new hook. Architecture necessity, premises, and domain modeling are
not keyword-detectable without brittle false positives. Advisory
write-quality families remain exit 0 and data-only.

## The 24

| # | Principle | Disposition | Owner | Executable fragment | Why this owner / limit |
| --- | --- | --- | --- | --- | --- |
| 1 | Laziness Protocol | strengthened | Code Quality; detail in `causal-change.md` | `copy-paste`, `no-consumer`, `edit-bloat` (proxies) | Smallest *structurally correct* change, not fewest lines. One owner for a repeated decision, not a prescribed flag. Collapsing a pass-through is not smaller if it is a contract, policy, dependency, or compatibility boundary. |
| 2 | Foundational Thinking | strengthened | Architecture | `type-escape` only for contract bypass | Data, legal states, and access patterns before business branches. Not “tests before features” as ceremony; not a framework around one feature. |
| 3 | Redesign from First Principles | strengthened | Architecture | none | Day-one question, then verifiable steps. Distinct from attacking a false *fact* (row 4). Not every additive change. |
| 4 | Attack the Premise | strengthened | Code Quality | none | Write the shared assumed fact; observe what would differ if it were false. A cleanup path that always runs is compensation, not a test. |
| 5 | Subtract Before You Add | strengthened | Code Quality; Review maintainability | `no-consumer` | Remove leftover complexity that would force a new layer. Do not drop compatibility, recovery, or history. |
| 6 | Minimize Reader Load | strengthened | Review maintainability lens | `file-size`, `edit-bloat` (LOC proxies) | Layers to trace *and* hidden state to hold. Line count is a proxy. Collapse pass-throughs that only repeat current branch logic; keep needed boundaries. |
| 7 | Outcome-Oriented Execution | strengthened | Architecture | none | Temporary breakage only inside an authorized isolated migration live consumers will not load; the destination still needs a complete check. Reversibility is not a live-reload license. Not a rollout framework. |
| 8 | Experience First | strengthened | Decide | none | Name the consumer (end user, caller, next reader). Foundations serve that target; they do not replace it. |
| 9 | Exhaust the Design Space | strengthened | Decide | none | Two or three *structurally* different options when the choice is consequential and unprecedented. Ordinary edits do not need a bake-off. |
| 10 | Build the Lever | strengthened | Code Quality | none (compulsory script would be wrong) | First unit by hand, then the smallest rerunnable script when a reviewer must replay the work. Distinct from encoding a *recurring instruction* (row 24). |
| 11 | Model the Domain | strengthened | Architecture | `case-list` is bash-only and weak | States, types, registries. Sign of skip: another branch that must stay in sync, or modules named only for load-validate-save. |
| 12 | Boundary Discipline | strengthened | Architecture | none | Validate untrusted data where it enters. Re-checking deeper is not a missing boundary; a boundary check is not enough if another writer can enter (existing bypass test, which pstack's “trust internals unconditionally” would weaken). |
| 13 | Type System Discipline | strengthened | Architecture (invalid states); Code Quality bypass/replace | `type-escape` | Make invalid combinations unrepresentable. No TypeScript skill, no branding liturgy. |
| 14 | Make Operations Idempotent | covered | Architecture + `stateful-change-scan.md` Identity/Commit | none | Already: same identity twice; timeout after durable write. Strengthened only by “independent facts before a lock” (row 16). |
| 15 | Migrate Callers Then Delete Legacy APIs | strengthened | Architecture | `no-consumer` after migration | Only with no external compatibility promise. A configured reference is still a caller. |
| 16 | Separate Before Serializing Shared State | strengthened | Architecture; scan Interleaving | none | Independent facts get independent state; a lock is a smell to check, not the default. |
| 17 | Prove It Works | strengthened | Verify | `test-weakened`, `test-fiction` | Native artifact over compile/log/delegate claim. When evidence conflicts, inspect what each observed. Do not change a production contract to obtain stronger proof. |
| 18 | Fix Root Causes | strengthened | Code Quality | `swallow-error` (hides faults) | Repair the causal producer in the owned chain. Fail-fast at the admission boundary is not a symptom patch; silently normalizing an impossible internal state is. |
| 19 | Sequence Verifiable Units | strengthened | Decide | none | Independently checkable increments. A later unit must not be the first proof that an earlier one worked. |
| 20 | Test Behavior Not Implementation | strengthened | Code Quality; `causal-change.md` feedback | `test-fiction` | Two imagined edits: wrong observable fails; internals-only change does not. Do not weaken closed-set validators in the name of “test behavior.” |
| 21 | Explain the Number | strengthened | Verify (claim); `causal-change.md` Optimization (method) | none | Named limiter, noise, matching workload. A gain larger than local cost needs traced secondary effects or proof the changed work ran; it is not automatically invalid. |
| 22 | Guard the Context Window | strengthened | `workflow-kernel.md`; Core already keeps parent integration | none | Bound independent slices. Do not drop decisions, authorization, or needed evidence. No turn-budget hook. |
| 23 | Never Block on the Human | strengthened | Decide; Core authorization | opt-in `strict-external-actions` for named publish/apply | Advance authorized reversible work. Still stop for intent, authority, secrets, spend, destruction, or push. |
| 24 | Encode Lessons in Structure | covered | Retrospective, Skill Authoring, Context | the write-quality families themselves | Prefer test/type/lint/script over a reminder that restates them. No new family; no policy database. |

## Existing checks that already own a fragment

See [`write-quality-families.md`](../../skills/do-it/references/write-quality-families.md)
and [`strict-external-actions.md`](../strict-external-actions.md). Hook
keyword bans for “this is the wrong layer” or “attack the premise” would
fire on valid code. If a later episode produces a *deterministically
detectable* contract, add it through the quality-family registry, not
this file.

## Prompt payload

Core bootstrap excerpt left at 642 characters. Principle judgment lives
in the owners above, not in auto-injected context. No new skills.

## Not run

No live-model A/B, no provider calls, no paid behavior benchmarks.
Evaluator evidence code, `agents/*.toml`, install logic, Pi maintained
extensions, and `references/host-pi.md` were out of scope.
