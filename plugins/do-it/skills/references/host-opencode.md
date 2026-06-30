# Host Adapter: OpenCode

Medium hook depth via a TypeScript plugin: transform-first bootstrap, selective
bash bridge for pretool and quality lint.

## Install (planned / in progress)

- Register plugin in project or user `opencode.json`
- Skills path registered in plugin `config`
- Session state: `$OPENCODE_DATA/sessions/`

Direct install and plugin mode may both exist (see nexel-style SPI backlog).

## Hook Depth

**Medium** — event mapping differs from Claude/Codex:

| OpenCode event | Kernel script | Notes |
|---|---|---|
| `experimental.chat.messages.transform` | cached bootstrap | tier, skip flags, skills index; minimize repeat cost |
| `config` | — | registers `skills/do-it/` paths |
| `tool.execute.before` | `grill-pretool.sh` (spawn) | Heavy / plan file gate on edit tools |
| `tool.execute.after` | `write-quality-lint.sh` (spawn or TS port) | advisory; prefer inline regex for speed |
| `session.idle` | verification soft reminder | not a hard block — pairs with stop bridge when available |

Full `UserPromptSubmit` chain is folded into transform bootstrap instead of three
serial shell hooks.

## Tool Mapping

| do-it intent | OpenCode surface |
|---|---|
| Read / inspect | plugin file API / host read tool |
| Edit | host `edit` / write tool |
| Verify | terminal / exec |
| Delegate | plugin-defined agents |
| Load skill | `config` skills registration |

Action-oriented skill prose ("edit the file", "run the verify command") maps
cleanly; avoid Claude-specific tool names in shared bodies.

## Truth Plane

Use `live-opencode` when evidence depends on transform bootstrap, plugin config
load, or OpenCode tool events — not repo-only proof.

## Performance Notes

- Inline lightweight regex in TS for hot paths; spawn bash for pretool / gate
  parity when needed.
- Cache bootstrap payload across turns within a session.
- Quality lint scans **added lines only** — same contract as bash hook.
