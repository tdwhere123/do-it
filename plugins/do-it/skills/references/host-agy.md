# Antigravity (`do-it-agy`)

Install the generated `plugins/do-it-agy/` bundle locally as `do-it-agy`:

```bash
npm run install:agy-local
```

This validates `plugins/do-it-agy` with `agy plugin validate --strict --json`,
copies the bundle atomically into `~/.gemini/config/plugins/do-it-agy`
(preserving `.do-it-data`), and leaves `~/.gemini/config/config.json` untouched.
Use `[do-it-agy](customization://do-it-agy)` when directing users to enable or
disable the plugin in the Customizations UI; never hand-edit `config.json`.

## Bundle layout and hook lifecycle

AGY expects `plugin.json` and `hooks.json` at the plugin root, with every
directory under `skills/` holding a valid `SKILL.md`. The builder places shared
documentation under `references/` at the plugin root and rewrites skill links to
`../../references/`.

- `SessionStart` and `PreInvocation` run `./hooks/agy-adapter.sh`. Root
  conversations (transcript step 0 `USER_INPUT`) receive the generated Core
  context once per session and advance turn counters on `lastUserInput` changes.
- Subagent conversations whose step 0 is `SYSTEM_MESSAGE` receive compact
  `subagent-stance` instead of root Core.
- `PostToolUse` emits `{}` directly (AGY does not inject context from tool
  hooks) and stages `write-quality-lint` advisories in per-session
  `agy-pending-lint.txt` under `${PLUGIN_DATA}`. `PostInvocation` drains pending
  advisories via `injectSteps`.

Canonical specialist instructions come from `agents/*.toml` with explicit
native AGY tool arrays (`[read_file, run_command, manage_task]` for read-only
roles, plus `edit_file, write_file` for `workspace-write` roles) and
`subagent: true`, `mainAgent: false`. Active host permissions remain
authoritative; see [installation details](https://github.com/tdwhere123/do-it/blob/main/docs/install.md#antigravity).
