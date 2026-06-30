# do-it OpenCode plugin

OpenCode adapter for the do-it workflow kernel: cached transform bootstrap,
bash hook bridge for pretool / write-quality / verification gates, and bundled
skills.

## Install

### npm (recommended)

From your project root:

```bash
npm install @tdwhere/do-it
# or install the plugin package directly when published standalone:
# npm install @tdwhere/do-it-opencode
```

Add to `opencode.json` (project) or `~/.config/opencode/opencode.json` (global):

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["@tdwhere/do-it-opencode"],
  "permission": {
    "skill": "allow"
  }
}
```

See [`opencode.json.template`](../opencode.json.template) for a fuller starter
config.

### Local path (development)

After `npm run build:opencode-plugin` in the do-it repo:

```json
{
  "plugin": ["/absolute/path/to/do-it/plugins/do-it-opencode"]
}
```

OpenCode resolves `@opencode-ai/plugin` from the plugin directory's
`package.json`. Run `npm install` inside `plugins/do-it-opencode/` once if
dependencies are missing.

## Session state

Set `OPENCODE_DATA` (or rely on `<project>/.opencode`) so hook session state
aligns with bash hooks under `$OPENCODE_DATA/sessions/<session_id>/`.

## Tool mapping

| do-it intent | OpenCode surface | Plugin hook |
|---|---|---|
| Classify prompt / tier | cached bootstrap in first user turn | `experimental.chat.messages.transform` |
| Load skill | host skill tool + `config.skills.paths` | `config` |
| Read / inspect | host read / file tools | — |
| Edit source | `edit` / `write` / `multiedit` | `tool.execute.before` → `grill-pretool.sh` (Heavy / durable plan) |
| Post-edit quality | same edit tools | `tool.execute.after` → `write-quality-lint.sh` (advisory) |
| Done / ready claim | session completion | `session.idle` → `verification-gate.sh` (soft toast; not a hard block) |
| Verify commands | terminal / exec | — (skill: `do-it-verification-gate`) |
| Skip hooks | user text / `/do-it-skip` | bootstrap documents tokens; bash hooks honor flags |

OpenCode tool ids are normalized to Claude-style names before invoking bash hooks
(`edit` → `Edit`, `write` → `Write`, `multiedit` → `MultiEdit`).

## Hook bridge payload

Spawned hooks receive JSON on stdin:

```json
{
  "session_id": "<sessionID>",
  "cwd": "<workspace directory>",
  "tool_name": "Edit",
  "file_path": "/path/to/file",
  "transcript_path": "",
  "tool_input": { "file_path": "..." }
}
```

## Build

From the do-it repo root:

```bash
npm run build:opencode-plugin
```

Copies `skills/do-it`, `dist/claude/agents`, selected `hooks/*.sh` (+ `lib/`,
`data/`), and compiles `src/` → `dist/`.

## Related

- Harness matrix: [`docs/harness-adapter-matrix.md`](../../../docs/harness-adapter-matrix.md)
- Host sheet: [`skills/do-it/references/host-opencode.md`](../../../skills/do-it/references/host-opencode.md)
