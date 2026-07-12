# Glossary

Canonical terms for the **do-it** project. Prefer these in skills, agents, and handoffs.

## Routing

| Term | Meaning |
| --- | --- |
| **tier** | `Light` \| `Standard` \| `Heavy` — workflow ceremony level; canonical label from router |
| **DIM** | Orthogonal boolean (`dim_touches_code`, `dim_crosses_packages`, …) — narrows intensity, not tier |
| **core skill** | Entry in `CORE_SKILLS`; bundled in Cursor plugin |
| **extended skill** | On-demand or maintenance; full install on Codex/Claude only |

## Workflow phases

| Term | Meaning |
| --- | --- |
| **diverge** | `do-it-decide` diverge mode — brief options map, no final pick |
| **converge** | `do-it-decide` converge / pressure-test — premises, necessity, user decisions |
| **plan-challenger** | Decide sub-lens only; challenges scope/acceptance/route |
| **failure-mode forecast** | Named risk classes before Standard/Heavy edits |
| **path map** | `producer → contract → transport → consumer → surface → verification` |

## Review

| Term | Meaning |
| --- | --- |
| **finding severity** | `Blocking` \| `Important` \| `Opportunity` |
| **cause_class** | Short tag for why (replaces legacy `category`) |
| **NOT_CHECKED** | Explicit list of scope/checks skipped — required on review returns |
| **review-quick / review-deep / review-adversarial** | Intensity axis — not a tier synonym |

## Skip and escape

| Term | Meaning |
| --- | --- |
| **skip announcement** | `skipped: <skill-or-hook> because <reason>` in route or delivery |
| **escape word** | e.g. `yolo` — writes skip flags for router/grill/gate (one turn) |
| **partial skip** | e.g. `skip grill` — only named hook flags |

## Evidence

| Term | Meaning |
| --- | --- |
| **verification-gate** | Stop-hook transcript check for done-claims; soft heuristic |
| **truth plane** | Where proof runs (`source-repo`, `live-cursor`, …) |
| **readiness target** | What “done” means for a slice (fixture-ready, install-ready, …) |

## Status (agents)

| Term | Meaning |
| --- | --- |
| **DONE** | Worker finished; review complete (empty findings = clean) |
| **NEEDS_CONTEXT** | Missing facts parent must supply |
| **BLOCKED** | Cannot proceed without scope/credential/branch action |
