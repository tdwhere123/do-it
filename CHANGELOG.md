# Changelog

## 0.14.0

Theme: meaning-centric rethink. Skills organize by **what they mean for the
task** instead of a mandatory process chain. Main defense moves to write-time
quality; plugin marketplace is the primary install path on all four hosts.

### Skills — meaning buckets

Eight installed skills (5 core + 3 extended):

| Bucket | Skill |
|---|---|
| Route | `do-it-router` |
| Write defense | `do-it-code-quality` |
| Review / repair | `do-it-review` |
| Decide | `do-it-decide` |
| Verify / close | `do-it-verify` |
| Handbook / names | `do-it-handbook`, `do-it-context` |
| Maintain | `do-it-skill-authoring` |

Router stays thin: pick Light / Standard / Heavy, then self-select buckets.
No mandatory brainstorm → grill → plan → orch pipeline on Standard.

### Migration (old skill → new skill)

| Old skill | New skill |
|---|---|
| `do-it-grill` | `do-it-decide` |
| `do-it-brainstorm` | `do-it-decide` |
| `do-it-planning` | `do-it-decide` |
| `do-it-slicing` | `do-it-decide` |
| `do-it-review-loop` | `do-it-review` |
| `do-it-fix-loop` | `do-it-review` |
| `do-it-verification-gate` (skill) | `do-it-verify` |
| `do-it-branch-closeout` | `do-it-verify` |
| `do-it-tdd` | `do-it-code-quality` |
| `do-it-debugging` | `do-it-code-quality` |
| `do-it-architecture-scan` | `do-it-code-quality` |
| `do-it-interface-drill` | `do-it-code-quality` |
| `do-it-worktree-isolation` | `do-it-code-quality` |
| `do-it-comments-discipline` | `do-it-code-quality` |
| `do-it-codebase-design` | `do-it-code-quality` |
| `do-it-subagent-orchestration` | *(removed — parent delegation contract + `subagent-stance` hook)* |

`do-it-router`, `do-it-handbook`, `do-it-context`, and `do-it-skill-authoring`
keep their names. The `verification-gate` **hook** remains; only the skill file
was folded into `do-it-verify`.

### Hooks

- `grill-prompt`: injects on **Heavy only** (or explicit grill request); Standard
  stays silent.
- `grill-pretool` **removed** — no PreToolUse / preToolUse plan-file gate.
- `write-quality-lint` families overhauled: merged narrative comment families,
  raised `case-list` / `edit-bloat` thresholds, added `scope-chain`, `live-path`,
  `secret-leak`, `type-escape`, `test-fiction`.
- Codex / Claude / Cursor / OpenCode **plugin bundles carry hooks**; Codex
  operators install the plugin and trust hooks under `/hooks`.
- Retained: `router`, `subagent-stance`, `verification-gate`, `write-quality-lint`.

### Agents

Agents reduced to **10** (from ~23). Retained set absorbs merged lenses:

- Decide: `product-strategist`, `architecture-strategist`, `plan-challenger`
- Write: `code-mapper`, `code-quality-cleaner`, `tdd-red-writer`
- Review: `reviewer`, `red-team-reviewer`, `spec-compliance-reviewer`
- Docs: `documentation-engineer`

### Install

- **Plugin marketplace is primary** for Codex, Claude Code, Cursor, and OpenCode.
- Cursor ships the **full 8 skills** (`ALL_SKILLS`), same as the other hosts.
  Local install must be a **real copy** under `~/.cursor/plugins/local/`
  (Cursor rejects external symlinks); use `node scripts/install-cursor-local.mjs`.
- `do-it setup` is optional / legacy (doctor, temp-home smoke, migration).
- Removed the v1 guidance to pair Codex plugin install with global setup because
  `plugin_hooks=false`.

## 0.13.1

### Fixed

- `verification-gate` turn slicing: guard against invalid user line numbers so
  a bad transcript offset cannot widen the evidence window incorrectly.
- `write-quality` scan hardened for copy-paste `git grep` and temp-path
  fallback edge cases.
- Skill `references/` link targets corrected so progressive-disclosure sheets
  resolve from installed skill paths.

### Changed

- OpenCode plugin build requires `tsc` (no silent skip when compile is needed).
- `prepack` expands Cursor and OpenCode plugin builds alongside the Codex
  plugin and agent-bundle validation.

## 0.13.0

### Added

- Four-host adapters: Codex, Claude Code, Cursor, and OpenCode share one
  workflow kernel. Cursor marketplace bundle under `plugins/do-it-cursor/`;
  OpenCode TypeScript plugin under `plugins/do-it-opencode/`.
- Shared skill `references/` sheets (integrity, dimensions, write-quality
  families, per-host install notes).
- Harness adapter matrix at `docs/harness-adapter-matrix.md`.

### Changed

- PostToolUse `comments-lint` and `anti-patterns-lint` merge into advisory
  `write-quality-lint` (single reminder per file; tier/DIM gated). Legacy
  wrappers exec into the merged script for one release.
- UserPromptSubmit injection compressed for Standard turns.

## 0.12.0

### Added

- `do-it-codebase-design` skill — deep-module vocabulary (module, interface,
  seam, adapter, leverage, locality), wired into router, architecture-scan,
  and review-loop.
- `subagent-stance` UserPromptSubmit hook — compact stance reminder for
  delegated work.

### Changed

- `do-it-grill` and `do-it-review-loop` tightened with leading words and
  checkable completion criteria.
- Handbook auto-bootstrap on Standard/Heavy greenfield code turns.
- Handbook simplified to stable project truth (invariants / architecture /
  glossary) plus worklog template; backlog / code-map / runtime-status
  templates removed.
- `code-mapper` returns temporary path maps only (no handbook write claim).

### Removed

- `code-map-refresh` PostToolUse hook.

## 0.11.0

### Fixed

- macOS CI: the `anti-patterns-lint` hook is now BSD-portable. The no-consumer
  check uses git grep's own `-w` word match instead of a GNU `\b` regex, and
  file paths are canonicalized with `pwd -P` before repo-relative stripping so
  the `/var`→`/private/var` symlink no longer breaks self-exclusion. The macOS
  hook-test job was failing on these for three releases.

### Changed

- Handbook slimmed from 12 templates to 7 project-truth files. The five process
  docs that duplicated skills were removed: the task-card layout now lives in
  `do-it-planning`, the review protocol in `do-it-review-loop`, the dispatch
  contract in `do-it-subagent-orchestration`, the execution pipeline in
  `do-it-router`, and the handbook maintenance rules in the `do-it-handbook`
  skill.
- Three low-utilization skills consolidated (23 → 20): `do-it-grill-log` folded
  into `do-it-grill` (Grill Log Artifact), `do-it-domain-language` into
  `do-it-context` (Domain Glossary Mode), and the optional `do-it-visual-planning`
  into `do-it-planning` (Visual Aids); the visual companion (local browser
  server + render templates) moves under `do-it-planning` and its templates were
  visually redesigned. Existing installs remove the deprecated skills on upgrade.
- `do-it-router` gains a § Restraint principle: advisory over blocking, reuse
  over add, no unbounded libraries, check git intent before deleting, and
  capabilities that auto-fire instead of requiring a `/command`.
- `do-it-context` gives `CLAUDE.md` a formal role in the source-of-truth
  hierarchy, draws the `CLAUDE.md` / `CONTEXT.md` / handbook boundary, and can
  scaffold a lean `CLAUDE.md` on demand (additive, never auto-write).

### Added

- Advisory nudges (one-shot, never block): after grill on durable-plan work with
  no plan card, a reminder to land the plan card before implementation drifts
  ahead; on established projects (`.do-it/CONTEXT.md` or handbook present) or
  port/restore prompts, a reminder to read existing structure / grep current
  code first.
- `comments-lint` now flags `phase N`, `wave N`, and `BL-NNN` stage markers as
  `task-ref` comments.

## 0.10.0

### Added

- Evidence Ledger rows for durable `.do-it/plans/<task>.md` cards. Heavy,
  release/install, multi-agent, and explicit durable-plan work can now track
  each claim by readiness target, truth plane, evidence, result, owner, and
  residual risk without adding another skill.
- Truth-plane vocabulary for source, task worktree, integration worktree,
  temp install, live Codex, live Claude, package artifact, host behavior, and
  external blockers.
- Subagent lane status vocabulary (`assigned`, `running`,
  `done_with_evidence`, `integrated`, `blocking`) so parent closeout can wait
  for, inspect, and accept delegated work instead of trusting worker `DONE`.

### Changed

- Agent templates are model-agnostic. Source `agents/*.toml` files no longer
  pin concrete models or reasoning-effort fields, and Claude generated agents
  omit `model:` frontmatter so the host owns model selection.
- `do-it-planning`, `do-it-verification-gate`, `do-it-review-loop`,
  `do-it-fix-loop`, `do-it-interface-drill`, `do-it-slicing`,
  `do-it-subagent-orchestration`, and `do-it-branch-closeout` now share the
  evidence-ledger, proof-path, truth-plane, and lane-status contract.
- Release and maintenance docs now require source, package, temp install,
  live install, and host behavior readiness to be claimed separately.

### Fixed

- `code-mapper` is consistently read-only. It now returns proposed handbook
  code-map updates to the parent instead of claiming permission to write from a
  read-only lane.
- Live installs now manage individual do-it hook files instead of claiming the
  entire `hooks/` directory, so non-do-it hook integrations can coexist.
- `scripts/validate-agent-bundle.mjs` rejects model pins and host-private
  model/budget fields in portable agent templates and generated Claude agents.
- `manifest.json` carries a `0.9.x` install-state migration range for the
  `0.10.0` minor upgrade.

## 0.9.1

### Added

- `index.json` — generated machine-readable inventory for the do-it skill and
  agent surface. It records package/version metadata, skill group coverage,
  optional skills, and every manifest-backed skill/agent entry with source and
  target paths.
- `scripts/build-index-json.mjs` — builds and validates the root inventory
  from `manifest.json`, skill frontmatter, and agent TOML descriptions. Wired
  into `npm run build:generated` and package validation.
- Install tests now cover cross-device staged replacement (`EXDEV`) and the
  generated index/docs cleanup contract.

### Changed

- `index.json` is included in the npm package file list so external runtimes
  and marketplaces can discover do-it's installed skill/agent surface without
  loading every `SKILL.md`.
- Removed the stale `install/migrations/` note directory from the package.
  Install-state migrations remain active in `manifest.json` and
  `install/migrate.mjs`; the removed file was historical human documentation.

### Fixed

- `install/manage.mjs` now falls back to copy-and-remove when replacing a
  staged managed target fails with `EXDEV`, which can happen when temp/staging
  and the target install root are on different filesystems.

## 0.9.0

### Added

- `install/migrate.mjs` — version-migration logic (`parseMinor`, `matchesFromRange`, `needsMigration`, `applyMigrationAction`, `applyMatchingMigrations`) extracted from `install/manage.mjs` as pure, importable functions.
- `tests/install/manage.test.mjs` — 14 tests covering the migration logic plus the end-to-end install flow: fresh install, re-install from an older state version (migration + `*.pre-migrate.json` backup), and codex/claude target independence. New `npm run test-install`, wired into `npm test`.
- `scripts/check-skill-links.mjs` — fails when a `SKILL.md` references a `` `do-it-*` `` skill or command that does not exist, or a skill directory is missing from `manifest.json`. New `npm run check:skill-links`, wired into `npm test`.
- `do-it-router` § Integrity — a canonical principle: a failure is a clue to trace to a root cause, not a symptom to make disappear. Names the cover-up patterns (swallowed exception, weakened/deleted assertion, skipped/deleted test, commented-out failing code, hiding fallback, edited evidence). `do-it-debugging`, `do-it-fix-loop`, `do-it-verification-gate`, and the subagent dispatch contract reference it; the `reviewer` agent treats a cover-up as a Blocking finding.
- `do-it-visual-planning/templates/plan-card.html` and `review-report.html` — content-fragment templates that reuse the existing browser-companion frame and CSS; section order matches `task-card-template.md` and review-loop severity grouping.
- CI `test` job now also runs on `macos-latest`, guarding the bash hooks against BSD/GNU tool divergence (`find`, `printf`, `date`).

### Changed

- **`hooks/verification-gate.sh` block reasons rewritten as short single-instruction sentences.** The verbose "for example a line whose content is the literal phrase…" meta-explanation that caused the model to echo the reason back verbatim is removed.
- **`hooks/verification-gate.sh` scopes edit / evidence / review-loop detection to the current turn** — the transcript lines after the last user message. A verification command or review-loop trace from an earlier turn can no longer satisfy a later unverified turn. The tail window is raised 80 → 400 lines (turn scoping removes the staleness cost of a larger window).
- `applyMigrationAction` now throws on an unknown migration action instead of logging and skipping it — a malformed manifest fails loud rather than leaving a half-migrated state.
- `manifest.json` migrations gain `0.7.x` and `0.8.x` entries.
- `do-it install` and `doctor` now report the install-state version of **every** manifest target, surfacing codex/claude cross-host version drift that a single-target run otherwise hides.
- `do-it-subagent-orchestration` Required Prompt Contract gains an `integrity stance` field, propagating the integrity principle into every dispatched subagent.
- `do-it-router` and `do-it-planning` now point at `do-it-handbook` and `task-card-template.md` so the handbook skeleton is discovered and reused instead of ignored.

### Fixed

- `do_it_emit_block` / `do_it_emit_context` emit valid JSON via a `printf` fallback when `jq` is unavailable. Previously a jq-less host silently dropped the Stop-hook block decision and context reminders entirely.
- The 0.8.0 known limitation where a stale `review-loop` trace in a long session could let a later review-needing turn pass silently — resolved by the current-turn scoping above.
- Stale session directories under the runtime sessions base are pruned after `DO_IT_SESSION_TTL_DAYS` (default 7) of inactivity (`do_it_prune_stale_sessions`, run once per session from `router.sh`), instead of accumulating without bound.

## 0.8.0

### Added

- New PostToolUse hook `hooks/anti-patterns-lint.sh` — advisory scan after every `Edit|Write|MultiEdit` for three coarse code-quality anti-patterns: large bash `case` lists (≥10 consecutive `*"..."*` branches → suggests data-driven externalisation), newly-exported JS/TS symbols with no other-file consumer (incl. `export default function/class`), and ≥5-line code blocks duplicated from a same-directory neighbour. Never blocks; emits one `system-reminder` per file. Implementation uses portable grep+sed (no gawk-specific `match(... , arr)` three-arg form) so it runs on macOS's bundled BSD awk just like the 0.7.2-era hooks.
- New task pointer protocol: `.do-it/runtime/pointer` is a single-line file holding the active task slug. `do-it-planning` and `do-it-brainstorm` write it when creating a durable artifact; `do-it-branch-closeout` clears it; `do-it-router` reads it before routing. Defined once in `do-it-router` § Task Pointer; other skills short-reference.
- Tests: `tests/hooks/anti-patterns-lint.test.sh` (12 cases incl. `export default` coverage) and 4 new cases in `tests/hooks/verification-gate.test.sh` lock in the new behaviors. `scripts/test-hooks.sh` gains a dim-aware grill suppression case + counter-case so the new `hooks/grill-prompt.sh` consumer of `dim_touches_code` is exercised. `npm run test-hooks` now exercises the full `tests/hooks/*.test.sh` suite (router, comments-lint, anti-patterns-lint, verification-gate, common).

### Changed

- **DIM_* dimensions are now actively consumed** (the 0.7.0 "维度正交化" design finally lands). Each of the five session-state dimensions has at least one explicit consumer:
  - `dim_touches_code` → `hooks/grill-prompt.sh` suppresses Standard-tier implicit triggers when the prompt has no code object (discussion turn).
  - `dim_crosses_packages` → `do-it-architecture-scan` skill: mandatory trigger when set.
  - `dim_breaks_interface` → `do-it-interface-drill` skill (mandatory trigger) and `hooks/verification-gate.sh` (requires the inline-review marker to name `interface` / `contract` / `schema` / `api`).
  - `dim_needs_tdd` → `do-it-tdd` skill: mandatory trigger when set.
  - `dim_needs_review_loop` → `do-it-review-loop` skill (mandatory trigger) and `hooks/verification-gate.sh` (requires `review-loop` / `review-quick` / `review-deep` / `review-adversarial` mention in the recent transcript before a "done" claim passes).
  - The canonical one-liner for reading a dimension (and the "missing state degrades to tier-only" fallback) lives in `do-it-router` § Reading dimensions. `docs/routing-matrix.md` updated to match: MAY → SHOULD.
- **`do-it-fix-loop` switches default posture from "see-one-fix-one" to "collect all findings → root-cause → batch or pointwise"**. The Standard tier sequence now requires a written `Batch vs Pointwise Decision` covering every finding before editing. The Red Flag entry that previously forbade multiple unrelated fixes in one commit is removed; the new red flag is going one-by-one without a written root-cause decision. `do-it-review-loop` correspondingly requires reviewers to emit findings as a complete batch, not stream them.
- **`do-it-comments-discipline` SKILL.md trimmed from 373 lines to 119 (~68% reduction)**, keeping the 5 allowed categories (one example + one near-miss each), the 6 forbidden families (one bad line + one fix per family), the review checklist, the hook keyword reference, escape hatch, and output shape. The `comments-lint` hook strength is unchanged (still advisory) — the bet is that a smaller SKILL gets read by the agent at all.
- **23 subagent TOML files lose their duplicated `Common protocol:` block** (~4-5 lines per agent, ~120 lines total). Replaced with a single line pointing at `do-it-subagent-orchestration` § Required Prompt Contract, which already defines the canonical dispatch contract. The shared boilerplate now lives in exactly one place.

### Fixed

- `hooks/verification-gate.sh` no longer falls back to a raw `tail -n 5` of the JSONL when `jq` *does* parse but the last assistant frame is tool-only with no text content. The fallback only fires when `jq` is missing; with `jq` present, an empty result is treated as "agent said nothing this turn" and the gate stays silent. Prevents a false-positive block where the new `dim_breaks_interface` attestation check would see leaked text from earlier turns and refuse to find the interface keyword on its own line.
- Documented `Reading dimensions` in `do-it-router` § now distinguishes the hook layer (call `do_it_session_state_get` from `hooks/lib/common.sh`, which already honours the 5-level env-var path search) from the agent layer (judge mandatory triggers from prompt content; do not query state at runtime). The earlier shipped one-liner pointed at a path that is incorrect under the plugin-install env layout.
- Each mandatory-trigger sentence inside `do-it-tdd`, `do-it-interface-drill`, `do-it-architecture-scan`, and `do-it-review-loop` now carries an explicit Light-tier escape clause and points at `do-it-router` § Mandatory-trigger escape clauses. `dim_needs_tdd` is no longer treated as a forced ceremony on docs/config edits.
- `.do-it/runtime/pointer` protocol is reframed as a best-effort hint: read consumers MUST verify the referenced artifact exists, and the document explicitly addresses branch-switch, concurrent-write, and `<closed>`-sentinel edge cases.
- `do-it-comments-discipline` gains a `Verification (pass criteria)` section and a `Trigger Event` section that the 373→119 slim accidentally dropped; the Anti-Pattern Hook Keywords list is reconciled with `hooks/comments-lint.sh` (adds `曾经`, `fix:`, `bugfix`, `hotfix`, `patched`, `FIXME`, `XXX`; splits `history` and `fix-narrative` into separate families to match the hook's `_record_family` calls).
- `do-it-review-loop` and `do-it-fix-loop` now cross-link explicitly: review-loop step 8 names the batch contract fix-loop operates on; fix-loop's `Batch vs Pointwise Decision` references review-loop step 8 as the source of the complete finding list.
- `README.md`, `README.zh-CN.md`, and `docs/release.md` carry the new `0.8.0` tarball filename and an `Upgrading to 0.8.0` section. The READMEs also gain a paragraph describing the new advisory `anti-patterns-lint` hook.

### Known Limitations

- `dim_needs_review_loop` enforcement in `hooks/verification-gate.sh` reads `TAIL_BUF` (last 80 JSONL lines) and accepts any historical `review-loop` / `review-quick` / `review-deep` / `review-adversarial` mention. In a long session with multiple distinct review-needing turns, a later turn can inherit an older trace and silently pass. Tightening this requires a `last_review_seen_at` session-state timestamp; tracked as follow-up, not blocking 0.8.0.
- `dim_breaks_interface` attestation in `hooks/verification-gate.sh` accepts any inline-review marker that mentions `interface` / `contract` / `schema` / `api` — best-effort signal, not a semantic check. A marker like `inline-review: schema validation looks fine` satisfies the gate even on a non-schema change. The signal is intentionally generous; the reviewer / fix-loop is the real gate.

## 0.7.2

### Fixed

- Claude Code plugin hooks now run on macOS's bundled Bash 3.2 by removing
  Bash 4.3 nameref usage (`local -n`) from keyword loading and prompt matching.
- Hook scripts avoid a few GNU-only assumptions on macOS (`sha1sum`,
  `dirname --`, `stat --`, `cat --`, and template-less `mktemp`).

### Changed

- Tightened selected do-it skills with shorter trigger metadata and explicit
  stop, red-flag, and verification guidance for closeout, fix-loop,
  delegation, worktree isolation, grill logging, and skill authoring.

## 0.7.1

### Highlights

- **agent-skills method absorption.** Rewrote selected `addyosmani/agent-skills`
  methods into do-it-native workflow policy without vendoring upstream text or
  adding installed upstream skill names.
- **Skill anatomy hardening.** `do-it-skill-authoring` now defines the minimum
  installed-skill structure: trigger, tier/process, stop conditions, common
  rationalizations, red flags, and verification evidence.
- **Core workflow density.** Planning, slicing, TDD, debugging, interface drill,
  review-loop, architecture scan, verification-gate, and context now carry
  stronger anti-skip, boundary, dependency, and proof-quality rules.

### Changed

- `docs/upstream-map.md` records the `agent-skills` source idea to do-it
  destination mapping.
- `docs/maintenance.md` documents external workflow absorption, skill anatomy,
  and generated-artifact ownership rules.
- README and README.zh-CN acknowledge `agent-skills` as method inspiration and
  state the rewrite-not-vendoring boundary.

## 0.7.0

### Highlights

- **Codex agent schema repair.** Removed the unsupported `output_budget`
  top-level field from Codex-installed `agents/*.toml`; subagent response
  budgets now live in `do-it-subagent-orchestration`.
- **Agent bundle validation.** Added `scripts/validate-agent-bundle.mjs` and
  wired it into `npm test`, `build:claude-agents`, `build:codex-plugin`, and
  `prepack` so source agents, manifest inventory, Claude output, and the Codex
  plugin bundle cannot drift silently.
- **0.7.0 release metadata.** Package, manifest, plugin metadata, release
  docs, and README upgrade notes now describe the 23-skill / 23-agent surface.

### Added

- Codex plugin marketplace distribution under `.agents/plugins/marketplace.json`
  and `plugins/do-it/`, generated by `scripts/build-codex-plugin.mjs` from
  `manifest.json`.
- Codex global hook install assets: default Codex setup now manages `hooks/`
  and root `hooks.json` so `UserPromptSubmit`, `PreToolUse`, `PostToolUse`,
  and `Stop` can invoke do-it hooks from `${CODEX_HOME:-$HOME/.codex}`.

### Changed

- Skill frontmatter descriptions now use trigger-first `Use when...` wording
  while preserving the existing Problem/Fix body content.
- `brainstorm` is no longer an escape keyword, so explicit brainstorm prompts
  continue through router, grill, and verification gates.
- Release and maintenance docs now distinguish Codex global setup, Codex plugin
  marketplace discovery, and Claude Code plugin hooks.

## 0.6.1

### Highlights

- **Codex-compatible agent TOML.** Removed the Claude-only `claude_model`
  field from Codex-installed `agents/*.toml`. `scripts/build-claude-agents.mjs`
  now owns the Claude model map and still emits `model: sonnet` for the
  brainstorm lenses and `code-mapper`.
- **Brainstorm two-core redesign.** `do-it-brainstorm` now starts from
  `product-strategist` and `architecture-strategist`, then dynamically adds
  task-fit supplemental lenses. Product strategy clarifies product boundary,
  core goal, requirement shape, and option tradeoffs. Architecture strategy
  separates core foundation from extension modules and names what should close
  in the current stage.
- **Brainstorm discovers; grill converges.** Brainstorm output now centers on
  `Requirement Shape`, `Product Boundary`, `Core Goal`, `Options`,
  `Architecture Foundation`, `Extension Modules`, and `Must Resolve In Grill`.
  Grill owns convergence; brainstorm does not collapse options into a final
  answer.

### Added

- `agents/product-strategist.toml` — required product core brainstorm lens.
- `agents/architecture-strategist.toml` — required architecture core
  brainstorm lens.

### Changed

- `skills/do-it/do-it-brainstorm/SKILL.md` — replaces the fixed four-persona
  flow with product + architecture cores, dynamic supplements, discussion-first
  mode, and option tradeoff output.
- `commands/do-it-brainstorm.md` — documents default dual cores, explicit
  lens selection, and discussion-first usage.
- `skills/do-it/do-it-grill/SKILL.md` — consumes `Must Resolve In Grill`
  instead of the legacy per-lens question list.
- README, README.zh-CN, release, and maintenance docs updated for the 0.6.1
  compatibility and brainstorm contract.

### Migration

- Re-run `do-it setup` or `do-it install` to refresh live Codex agent TOML.
  After upgrade, `rg -n "claude_model" ~/.codex/agents` should not match
  do-it-managed Codex agent files.
- No project artifact migration is required. Existing 0.6.0 brainstorm files
  remain readable by humans, but new artifacts use the 0.6.1 section names.

## 0.6.0

### Highlights

- **Brainstorm before grill.** Initial `do-it-brainstorm` support wrote one
  artifact per task at `.do-it/brainstorm/<task>.md`. The lens model and
  section contract were replaced by the 0.6.1 product + architecture core
  design above.
- **Grill convergence mode.** `do-it-grill` reads the brainstorm artifact
  when one is open, lifts execution-blocking items into candidate premises,
  and flips brainstorm `status: open` → `converged` once each decision is
  resolved in the grill log. Light tier still uses single-thread grill;
  Standard / Heavy must consume the brainstorm.
- **Project handbook bootstrap.** New `do-it-handbook` skill scaffolds
  `.do-it/handbook/` with twelve generalized templates (invariants,
  architecture, code-map, glossary, backlog, runtime-status, maintenance,
  task-card-template, plus three workflow files). Templates are skeletons
  with placeholders; the bootstrap is additive and never overwrites.
- **Persistent code map.** `code-mapper` now writes the
  "Current Implementation Locations" section of `.do-it/handbook/code-map.md`
  when the handbook exists, so future sessions read instead of re-derive. A
  new `code-map-refresh` hook marks that section stale on barrel / migration
  / route / workspace-manifest edits.

### Added

- `skills/do-it/do-it-brainstorm/SKILL.md` — initial divergent brainstorm pass
  before grill convergence.
- `skills/do-it/do-it-handbook/SKILL.md` plus twelve templates under
  `templates/` and `templates/workflow/`.
- `agents/ceo-reviewer.toml`, `ux-designer.toml`, `end-user-advocate.toml`,
  `ops-sre.toml` — supplemental read-only brainstorm lenses. Their Claude
  model handling moved out of Codex TOML in 0.6.1.
- `commands/do-it-brainstorm.md`, `commands/do-it-handbook.md`.
- `hooks/code-map-refresh.sh` — PostToolUse marker that prepends
  `<!-- stale: true; reason: ... -->` to `.do-it/handbook/code-map.md` on
  structural-file edits. Idempotent (replaces, does not stack).

### Changed

- `scripts/build-claude-agents.mjs` — builds Claude agent Markdown from Codex
  TOML. Claude-only model selection moved into the generator in 0.6.1.
- `agents/code-mapper.toml` — adds a Handbook Write Target / Claude Code
  Adapter section in `developer_instructions`. Output target shifts from inline-only to
  `.do-it/handbook/code-map.md` "Current Implementation Locations" when the
  handbook exists.
- `skills/do-it/do-it-grill/SKILL.md` — adds "Convergence after brainstorm"
  section and Light / Standard / Heavy consumption rules.
- `hooks/grill-prompt.sh` — when `.do-it/brainstorm/*.md` has any file with
  `status: open` and tier is Standard / Heavy, appends a convergence-mode
  pointer to the grill reminder.
- `hooks/hooks.json` — registers PostToolUse for `code-map-refresh.sh`.
- `manifest.json` — registers `do-it-brainstorm` and `do-it-handbook` skills,
  plus the initial brainstorm lens agents.

### Migration

- No breaking changes for 0.5.x users. Existing `.do-it/grill/`,
  `.do-it/plans/`, and `.do-it/CONTEXT.md` paths are unchanged.
- The new `.do-it/brainstorm/` directory is additive; grill ignores it on
  Light tier and works as before when no brainstorm artifact exists.
- The new code-map refresh hook only acts when
  `.do-it/handbook/code-map.md` already exists; projects that have not run
  `/do-it-handbook` are unaffected.

## 0.5.1

### Highlights

- **Flow reduction.** Standard prompts no longer default to `grill -> planning
  -> review-loop`. The router now tells agents to use an inline modification
  map, add grill only when the decision actually needs it, and select review
  depth by risk.
- **Non-sticky question state.** Router now records
  `last_prompt_kind=question|work`, so a question turn can bypass grill/gate
  for that turn without suppressing the next implementation turn.
- **Decision-triggered grill.** `grill-prompt` no longer fires just because an
  intent verb appears. Standard grill triggers only on uncertainty, explicit
  grill requests, or long input that also has a plan/spec hint. Heavy still
  auto-grills.
- **Lighter plan gate.** `grill-pretool` only requires `.do-it/plans/*` for
  Heavy work or explicit durable-plan requests. Standard source edits may use
  an inline modification map. Existing plan partial edits are no longer blocked
  just because the edited fragment lacks `## Grill`.
- **Risk-budgeted review.** `do-it-review-loop` now spells out local Light /
  docs-only review, at most one focused Standard reviewer, and two default
  Heavy release/workflow lenses: skill quality and install/release readiness.

### Added

- `scripts/test-hooks.sh` — regression coverage for question-state recovery,
  reduced grill triggers, Heavy two-signal behavior, long-input `length + hint`,
  Standard vs Heavy source plan gates, and existing-plan partial edits.
- `npm run lint-hooks` and `npm run test-hooks`; `npm test` now runs both.

### Changed

- `hooks/router.sh` — separates prompt kind from grill state, records durable
  plan requirement, and updates Standard/Heavy reminders.
- `hooks/grill-prompt.sh` — removes intent-only trigger, changes long-input
  trigger from `length OR hint` to `length AND hint`, and changes reminders to
  fact-first / one-question guidance.
- `hooks/grill-pretool.sh` — scopes hard plan gates to Heavy or explicit
  durable-plan work.
- `hooks/verification-gate.sh` — checks `last_prompt_kind=question` instead of
  relying on `grilled=skip-question`.
- `do-it-grill`, `do-it-grill-log`, `do-it-planning`, and
  `do-it-verification-gate` — align the contract around fact verification,
  one user decision at a time, and `kind: fact|decision` grill-log items.
- README, routing, release, and migration docs updated for 0.5.1 behavior and
  tarball examples.

## 0.5.0

### Highlights

- **Sharper triggering.** `hooks/router.sh` and `hooks/grill-prompt.sh` no
  longer fire on single CJK characters (`做`, `改`, `加`, `修`, `审`, …) and
  use ASCII word-boundary matching, so `fix` no longer matches `prefix` and
  `add` no longer matches `address`. Heavy tier requires ≥2 heavy signals to
  upgrade.
- **Same-session de-dup.** Grill emits at most once per session unless the
  user explicitly asks again (`重新 grill` / `re-grill` / `再 pressure-test` /
  `重新审视`). Re-implementing in the same conversation no longer eats tokens
  on a repeat 5-step template.
- **Question / discussion mode.** Prompts ending in `?` / `？` / `吗` / `呢`
  or matching the question hints get auto-classified Light, suppress grill,
  and bypass the verification gate. "你觉得 X 怎么样？" is no longer treated
  as an implementation request.
- **Pointer-mode grill output.** Standard-tier grill emits ~60-token pointer
  reminders; full 5-step template is preserved for Heavy tier.
- **`DO_IT_DEBUG=1`** is now first-class. Each hook decision (escape, skip,
  question, tier, trigger, evidence detection) emits one structured stderr
  line. Default is silent.
- **Session state JSON.** Hook invocation counters and tier history are
  persisted under `${CLAUDE_PLUGIN_DATA}/sessions/<id>/state.json`.
  `do-it doctor --session=<id>` pretty-prints it.
- **Verification-gate is more honest.** Reads only the *last* assistant
  message for completion language; passes through turns with no
  Edit/Write/MultiEdit calls; respects question / discussion turns. Evidence
  pattern expanded to cover pytest, mypy, tsc, eslint, ruff, biome,
  cargo, go.
- **Auto-migrate.** `do-it install` detects 0.4.x install state and silently
  upgrades it; `pre-migrate.json` backup is left in place. Use
  `--no-migrate` to refuse and exit code 2.

### Added

- `hooks/data/*.tsv` — keyword tables are now data-driven (intent verbs,
  uncertainty words, heavy/light signals, escape words, long-input hints,
  question hints). `hooks/lib/keywords.sh` is a thin loader.
- `hooks/data/SCHEMA.md` — file format and maintenance checklist for the
  tsv tables.
- `hooks/lib/debug.sh` — `do_it_debug` helper for structured stderr trace
  when `DO_IT_DEBUG=1`.
- `do_it_prompt_has_word`, `do_it_prompt_is_question`,
  `do_it_session_state_get/set/inc`, `do_it_session_summary` in
  `hooks/lib/common.sh`.
- New skills: `do-it-context` (with `CONTEXT-FORMAT.md`) and
  `do-it-grill-log` (per-task grill artifact under `.do-it/grill/<task>.md`).
- `scripts/lint-hooks.sh` — shellcheck on hook entry points; `npm run lint`.
- `.github/workflows/lint.yml` — CI shellcheck on push / PR.
- `install/manage.mjs` — `--session=<id>` flag for doctor;
  `--no-migrate` flag for install; `needsMigration` / `runMigration`
  with manifest-declared migration actions; pre-migrate state backup.
- `manifest.json` `migrations` field — declarative migration actions
  (`remove-state-entry`, `rename-state-key`).

### Changed

- `hooks/router.sh` — question short-circuit, ≥2-heavy-signal upgrade rule,
  compact ≤80-token system-reminder. Full Heavy / Standard / Light
  recommendations have moved into the corresponding skill SKILL.md files.
- `hooks/grill-prompt.sh` — same-session de-dup; Heavy tier emits full
  template, others emit pointer; explicit re-grill phrase detection.
- `hooks/verification-gate.sh` — last-assistant-only completion scan;
  no-edit pass-through; question pass-through; expanded evidence patterns.
- `hooks/grill-pretool.sh` — debug instrumentation only; behavior unchanged.
- `skills/do-it/do-it-grill/SKILL.md` rewritten to "ask one premise at a
  time, anchor terms, falsify before debating, sediment to CONTEXT.md /
  grill log".
- `skills/do-it/do-it-planning/SKILL.md` — Planning Sequence step 2 now
  requires reading `.do-it/grill/<task>.md` and resolving any `pending`
  premise before finalizing the plan.
- `skills/do-it/do-it-verification-gate/SKILL.md` — new "Inputs" section
  requiring `.do-it/grill/<task>.md` review at closeout.

### Removed

- Single-character CJK intent verbs (`做`, `改`, `加`, `写`, `修`, `审`,
  `搭`) from the default intent-verbs table.
- ASCII whitespace hacks (`add `, ` add `, `test `, `should `, `could `,
  `might `, `doc `) — replaced by word-boundary matching, which handles
  `address` / `prefix` / `released` correctly without manual padding.

### Migration

`do-it install` detects 0.4.x install state and silently migrates. Behavior is
additive only; the auto-migrate is mostly bookkeeping (state version bump + new
skills `do-it-context`, `do-it-grill-log`).

## 0.4.0

### Highlights

- **Claude Code target.** `do-it` now ships as a Claude Code plugin alongside
  the Codex install. Use `/plugin marketplace add tdwhere123/codex-workflow`
  then `/plugin install do-it`, or `do-it install --target=claude` from the
  CLI.
- **Hook-driven workflow.** On Claude, the three core skills (router, grill,
  verification-gate) auto-trigger via UserPromptSubmit, PreToolUse, and Stop
  hooks. No slash commands to memorize. Escape hatch: include `yolo`,
  `直接做`, `skip grill`, or `/do-it-skip` in the prompt.
- **Problem/Fix skill descriptions.** All 17 SKILL.md descriptions rewritten
  in the `Problem: ...; Fix: ...` shape so Claude's implicit-summon path stays
  reliable when hooks are bypassed.

### Added

- `.claude-plugin/plugin.json` and `marketplace.json` — Claude plugin metadata
  with a self-hosted marketplace pointing at the repo root.
- `hooks/` — four hook scripts (`router.sh`, `grill-prompt.sh`,
  `grill-pretool.sh`, `verification-gate.sh`) plus shared library
  (`lib/common.sh`, `lib/keywords.sh`).
- `commands/do-it-skip.md` — the only slash command; explicit escape hatch.
- `scripts/build-claude-agents.mjs` — converts `agents/*.toml` to
  `dist/claude/agents/*.md`. Runs automatically on
  `do-it install --target=claude` and via `prepack`.
- `manifest.json` — new `targets` block describing each host's install root,
  agent file extensions, extras, and pre-install scripts.
- `manage.mjs` — `--target=<name>` and `--with-optional` flags.
- `package.json` — new `install:claude` / `doctor:claude` /
  `build:claude-agents` scripts; `prepack` runs the agent build.

### Removed

- `do-it-delivery-loop` skill — folded into the Heavy path of `do-it-router`
  plus `do-it-planning`. Recorded in `manifest.deprecatedTargets`; existing
  0.3.x installs have it cleaned up on upgrade via legacyHashes.

### Marked optional

- `do-it-visual-planning` — was a default skill; now requires
  `--with-optional` to install. Existing installs are not auto-removed but
  drop out of `doctor`'s managed set; rerun `do-it install --with-optional`
  to keep it managed.

### Changed

- All remaining 17 SKILL.md descriptions rewritten in `Problem: ...; Fix: ...`
  shape.
- `manage.mjs` rewritten around an `installRoot` abstraction; `codexHome` is
  now `installRoot`, computed from the active target's `rootEnv` /
  `rootDefault`. `CODEX_HOME` continues to work for codex; new
  `CLAUDE_PLUGIN_ROOT_OVERRIDE` for claude target.
- `assertManagedTargetShape` now accepts `extras` (top-level dirs/files added
  by target config) and the agent target extension is target-driven (`.toml`
  for codex, `.md` for claude).

### Compatibility

- **Codex install is byte-equal** with 0.3.x except for `do-it-delivery-loop`
  (deprecated, removed on upgrade) and `do-it-visual-planning` (now optional;
  unchanged on disk but no longer in the managed set unless
  `--with-optional`).
- **State files:** codex still uses `.do-it-install-state.json`; claude uses
  `.do-it-install-state-claude.json` to avoid collision when both targets are
  installed.
- **Existing 0.3.x codex users:** `do-it-delivery-loop` will be removed on
  upgrade (legacyHash matches). `do-it-visual-planning` will not be
  auto-removed but will fall out of the managed set; reinstall with
  `--with-optional` or remove manually.

### Upgrade

```bash
npm install -g @tdwhere/do-it@0.4.0
do-it install                       # codex (default)
do-it install --target=claude       # claude (or use marketplace)
```

To keep `do-it-visual-planning` as a managed skill on codex:

```bash
do-it install --with-optional
```
