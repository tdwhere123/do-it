# Orthogonal Dimensions

In addition to the single tier label, the router writes 5 boolean dimensions
into per-session state. They narrow *intensity*, not tier itself: a Standard
task can still be `breaks_interface=1` and a downstream skill MAY upgrade its
review or drill posture accordingly.

| Dimension | Set when |
|---|---|
| `dim_touches_code` | prompt names a file path, extension, fenced snippet, or curated technical noun |
| `dim_crosses_packages` | ≥ 2 distinct top-level path segments named in the prompt |
| `dim_breaks_interface` | prompt mentions breaking change, schema/API rewrite, endpoint rename/delete/deprecate, or interface contract change |
| `dim_needs_tdd` | prompt names behaviour-modifying intent (`implement`, `实现`, `add feature`, `fix bug`, `修复 bug`, `添加功能`) **and** also names a code object (path / extension / fenced snippet / technical noun) |
| `dim_needs_review_loop` | tier is Heavy OR `dim_breaks_interface=1` |

Tier remains the canonical input. Light classifications skip dimension evaluation
entirely (every dim stays 0). The router never coerces tier from dimensions.

## Reading Dimensions

DIM values live in per-session state written by the router. Two consumption paths
exist; agents and skills must use the right one for their layer.

**Hook layer (program path).** Hooks invoked by the host (router, grill-prompt,
verification-gate, write-quality-lint) read DIM values via
`do_it_session_state_get "$SESSION_ID" <key>` defined in `hooks/lib/common.sh`.
The helper resolves the state path through the documented env-var search
(documented in [`host-vocabulary.md`](host-vocabulary.md)). New hooks must call
this helper and never hard-code a path.

**Agent layer (prose path).** Agents do **not** query DIM state at runtime. The
`dim_*` keys are hook-internal signals. Agents satisfy a SKILL's "mandatory
trigger when dim_X=1" line by judging from the **prompt content** they were
given:

- if the user's prompt names a path/extension/code object → treat
  `dim_touches_code` as 1;
- if the prompt names ≥2 top-level package segments → treat
  `dim_crosses_packages` as 1;
- if the prompt mentions breaking change / schema-rewrite / endpoint
  rename/delete/deprecate / interface change → treat `dim_breaks_interface` as 1;
- if the prompt names behaviour-modifying intent (`implement` / `实现` / `add
  feature` / `fix bug` / `修复 bug` / `添加功能`) **and** also names a code
  object → treat `dim_needs_tdd` as 1;
- if tier is Heavy OR `dim_breaks_interface` is 1 → treat
  `dim_needs_review_loop` as 1.

The hook layer enforces some of these via Stop hook (`verification-gate.sh`
blocks on missing interface attestation or missing review-loop trace). The agent
layer interprets the same signals from prompt content; the two layers agree by
design.

## Mandatory-Trigger Escape Clauses

A SKILL listing a mandatory DIM trigger can still skip it when its own Light-tier
escape clause applies. The most important cases:

- `do-it-tdd` (`dim_needs_tdd=1`): if the change is mechanical, docs-only,
  generated output, or config where an executable RED test is not useful (matches
  the skill's Light tier), state the reason in the route announcement and proceed
  without TDD.
- `do-it-interface-drill` (`dim_breaks_interface=1`): if the changed interface
  is a private helper inside one file and no consumer depends on it, the
  Light-tier inline version of interface-drill is sufficient.
- `do-it-architecture-scan` (`dim_crosses_packages=1`): if the cross-package
  mention is purely textual (e.g. paths inside docs/README), inline
  architecture-scan suffices.

Always name the escape reason. A silent skip of a mandatory trigger is a review
finding.

## Consumer Table

| Dim | Hook consumers | Skill consumers |
|---|---|---|
| `dim_touches_code` | `hooks/grill-prompt.sh` (suppresses Standard implicit grill on discussion turns); `hooks/write-quality-lint.sh` (Standard gate) | — |
| `dim_crosses_packages` | — | `do-it-architecture-scan` mandatory trigger (with escape clause) |
| `dim_breaks_interface` | `hooks/verification-gate.sh` (requires inline-review marker to name `interface`/`contract`/`schema`/`api`) | `do-it-interface-drill` mandatory trigger; `do-it-review-loop` runs adversarial intensity |
| `dim_needs_tdd` | — | `do-it-tdd` mandatory trigger (with escape clause) |
| `dim_needs_review_loop` | `hooks/verification-gate.sh` (requires review-loop trace before a "done" claim) | `do-it-review-loop` mandatory trigger — applies **only to done-claim turns**, not planning/grill turns |

Public policy mirror: [`docs/routing-matrix.md`](../../../docs/routing-matrix.md).
