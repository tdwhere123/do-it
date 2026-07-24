# Host Vocabulary

do-it skills use **host-neutral** prose. Adapters translate at the edge. Use
this sheet when writing skills, subagent prompts, or docs that must work on
more than one runtime.

## Canonical Terms

| do-it term | Meaning | Do not substitute with |
| --- | --- | --- |
| parent agent | The orchestrating agent in the active session | "main Claude", "Composer" |
| subagent / child agent | A delegated worker with bounded scope | "Task tool", "subprocess" |
| skill | A loadable workflow file (`SKILL.md`) | upstream product names |
| hook | Host-invoked shell helper (`router.sh`, etc.) | "rule", "MCP" |
| tier | `Light` / `Standard` / `Heavy` routing label | host-specific modes |
| truth plane | Where evidence was collected (see `verification-gate` hook / `do-it-verify`) | "environment" loosely |
| system-reminder | Host-injected advisory text from a hook | "notification" |

## Tool Mapping (by host)

| Intent | Codex | Claude Code | Cursor | OpenCode | Kimi Code | Pi |
| --- | --- | --- | --- | --- | --- | --- |
| Read file | `Read` / shell | `Read` | `Read` | plugin file API | `Read` | `read` / `bash` |
| Edit file | `Edit` / `Write` | `Edit` / `Write` / `MultiEdit` | `StrReplace` / `Write` | `edit` tool | `Edit` / `Write` (only) | `edit` / `write` |
| Run command | `Shell` | `Bash` | `Shell` | terminal tool | `Bash` | `bash` |
| Delegate worker | `Task` / agent config | `Task` subagent | `Task` subagent | plugin agent | `Agent` built-ins only | `pi-subagents` |
| Load skill | skill discovery / `@skill` | `Skill` tool | skill discovery | `config` skills path | auto-discovery / `/skill:<name>` | package `skills/` |
| Ask user | host question UI | `AskUserQuestion` | chat | plugin prompt | `AskUserQuestion` | `pi-ask-user` |

When a skill says "run the smallest real experiment", pick the host's command
tool — do not hard-code `Bash` in shared skill text.

## Install Surfaces

| Host | Install entry | Skills path | Hooks path |
| --- | --- | --- | --- |
| Codex | plugin marketplace (primary); `do-it setup` optional/legacy | plugin skills or `~/.codex/skills/` | plugin `/hooks` (trust); legacy `$CODEX_HOME/hooks/` |
| Claude | plugin marketplace (primary) | `${CLAUDE_PLUGIN_ROOT}/skills/` | `${CLAUDE_PLUGIN_ROOT}/hooks/hooks.json` |
| Cursor | local plugin path / `do-it setup --target=cursor` (primary); Team Import / public marketplace when listed | plugin `skills/` | user `~/.cursor/hooks.json` → `run-hook.cmd` (plugin `hooks/hooks.json` not registered by current Cursor) |
| OpenCode | `opencode plugin @tdwhere/do-it-opencode -g`; global vendored fallback | plugin `skills/` | TS plugin events |
| Kimi Code | `/plugins install` git URL (primary) | root manifest `./skills/do-it/` | root `kimi.plugin.json` `hooks[]` (cwd = plugin root) |
| Pi | `pi install npm:@tdwhere/do-it-pi`; local-path development install | package `skills/` | TS extension events |

Authoritative install list: `manifest.json`. Doctor: `install/doctor.sh` (optional CLI path).

## Truth Planes (live hosts)

Verification and subagent prompts name the plane evidence came from:

| Plane | Proves |
| --- | --- |
| `source-repo` | Files and commands in the checkout |
| `task-worktree` | Isolated worktree for a slice |
| `integration-worktree` | Merged integration branch |
| `temp-install` | Package install under temp home |
| `live-codex` | Codex host behavior (hooks, marketplace, CLI) |
| `live-claude` | Claude Code plugin runtime |
| `live-cursor` | Cursor plugin + IDE hook surface |
| `live-opencode` | OpenCode plugin + transform/bootstrap |
| `live-kimi` | Kimi Code plugin install + manifest hook surface |
| `live-pi` | Pi package install + extension / skill discovery |
| `package-artifact` | Built tarball / npm pack output |
| `host-behavior` | Generic host UX when host-specific plane not needed |
| `external-blocked` | Network/credentials block |

Evidence from one plane does not prove another.

## Per-Host Detail

- [`host-codex.md`](host-codex.md)
- [`host-claude.md`](host-claude.md)
- [`host-cursor.md`](host-cursor.md)
- [`host-opencode.md`](host-opencode.md)
- [`host-kimi.md`](host-kimi.md)
- [`host-pi.md`](host-pi.md) (built into Pi plugin docs)
