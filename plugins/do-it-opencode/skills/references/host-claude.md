# Host Adapter: Claude Code

Full hook parity with Codex; paths use Claude plugin variables.

## Install

- Plugin manifest installs skills, hooks, and agents from `manifest.json`
- Hooks: `${CLAUDE_PLUGIN_ROOT}/hooks/hooks.json`
- Session state: `${CLAUDE_PLUGIN_DATA}/sessions/`

Run `install/doctor.sh` after upgrade to verify hook file hashes.

## Hook Depth

**Full** — same scripts as Codex, referenced from
[`hooks/hooks.json`](../../../hooks/hooks.json):

| Event | Scripts |
|---|---|
| `UserPromptSubmit` | `router.sh` → `grill-prompt.sh` → `subagent-stance.sh` |
| `PreToolUse` (Edit\|Write\|MultiEdit) | `grill-pretool.sh` |
| `PostToolUse` (Edit\|Write\|MultiEdit\|NotebookEdit) | `write-quality-lint.sh` |
| `Stop` | `verification-gate.sh` |

## Tool Mapping

| do-it intent | Claude Code tool |
|---|---|
| Read / inspect | `Read`, `Grep`, `Glob` |
| Edit | `Edit`, `Write`, `MultiEdit` |
| Verify | `Bash` |
| Delegate | `Task` subagent |
| Load skill | `Skill` tool |
| Ask user | `AskUserQuestion` |

## Truth Plane

Use `live-claude` when evidence must show the Claude plugin hooks, skill loading,
or CLI integration actually ran — not just that repo tests pass.

## Notes

- `${CLAUDE_PLUGIN_ROOT}` resolves hook script paths; do not hard-code in skills.
- PostToolUse matcher includes `NotebookEdit` for notebook workflows.
- Legacy `comments-lint` / `anti-patterns-lint` entries removed from manifest;
  both exec into `write-quality-lint.sh` for one release cycle.
