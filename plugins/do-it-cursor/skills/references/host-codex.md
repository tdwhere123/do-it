# Host Adapter: Codex

Reference adapter for do-it hooks and install. Other hosts mirror this hook set
with different event names.

## Install (plugin-first)

Register the marketplace, then install the plugin (or use the TUI `/plugins` flow):

```bash
codex plugin marketplace add tdwhere123/do-it
codex plugin add do-it@tdwhere-do-it
```

`codex plugin marketplace add` only registers the marketplace — it does not
install the plugin. Marketplace name `tdwhere-do-it` and plugin name `do-it`
come from `.agents/plugins/marketplace.json`.

After install, **trust plugin hooks** under `/hooks` (plugin hooks are skipped
until trusted). The plugin bundle ships skills, agents, and hooks together
(`plugins/do-it/`, generated from `manifest.json`).

Local smoke from a checkout (use a temp `CODEX_HOME` if needed):

```bash
CODEX_HOME=/tmp/do-it-plugin-test codex plugin marketplace add /path/to/do-it
CODEX_HOME=/tmp/do-it-plugin-test codex plugin add do-it@tdwhere-do-it
```

Optional / legacy global copy (doctor, temp-home smoke, migration):

```bash
do-it setup
do-it doctor
```

- Plugin hooks: paths resolve via `PLUGIN_ROOT` / `PLUGIN_DATA` inside the
  Codex plugin bundle
- Legacy global hooks (if using setup): `$CODEX_HOME/hooks/` + root
  `hooks.json` from [`install/codex-hooks.json`](../../hooks/hooks.json)
- Session state: plugin data dir, or `$CODEX_HOME/do-it-data/sessions/` via
  `DO_IT_HOOK_DATA` for legacy global installs

## Hook Depth

**Full** — kernel hooks wired without `grill-pretool`:

| Event | Scripts |
|---|---|
| `UserPromptSubmit` (default off) | `behavior-feedback.sh` records only explicit behavioral feedback locally; it emits no context |
| `UserPromptSubmit` | `router.sh` → `grill-prompt.sh` (Heavy-only) → `subagent-stance.sh` |
| `PostToolUse` (Edit\|Write\|MultiEdit\|NotebookEdit) | `write-quality-lint.sh` |
| `Stop` | `verification-gate.sh` |

## Authorization

The bundled hooks are advisory, not a hard external-action gate. Codex plugin
hooks can add context but cannot veto a `PreToolUse` or `PermissionRequest`
call. Keep a real boundary in Codex's sandbox, approval policy, and command
rules; bypass modes intentionally remove that protection.
For an opt-in, host-accurate boundary rather than a fake plugin veto, see
[`strict-external-actions.md`](https://github.com/tdwhere123/do-it/blob/main/docs/strict-external-actions.md).

## Tool Mapping

| do-it intent | Codex tool |
|---|---|
| Read / inspect | `Read`, `Shell` (`cat`, `git diff`) |
| Edit | `Edit`, `Write`, `apply_patch` |
| Verify | `Shell` (tests, lint, doctor) |
| Delegate | `Task` with agent TOML under `agents/` |
| Load skill | Codex skill discovery / plugin skills |

## Truth Plane

Use `live-codex` when a claim depends on Codex marketplace install, hook firing,
or CLI behavior — not merely on repo file contents.

## Notes

- Prefer plugin hooks; do not require pairing marketplace install with global
  `do-it setup` for skills/hooks.
- Subagent detection uses host env vars consumed by `hooks/lib/common.sh`.
- Default environment assumed in public docs; adapter terms live here, not in
  shared skill bodies.
