# do-it OpenCode plugin

OpenCode adapter for the do-it workflow kernel: bootstrap guidance, advisory
write-quality and verification bridges, and bundled skills.

## Install

OpenCode discovers plugins via the `"plugin"` array in `opencode.json` (project)
or `~/.config/opencode/opencode.json` (global), or from `.opencode/plugins/` /
`~/.config/opencode/plugins/`. Package names in the array are auto-installed by
Bun at startup. See
[opencode.ai/docs/plugins](https://opencode.ai/docs/plugins).

### Global install (recommended today)

Until `@tdwhere/do-it-opencode` is on npm, install a **vendored copy into
OpenCode's own config home** — do **not** point `"plugin"` at a do-it git
checkout (that couples the live host to a mutable worktree).

From the do-it repo root:

```bash
npm run install:opencode-global
```

This builds the plugin, copies it to
`~/.config/opencode/vendor/do-it-opencode`, links it as
`@tdwhere/do-it-opencode` via `~/.config/opencode/package.json`, and sets:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["@tdwhere/do-it-opencode"],
  "permission": {
    "skill": "allow"
  }
}
```

Restart OpenCode after install. Override the config home with
`OPENCODE_CONFIG_DIR` when needed.

Equivalent manual shape (same as Cursor's "real copy under the host home"):

```bash
npm run build:opencode-plugin
# copy plugins/do-it-opencode → ~/.config/opencode/vendor/do-it-opencode
# add package.json dependency: "@tdwhere/do-it-opencode": "file:./vendor/do-it-opencode"
# register "@tdwhere/do-it-opencode" in opencode.json (not a /path/to/clone/...)
```

`opencode plugin <module> -g` is the host CLI for npm modules. A tarball still
sitting **inside** the do-it checkout will write a checkout path into
`opencode.json` — move the tarball under the config home (or use
`npm run install:opencode-global`) instead.

### npm package (when published)

`@tdwhere/do-it-opencode` is the intended published package name. **It is not
on npm yet.**

When published:

```bash
opencode plugin @tdwhere/do-it-opencode -g
# or add "@tdwhere/do-it-opencode" to the plugin array and let Bun install it
```

### Dev checkout path (optional)

For plugin development only, an absolute path to
`plugins/do-it-opencode` in a local clone works. Prefer the global vendor
install for daily use.

See [`opencode.json.template`](../opencode.json.template) for the package-name
starter config.

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
