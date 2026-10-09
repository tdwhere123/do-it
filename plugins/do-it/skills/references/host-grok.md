# Grok Build

Install the generated `plugins/do-it-grok/` bundle as `do-it-grok`, not the
repository root. On the inspected native Grok Build 1.0.46 host, a root plugin
named `do-it` was masked by Claude marketplace discovery. A distinct name and
bundle path keep the intended source identifiable. The builder writes
`.grok-plugin/plugin.json`; specialist Markdown comes from `agents/*.toml`.

From the repository root after generation:

```bash
npm run build:generated
node scripts/build-grok-plugin.mjs
agent plugin validate plugins/do-it-grok
agent plugin install "$(pwd)/plugins/do-it-grok" --trust
agent inspect --json
```

Reload the Plugins tab or start a new session. Inspect loaded source paths and
actual skill and agent names, rather than relying on `plugin list` alone. The
bundle projects the twelve canonical skills and ten specialist bodies. See
[installation](https://github.com/tdwhere123/do-it/blob/main/docs/install.md#grok-build).

## Runtime boundaries

Grok hook input uses camelCase fields such as `sessionId` and `toolName`.
The host supplies `GROK_PLUGIN_ROOT` and `GROK_PLUGIN_DATA`, plus the compatible
`CLAUDE_PLUGIN_ROOT` and `CLAUDE_PLUGIN_DATA` aliases. Host compatibility does
not make every Claude hook event or response equivalent.

UserPromptSubmit updates only the turn counter and emits no Core context.
An allowing UserPromptSubmit hook's context is discarded; session output is
not model-visible bootstrap evidence. PostToolUse consumes context alongside
the tool result. `hooks/grok-adapter.sh` delivers the generated Core excerpt
after the first completed tool, with session deduplication. It maps
`Edit|Write|MultiEdit|search_replace` payloads to the canonical edit checker.
There is no pre-action bootstrap claim; a tool-free turn does not receive Core
through these hooks.
The Claude strict external-action profile is not part of this adapter.

Specialist instruction boundaries and tool restrictions are distinct from a
filesystem sandbox. The host's active permissions remain authoritative. Native
validation establishes package shape; loaded-source inspection establishes
discovery; neither alone establishes live hook execution or enforcement.

Primary host references are the installed Grok Build user guide chapters
`09-plugins.md`, `10-hooks.md`, `16-subagents.md`, and `08-skills.md` under
`~/.grok/docs/user-guide/`, and the public
[hooks](https://docs.x.ai/build/features/hooks.md) and
[subagents](https://docs.x.ai/build/features/subagents.md) references.
