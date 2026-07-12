# Host Adapter: Claude Code

Full hook parity with Codex; paths use Claude plugin variables.

## Install (plugin-first)

```text
/plugin marketplace add tdwhere123/do-it
/plugin install do-it@do-it
```

- Hooks: `${CLAUDE_PLUGIN_ROOT}/hooks/hooks.json`
- Session state: `${CLAUDE_PLUGIN_DATA}/sessions/`

Optional CLI mirror: `do-it setup --target=claude` / `do-it doctor --target=claude`.
Run `install/doctor.sh` after upgrade to verify hook file hashes.

Component paths are declared in `.claude-plugin/plugin.json`:
`skills` → `./skills/do-it`, `agents` → explicit `./dist/claude/agents/*.md`
list (Claude validates agents as a file-path array, not a directory string;
`dist/claude/` is tracked so git marketplace installs see agents after
`npm run build:generated`). Standard `hooks/hooks.json` is auto-loaded — do
**not** set `manifest.hooks` to that path (duplicate-load error).

## Hook Depth

**Full** — same scripts as Codex, referenced from
[`hooks/hooks.json`](../../../hooks/hooks.json):

| Event | Scripts |
|---|---|
| `UserPromptSubmit` | `router.sh` → `grill-prompt.sh` (Heavy-only) → `subagent-stance.sh` |
| `PostToolUse` (Edit\|Write\|MultiEdit\|NotebookEdit) | `write-quality-lint.sh` |
| `Stop` | `verification-gate.sh` |

`grill-pretool` is not registered.

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
