# Source And Rewrite Map

This file records where do-it deliberately absorbs outside workflow ideas. It is
not an install manifest; `manifest.json` is the install source of truth.

Current product behavior is described in [README](../README.md). The source
inventory lives in manifest.json. Skills provide professional judgment; Core is
small, discovery is direct, independent contexts are valuable, and runtime hooks
supply compact context and deterministic checks. Custom adaptive personalization
and workflow classification/completion machinery are retired.

The lineage below records historical borrowing, not current mandatory workflow.
The current authoring source is do-it-skill-authoring: concise triggers, unique
judgment, tool guidance, and necessary boundaries, without fixed anatomy or
ceremonial reports. Historical upstream process ideas were selectively simplified.

The [architecture comparison](./architecture.md#upstream-comparison) records
the five additional repositories reviewed for 0.18.1, with pinned sources and
the limits of the ideas adopted. Concrete current applications include explicit
reference loading conditions, natural-language and negative trigger checks in
maintenance guidance, causal-path verification that rejects empty validator
passes, and red-team tracing from caller control through a reachable operation
to impact. These are guidance and evidence boundaries, not a new runtime or
mandatory artifact framework.

## Prompt-writing revision for 0.19

The following source snapshots informed concrete writing changes, not new
mandatory workflows. Prompt quality and measured task effectiveness are separate:
the rewrite has no new live-model A/B result. Existing behavior records include
harness limitations and must not be used as an unqualified skill ranking.

| Source snapshot | Writing mechanism retained | do-it owner and boundary |
| --- | --- | --- |
| [Google Elephant-Goldfish, `113a3af`](https://github.com/google/elephant-goldfish-model/tree/113a3afc44e8f4f54722d7150d5701f65cc8ef7f), `agents/comprehension.md` (Apache-2.0) | Reconstruct a design in ordinary language to expose missing relationships even when every term is defined. | Context, Review, delegation reference. No compulsory paraphrase report, fixed reader roster, or removal of user constraints. |
| [Cloudflare security-audit-skill, `c1c8a8c`](https://github.com/cloudflare/security-audit-skill/tree/c1c8a8c1471069fb0e188eeaff69b8e8db6564a8), validation/verifier guidance (MIT) | Reconstruct the strongest existing controls; separate a demonstrated boundary failure from a decisive missing fact; keep validation safe. | Audit and Review. Preserve independent audit synthesis, allow sufficient static evidence, and do not import the six-phase workflow, verdict schema, or artifact-promotion machinery. |
| [Compound Engineering, `406b85c`](https://github.com/EveryInc/compound-engineering-plugin/tree/406b85c4562de3d415927fccc5e614c6554aab00), `ce-compound` (MIT) | Prefer an existing durable check or structural correction over accumulating reminders. | Retrospective and Context. No automatic solution directory, policy promotion, or redundant reminder. |
| [pstack-claude, `79b36d9`](https://github.com/michael-denyer/pstack-claude/tree/79b36d9b53a53c78e5ec26bf6ce7dade76686c87), `tdd/SKILL.md` (MIT) | Inspect the failure content: an intended mismatch and a broken import both fail, but only one measures the defect. | Verify, Code Quality, Skill Authoring. Do not import fixed TDD steps or discard sound static findings because no reproduction ran. |
| [pstack-claude, `79b36d9`](https://github.com/michael-denyer/pstack-claude/tree/79b36d9b53a53c78e5ec26bf6ce7dade76686c87), `plugins/pstack/skills/principle-*/SKILL.md` and the `poteto-mode` principle index (MIT; lineage [cursor/plugins/pstack](https://github.com/cursor/plugins/tree/e46364b8be46000b7df0f260550cd712afbb8d36/pstack), (c) 2026 Lauren Tan; port (c) 2026 Michael Denyer) | Reasoning moves for smallest structurally correct change, shared failed premises, domain structure, cutover, native artifacts, numbers, and bounded independent work. | Existing skill owners only. Full dispositions: [pstack principles](./design/pstack-principles.md). No new principle skills, no 24-step checklist, Core bootstrap unchanged. Hook keyword bans for architecture judgment were rejected. |
| [Microsoft TokenEconomizer, `d3e193b`](https://github.com/microsoft/TokenEconomizer/tree/d3e193b8734ec76230da1e08d7929ba9d14640d8), loop-guard guidance (Apache-2.0) | Distinguish repeated activity from progress that changes evidence or eliminates an explanation. | Code Quality. No automatic abort counters, tool pruning, host configuration changes, or claimed token savings. |

These are original do-it adaptations of the reasoning techniques, not vendored
prompt text. Skill Authoring also addresses an observed authoring failure in this
upgrade discussion: missing model-trial evidence must limit effectiveness claims,
not prevent authorized improvements to wording, structure, and examples.

## External Idea Map

The do-it skills are rewrites, not vendored copies. Useful ideas from
`lencx/skills` are mapped this way:

| Source Idea | do-it Destination | Absorbed Shape |
| --- | --- | --- |
| `coding-protocol` | `do-it-core` + hooks | Compact background protocol with failure-mode→rule anchoring: one canonical rule per failure mode, hooks quoting the rules verbatim, satellites citing instead of restating, report-only-what-matters closeout. |
| `keel` | `do-it-architecture` | Eight architecture lenses (spine, surfaces, authority/writers/projections, ownership, negative path + time axis, guards, governed-path cost, net-growth review) and the four task routes (greenfield design / architecture review / boundary change / structural refactor). |

Useful ideas from
`mattpocock/skills` are mapped this way:

| Source Idea | do-it Destination | Absorbed Shape |
| --- | --- | --- |
| `to-spec` | `do-it-decide` | Current-context synthesis, module/test decisions, non-goals, and acceptance criteria. |
| `to-tickets` | `do-it-decide` | Tracer-bullet vertical slices, HITL/AFK split, dependency order. |
| `grill-me`, `zoom-out` (deleted upstream; kept as historical) | `do-it-decide` | Decision-tree interview, recommended answers, and codebase exploration instead of asking answerable questions. |
| `request-refactor-plan` | `do-it-decide`, `do-it-code-quality` | Tiny safe steps, scope/non-scope, alternatives, test coverage. |
| `design-an-interface` | `do-it-code-quality` | Multiple radically different interface shapes before committing to a boundary. |
| `improve-codebase-architecture` | `do-it-code-quality` | Friction-led exploration, shallow-module detection, coupling and testability impact. |
| `tdd` | `do-it-code-quality` | Public-interface behavior tests and one RED/GREEN vertical slice at a time. |
| `triage` | `do-it-code-quality` | Manifestation, code path, root cause, minimal fix, and TDD fix plan. |
| `qa` | `do-it-review`, `do-it-context` | User-facing durable issues, concise reproduction, and project domain language. |
| `ubiquitous-language`, `domain-modeling` | `do-it-context` | Canonical glossary, ambiguity flags, code/docs contradiction checks. |
| `writing-great-skills` | `do-it-skill-authoring` | Concise SKILL.md, progressive disclosure, optional resources, and validation. |
| `resolving-merge-conflicts` | `do-it-code-quality` | Hunk-by-hunk resolution by intent traced to each side's source; never `--abort`; run the project's checks after finishing. |
| `research` | `do-it-decide` | Primary-source citation; durable findings captured into worklog/handbook instead of re-researching. |

Upstream drift: `qa`, `design-an-interface`, `request-refactor-plan`, and
`ubiquitous-language` now live in upstream's `deprecated/` — the absorptions
above remain valid; the sources are retired.

Excluded or adapter-only ideas remain outside the core install flow unless a
future do-it skill explicitly needs them: article editing, exercise scaffolds,
Obsidian vault helpers, pre-commit setup, and runtime-specific guardrail
installers.

Useful ideas from `addyosmani/agent-skills` are absorbed as method rewrites,
not as installed skill names or vendored text:

| Source Idea | do-it Destination | Absorbed Shape |
| --- | --- | --- |
| Concise skill writing and progressive disclosure | `do-it-skill-authoring` | Unique judgment and useful references; fixed workflow anatomy was retired. |
| Process over prose and progressive disclosure | All `skills/do-it/*/SKILL.md` | Skills stay operational and token-conscious. |
| Failure-mode awareness | Professional skills | Useful reasoning prompts without compulsory anti-rationalization tables. |
| Evidence over assumption | `do-it-verify`, `do-it-review`, `do-it-decide` | Fresh current-worktree evidence and explicit `NOT_VERIFIED` closeout language. |
| Planning and task breakdown | `do-it-decide` | Assumption/evidence split, HITL/AFK, and task sizing. |
| Incremental implementation and test-led thin slices | `do-it-code-quality`, `do-it-decide` | Tracer-bullet slices, RED/GREEN per behavior, reproduce-localize-reduce-fix-guard. |
| API/interface design | `do-it-code-quality` | Producer/consumer/compatibility owner, additive change preference, migration proof. |
| Code review quality lenses | `do-it-review` | Risk-matched review axes, change-size split, proof-quality review. |
| Code simplification and deprecation mindset | `do-it-code-quality` | Simplicity check, code-as-liability check, removal/deprecation proof. |
| Source-driven context and security posture | `do-it-decide`, `do-it-context`, `do-it-review` | Research-first comparison for new surfaces; untrusted external-context boundary. |
| Performance and release proof discipline | `do-it-code-quality`, `do-it-verify`, `docs/maintenance.md` | Measure/verify before claiming readiness. |
| `observability-and-instrumentation` | `do-it-code-quality`, `do-it-verify` | Named production evidence surface (log / metric / trace) as done-ness; `runs in production` claims need production-side evidence. |
| `documentation-and-adrs`; mattpocock ADR practice | `do-it-context` | Optional `decisions.md` promotion — one file, one paragraph per permanently settled route. |
| `doubt-driven-development` | `do-it-decide` | Fresh-context challenge applies in-flight while deciding, not only on finished diffs. |

Useful ideas from `gsd-build/get-shit-done` and `gsd-build/gsd-2` are absorbed
as do-it-native decision support, not as a replacement state machine:

| Source Idea | do-it Destination | Absorbed Shape |
| --- | --- | --- |
| Discuss-phase captures implementation decisions before planning | `do-it-decide` | Diverge briefly, pressure-test load-bearing premises, write shortest useful plan. |
| Assumptions discussion mode | `do-it-decide` | Read repo truth first; ask only when preference gates the route. |
| Decision coverage | `do-it-decide`, `do-it-review`, `reviewer` | Requirements and decisions trace into a plan slice, delivered surface, or explicit deferral when that coverage matters. |
| Plan checker and source-audit gaps | `do-it-review` | Missing coverage, unwired implementation, unused surfaces, and synthetic proof become findings. |
| Fresh context per task | parent delegation guidance, `docs/routing-matrix.md` | Give a worker its goal and needed ownership boundary; let it return useful evidence or uncertainty. |

Useful ideas from `EveryInc/compound-engineering-plugin` are absorbed as
decision and contract mechanics, not as a mandatory brainstorm/plan pipeline:

| Source Idea | do-it Destination | Absorbed Shape |
| --- | --- | --- |
| WHAT vs HOW split | `do-it-decide`, task contract | The contract owns intent, boundary, and acceptance (WHAT). Implementation HOW can move with repo evidence without silently rewriting settled decisions. |
| Session-settled decisions stay closed | `do-it-decide` | `[user]` / `[evidence]` / `[choice]` stay settled unless new evidence appears; `[assumption]` stays open. |
| Ask only decisions; facts first | `do-it-decide` | Read local truth first; ask only a user-owned decision that changes the route. |
| Readiness vs implementation-time unknown | `do-it-decide`, `task-contract.md` | Planning-time unknowns must be resolved or deferred before a durable contract; implementation unknowns stay in Open. |
| Artifact size follows the task | `do-it-context`, `do-it-decide` | Persist an execution contract only when earned; no fixed multi-file plan ceremony. |

Rejected from that source: default grounding scouts, mandatory multi-stage
pipelines, and per-plan reviewer deepening.

Useful ideas from `Fission-AI/OpenSpec` are absorbed as artifact fluidity, not
as a spec-driven development framework:

| Source Idea | do-it Destination | Absorbed Shape |
| --- | --- | --- |
| Fluid, not rigid artifacts | `.do-it/plans/` execution contracts | One earned contract file instead of proposal/specs/design/tasks by default. |
| Requirements should not live only in chat | `task-contract.md` | Goal / Decisions / Boundary / Acceptance persist when a later worker needs them. |

Rejected from that source: a four-artifact change set and turning do-it into a
full SDD framework.

Useful ideas from `triggerdotdev/staff-engineering-skills` are absorbed as a
compressed failure-model scan, not as per-trap skills. Star count is not
maturity proof:

| Source Idea | do-it Destination | Absorbed Shape |
| --- | --- | --- |
| Duplicate/replay as normal; check-then-act / RMW interleaving; retry amplification; commit/atomicity; copies and recovery | `stateful-change-scan.md`, `do-it-code-quality` | Identity / Interleaving / Commit / Amplification / Copies & Recovery — loaded when stateful change is in scope, not on every Light edit. |

Rejected from that source: one skill per trap, and injecting a distributed-
systems checklist into ordinary tasks.

## Installed Agents

Ten canonical specialist bodies in `agents/*.toml`:

| Agent | do-it Role | Notes |
| --- | --- | --- |
| `architecture-strategist` | decide / architecture lens | Maps foundation, extension modules, boundaries, and verification route. |
| `decision-challenger` | decide / product and plan | Challenges user value, load-bearing premises, scope, acceptance, and cheaper credible alternatives. |
| `code-mapper` | behavior / ownership trace | Answers bounded codebase questions and follows relevant producers, contracts, consumers, and recovery without a mandatory reconnaissance stage. |
| `code-quality-cleaner` | write / YAGNI + maintainability | Finds redundancy, dead paths, avoidable abstraction, and cleanup risk. |
| `test-engineer` | test-only writer | Owns assigned reproducers, regression tests, or verification; preserves an explicit RED-only handoff and cannot edit production code. |
| `reviewer` | review / requirements and correctness | Checks requirements, scope, contracts, implementation, regression risk, and proof; keeps the two lenses distinct. |
| `red-team-reviewer` | review / adversarial | Security, state, persistence, concurrency, replay, and failure modes. |
| `documentation-engineer` | docs | Keeps docs faithful to tooling, install flow, adapters, and operator workflows. |

Former supplemental lenses (CEO, UX, end-user, ops, domain-language,
install/release, skill-quality, language specialists, …) are absorbed into the
retained set or retired from the default install.

## Adapter Notes

- Host-native delivery is primary: Codex and Claude Code are marketplace-first;
  Cursor uses local copy / Team Import while public listing is pending;
  Pi ships an independent npm package with a local fallback; Grok Build uses
  the distinct generated `do-it-grok` bundle. OpenCode and Kimi are retired.
  Optional CLI `do-it setup` remains for managed doctor / migration.
- Each host should reuse the same do-it roles and translate only mechanics:
  skill invocation, subagent dispatch, file tools, sandbox controls, and
  verification commands.
- Bundled agents are optional capability experts, not a required pipeline.
  Parent prompts give a useful goal and only the ownership or side-effect
  context the slice needs; the parent integrates the result.
- Source-inspired text must be rewritten before installation. Do not vendor raw
  workflow copies into the public package.
