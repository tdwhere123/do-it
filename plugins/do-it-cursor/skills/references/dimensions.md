# Orthogonal Dimensions

In addition to the single tier label, the router writes boolean dimensions into
per-session state. They narrow *intensity* for hooks and skills — not the tier
itself. A Standard task can still be `breaks_interface=1` and raise review or
contract posture without becoming Heavy.

| Dimension | Set when |
|---|---|
| `dim_touches_code` | prompt names a file path, extension, fenced snippet, or curated technical noun |
| `dim_crosses_packages` | ≥ 2 distinct top-level path segments named in the prompt |
| `dim_breaks_interface` | prompt mentions breaking change, schema/API rewrite, endpoint rename/delete/deprecate, or interface contract change |
| `dim_needs_tdd` | prompt names behaviour-modifying intent (`implement`, `实现`, `add feature`, `fix bug`, `修复 bug`, `添加功能`) **and** also names a code object (path / extension / fenced snippet / technical noun) |
| `dim_needs_review_loop` | tier is Heavy OR `dim_breaks_interface=1` (name is historical; signals **review intensity**, not a deleted skill) |

Tier remains canonical. Light classifications skip dimension evaluation (every
dim stays 0). The router never coerces tier from dimensions.

## Reading Dimensions

DIM values live in per-session state written by the router.

**Hook layer.** Hooks (`router`, `grill-prompt`, `verification-gate`,
`write-quality-lint`) read DIM via `do_it_session_state_get` in
`hooks/lib/common.sh`. Session path resolution is documented in
[`host-vocabulary.md`](host-vocabulary.md).

**Agent layer.** Agents do **not** query DIM state. Infer intensity from the
prompt and tier the same way the router would:

- path / extension / code object → code-touch intensity
- ≥2 top-level package segments → ownership / blast-radius check
- breaking change / schema rewrite / endpoint rename → contract + adversarial review
- behaviour-modifying intent **and** a code object → prefer TDD at a real seam
  (`do-it-code-quality`), with escape for mechanical / docs-only / generated work
- Heavy **or** interface-breaking → raise `do-it-review` intensity

## Enforcement Boundary

`verification-gate.sh` is **evidence-only**: after edits, a done/fixed/ready
claim needs a fresh relevant shell command in the **current turn**. It does
**not** require review traces, plan markers, or interface attestation.

Review / contract intensity is skill judgment (`do-it-review`,
`do-it-code-quality`), not a Stop-hook hard gate. Always name an escape reason
when skipping a raised intensity (silent skip is a review finding).

## Consumer Table

| Dim | Hook consumers | Skill intensity |
|---|---|---|
| `dim_touches_code` | `grill-prompt` (Heavy inject); `write-quality-lint` (Standard gate) | `do-it-code-quality` when editing |
| `dim_crosses_packages` | — | ownership / blast-radius in `do-it-code-quality` / `do-it-decide` |
| `dim_breaks_interface` | — (signal only) | contracts + adversarial `do-it-review` |
| `dim_needs_tdd` | — | TDD mode in `do-it-code-quality` (with escape) |
| `dim_needs_review_loop` | — (signal only) | raise `do-it-review` intensity on done-claim turns |

Policy mirror (repo docs, not shipped in plugins):
[`docs/routing-matrix.md`](https://github.com/tdwhere123/do-it/blob/main/docs/routing-matrix.md).
