# Changelog

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
