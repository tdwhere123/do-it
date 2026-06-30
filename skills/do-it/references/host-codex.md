# Host Adapter: Codex

Reference adapter for do-it hooks and install. Other hosts mirror this gate set
with different event names.

## Install

```bash
do-it setup          # copies skills, hooks, agents per manifest.json
do-it doctor         # verifies hook hashes and paths
```

- Hooks: `$CODEX_HOME/hooks/` (default `~/.codex/hooks/`)
- Session state: `$CODEX_HOME/do-it-data/sessions/` via `DO_IT_HOOK_DATA`
- Hook config: [`install/codex-hooks.json`](../../../install/codex-hooks.json)

## Hook Depth

**Full** — all kernel hooks wired in `codex-hooks.json`:

| Event | Scripts |
|---|---|
| `UserPromptSubmit` | `router.sh` → `grill-prompt.sh` → `subagent-stance.sh` |
| `PreToolUse` (Edit\|Write\|MultiEdit) | `grill-pretool.sh` |
| `PostToolUse` (Edit\|Write\|MultiEdit\|NotebookEdit) | `write-quality-lint.sh` |
| `Stop` | `verification-gate.sh` |

## Tool Mapping

| do-it intent | Codex tool |
|---|---|
| Read / inspect | `Read`, `Shell` (`cat`, `git diff`) |
| Edit | `Edit`, `Write`, `apply_patch` |
| Verify | `Shell` (tests, lint, doctor) |
| Delegate | `Task` with agent TOML under `agents/` |
| Load skill | Codex skill discovery / project skills dir |

## Truth Plane

Use `live-codex` when a claim depends on Codex marketplace install, hook firing,
or CLI behavior — not merely on repo file contents.

## Notes

- `DO_IT_HOOK_DATA` is set in every codex-hooks.json command prefix.
- Subagent detection uses host env vars consumed by `hooks/lib/common.sh`.
- Default environment assumed in public docs; adapter terms live here, not in
  shared skill bodies.
