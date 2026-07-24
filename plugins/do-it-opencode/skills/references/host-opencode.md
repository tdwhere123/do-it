# Host Adapter: OpenCode

Medium hook depth via a TypeScript plugin: per-message shell routing/grill
advisories, plus bash bridges for quality lint and verification soft reminders.

## Install (plugin-first)

OpenCode loads plugins from the `"plugin"` array in project `opencode.json` or
`~/.config/opencode/opencode.json`, or from files under `.opencode/plugins/` /
`~/.config/opencode/plugins/`. See
[opencode.ai/docs/plugins](https://opencode.ai/docs/plugins).

### npm package (recommended)

```bash
opencode plugin @tdwhere/do-it-opencode -g
```

### Global vendored fallback

For checkout development or registry outages, `npm run install:opencode-global`
vendors a built copy into OpenCode's config home. Do **not** point `"plugin"` at
a do-it git checkout for daily use.

That fallback registers `@tdwhere/do-it-opencode` via
`~/.config/opencode/vendor/do-it-opencode` + `package.json` `file:` dependency:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["@tdwhere/do-it-opencode"],
  "permission": {
    "skill": "allow"
  }
}
```

Restart OpenCode after install. Details:
[`plugins/do-it-opencode/docs/README.opencode.md`](../../../plugins/do-it-opencode/docs/README.opencode.md).

### Dev checkout path (optional)

For plugin development only, an absolute path to `plugins/do-it-opencode` in a
local clone works. Prefer the global vendor install for live hosts.

Starter template: `plugins/do-it-opencode/opencode.json.template`. The plugin
registers `skills/do-it/` paths in `config`; session state lives under
`$OPENCODE_DATA/sessions/`.

### Verify build

```bash
npm run build:opencode-plugin
npm run test-opencode
```

## Hook Depth

**Medium** — event mapping differs from Claude/Codex; no `grill-pretool`:

| OpenCode event | Kernel script | Notes |
| --- | --- | --- |
| `experimental.chat.messages.transform` | cached bootstrap | stable host guidance and skills index |
| `chat.message` (default off) | `behavior-feedback.sh` | silent local feedback capture for a confirmed root session only; parentage uncertainty skips capture |
| `chat.message` | `router.sh`, `grill-prompt.sh` | classifier every message; grill only Heavy or explicit and always advisory |
| `config` | — | registers `skills/do-it/` paths |
| `tool.execute.after` | `write-quality-lint.sh` | advisory bash bridge |
| `session.idle` | `verification-gate.sh` | serializes host messages into a temporary transcript and emits only a soft reminder |

OpenCode has no pre-edit plan gate. It shares router/grill semantics with other
hosts, but idle verification cannot interrupt completion and must not be described as a hard block.

## Tool Mapping

| do-it intent | OpenCode surface |
| --- | --- |
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

- Inline lightweight regex in TS for hot paths; spawn bash for gate parity when
  needed.
- Cache bootstrap payload across turns within a session.
- Quality lint scans **added lines only** — same contract as bash hook.

## Known Limitations

- The bash bridge hook commands assume POSIX `sh`; no Windows (`.cmd`) story
  exists for this adapter (Cursor is the only one with a Windows path).
