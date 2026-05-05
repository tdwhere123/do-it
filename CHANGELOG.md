# Changelog

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
- `install/migrations/0.4-to-0.5.md` — human-readable upgrade notes.
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

`do-it install` detects 0.4.x install state and silently migrates. See
`install/migrations/0.4-to-0.5.md` for full details. Behavior is additive
only; the auto-migrate is mostly bookkeeping (state version bump + new
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
