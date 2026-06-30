# Host Vocabulary

do-it skills use **host-neutral** prose. Adapters translate at the edge. Use
this sheet when writing skills, subagent prompts, or docs that must work on
more than one runtime.

## Canonical Terms

| do-it term | Meaning | Do not substitute with |
|---|---|---|
| parent agent | The orchestrating agent in the active session | "main Claude", "Composer" |
| subagent / child agent | A delegated worker with bounded scope | "Task tool", "subprocess" |
| skill | A loadable workflow file (`SKILL.md`) | upstream product names |
| hook | Host-invoked shell gate (`router.sh`, etc.) | "rule", "MCP" |
| tier | `Light` / `Standard` / `Heavy` routing label | host-specific modes |
| truth plane | Where evidence was collected (see verification-gate) | "environment" loosely |
| system-reminder | Host-injected advisory text from a hook | "notification" |

## Tool Mapping (by host)

| Intent | Codex | Claude Code | Cursor | OpenCode |
|---|---|---|---|---|
| Read file | `Read` / shell | `Read` | `Read` | plugin file API |
| Edit file | `Edit` / `Write` | `Edit` / `Write` / `MultiEdit` | `StrReplace` / `Write` | `edit` tool |
| Run command | `Shell` | `Bash` | `Shell` | terminal tool |
| Delegate worker | `Task` / agent config | `Task` subagent | `Task` subagent | plugin agent |
| Load skill | skill discovery / `@skill` | `Skill` tool | skill discovery | `config` skills path |
| Ask user | host question UI | `AskUserQuestion` | chat | plugin prompt |

When a skill says "run the smallest real experiment", pick the host's command
tool — do not hard-code `Bash` in shared skill text.

## Install Surfaces

| Host | Install entry | Skills path | Hooks path |
|---|---|---|---|
| Codex | `do-it setup`, marketplace | `~/.codex/skills/` or project | `~/.codex/hooks/` + `codex-hooks.json` |
| Claude | plugin manifest | `${CLAUDE_PLUGIN_ROOT}/skills/` | `${CLAUDE_PLUGIN_ROOT}/hooks/hooks.json` |
| Cursor | marketplace plugin | plugin `skills/` | plugin `hooks/hooks.json` |
| OpenCode | `opencode.json` plugin | plugin `skills/` | TS plugin events |

Authoritative install list: `manifest.json`. Doctor: `install/doctor.sh`.

## Truth Planes (live hosts)

Verification and subagent prompts name the plane evidence came from:

| Plane | Proves |
|---|---|
| `source-repo` | Files and commands in the checkout |
| `task-worktree` | Isolated worktree for a slice |
| `integration-worktree` | Merged integration branch |
| `temp-install` | Package install under temp home |
| `live-codex` | Codex host behavior (hooks, marketplace, CLI) |
| `live-claude` | Claude Code plugin runtime |
| `live-cursor` | Cursor plugin + IDE hook surface |
| `live-opencode` | OpenCode plugin + transform/bootstrap |
| `package-artifact` | Built tarball / npm pack output |
| `host-behavior` | Generic host UX when host-specific plane not needed |
| `external-blocked` | Network/credentials block |

Evidence from one plane does not prove another.

## Per-Host Detail

- [`host-codex.md`](host-codex.md)
- [`host-claude.md`](host-claude.md)
- [`host-cursor.md`](host-cursor.md)
- [`host-opencode.md`](host-opencode.md)
