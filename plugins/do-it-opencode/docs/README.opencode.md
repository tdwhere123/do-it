# do-it OpenCode plugin

OpenCode adapter for the do-it workflow kernel: bootstrap guidance, advisory
write-quality and verification bridges, and bundled skills.

## Install

OpenCode discovers plugins via the `"plugin"` array in `opencode.json` (project)
or `~/.config/opencode/opencode.json` (global), or from `.opencode/plugins/` /
`~/.config/opencode/plugins/`. Package names in the array are auto-installed by
Bun at startup; local absolute or relative paths work for development. See
[opencode.ai/docs/plugins](https://opencode.ai/docs/plugins).

### Local path (recommended today)

From the do-it repo root:

```bash
npm run build:opencode-plugin
cd plugins/do-it-opencode && npm install   # once, if dependencies are missing
```

Add to `opencode.json` (project) or `~/.config/opencode/opencode.json`
(global):

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["/absolute/path/to/do-it/plugins/do-it-opencode"],
  "permission": {
    "skill": "allow"
  }
}
```

Replace the path with your clone location. OpenCode resolves
`@opencode-ai/plugin` from this directory's `package.json`.

See [`opencode.json.template`](../opencode.json.template) for a fuller starter
config (edit permissions, skills paths).

### npm package (when published)

`@tdwhere/do-it-opencode` is the intended published package name. **It is not
on npm yet** — do not use it until the package is published.

When available, OpenCode will auto-install it from the `"plugin"` array:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["@tdwhere/do-it-opencode"],
  "permission": {
    "skill": "allow"
  }
}
```

## Session state

Set `OPENCODE_DATA` (or rely on `<project>/.opencode`) so hook session state
aligns with bash hooks under `$OPENCODE_DATA/sessions/<session_id>/`.

## Tool mapping

| do-it intent | OpenCode surface | Plugin hook |
|---|---|---|
| Classify prompt / tier | `router.sh` on each user message + bootstrap guidance | `chat.message`, `experimental.chat.messages.transform` |
| Grill nudge | Heavy or explicit only; advisory | `chat.message` → `grill-prompt.sh` |
| Load skill | host skill tool + `config.skills.paths` | `config` |
| Read / inspect | host read / file tools | — |
| Edit source | `edit` / `write` / `multiedit` | no pre-edit plan gate |
| Post-edit quality | same edit tools | `tool.execute.after` → `write-quality-lint.sh` (advisory) |
| Done / ready claim | session completion | `session.idle` → `verification-gate.sh` (soft reminder when evidence is available) |
| Verify commands | terminal / exec | — (skill: `do-it-verify`) |
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

Verify:

```bash
npm run test-opencode
```

## Related

- Harness matrix: [`docs/harness-adapter-matrix.md`](https://github.com/tdwhere123/do-it/blob/main/docs/harness-adapter-matrix.md)
- Host sheet: [`host-opencode.md`](../skills/references/host-opencode.md)
