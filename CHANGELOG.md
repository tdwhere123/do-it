# Changelog

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
