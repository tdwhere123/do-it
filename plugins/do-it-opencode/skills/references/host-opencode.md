# Host Adapter: OpenCode

Medium hook depth via a TypeScript plugin: per-message shell routing/grill
advisories, plus bash bridges for quality lint and verification soft reminders.

## Install (plugin-first)

OpenCode loads plugins from the `"plugin"` array in project `opencode.json` or
`~/.config/opencode/opencode.json`, or from files under `.opencode/plugins/` /
`~/.config/opencode/plugins/`. See
[opencode.ai/docs/plugins](https://opencode.ai/docs/plugins).

### Local path (recommended today)

From a clone of the do-it repo:

```bash
npm run build:opencode-plugin
cd plugins/do-it-opencode && npm install   # once, if dependencies are missing
```

Register the built plugin directory in `opencode.json` (project) or
`~/.config/opencode/opencode.json` (global). Use an absolute path (or a path
relative to the config file):

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["/absolute/path/to/do-it/plugins/do-it-opencode"],
  "permission": {
    "skill": "allow"
  }
}
```

Starter template: `plugins/do-it-opencode/opencode.json.template`. The plugin
registers `skills/do-it/` paths in `config`; session state lives under
`$OPENCODE_DATA/sessions/`.

### npm package (when published)

When `@tdwhere/do-it-opencode` is published to npm, OpenCode can auto-install it
from the `"plugin"` array at startup (Bun). Intended config:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["@tdwhere/do-it-opencode"],
  "permission": {
    "skill": "allow"
  }
}
```

That package is **not on npm yet**; use the local path above until it is
published.

### Verify build

```bash
npm run build:opencode-plugin
npm run test-opencode
```

## Hook Depth

**Medium** — event mapping differs from Claude/Codex; no `grill-pretool`:

| OpenCode event | Kernel script | Notes |
|---|---|---|
| `experimental.chat.messages.transform` | cached bootstrap | stable host guidance and skills index |
| `chat.message` | `router.sh`, `grill-prompt.sh` | classifier every message; grill only Heavy or explicit and always advisory |
| `config` | — | registers `skills/do-it/` paths |
| `tool.execute.after` | `write-quality-lint.sh` | advisory bash bridge |
| `session.idle` | `verification-gate.sh` | serializes host messages into a temporary transcript and emits only a soft reminder |

OpenCode has no pre-edit plan gate. It shares router/grill semantics with other
hosts, but idle verification cannot interrupt completion and must not be described as a hard block.

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

- Inline lightweight regex in TS for hot paths; spawn bash for gate parity when
  needed.
- Cache bootstrap payload across turns within a session.
- Quality lint scans **added lines only** — same contract as bash hook.
