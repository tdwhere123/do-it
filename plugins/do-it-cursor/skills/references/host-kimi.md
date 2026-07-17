# Host Adapter: Kimi Code

Near-full hook depth via the repository-root `kimi.plugin.json` — the do-it
checkout itself is the plugin. No build step, no generated bundle: the manifest
points straight at `./skills/do-it/`, `./commands/`, and `./hooks/`.

## Install (plugin-first)

From GitHub (any of the four URL forms; this pins the default branch):

```text
/plugins install https://github.com/tdwhere123/do-it
```

For a local checkout (development / dogfooding):

```text
/plugins install /path/to/do-it
```

Then `/reload` or start a new session. Installs land in
`$KIMI_CODE_HOME/plugins/managed/do-it/` and run from that managed copy —
editing the source checkout after install has no effect until you reinstall.
Plugins are per-user (no project-level scope yet). Installing never executes
the hooks; they only fire on their events while the plugin is enabled.

## What Ships

- **9 skills** via `skills: "./skills/do-it/"` (same SKILL.md format; the
  shared `references/` payload travels inside the plugin root, so relative
  links keep working).
- **3 commands** via `commands: "./commands/"` — `/do-it:skip`,
  `/do-it:handbook`, `/do-it:retrospective`. Claude-only frontmatter fields
  (e.g. `allowed-tools`) are silently ignored by Kimi.
- **5 manifest hooks** (below). Hook commands run via `sh -c` with cwd = plugin
  root and receive exactly two extra env vars: `KIMI_CODE_HOME`,
  `KIMI_PLUGIN_ROOT`.
- **No agents.** Kimi Code has no custom-subagent mechanism (built-in
  `coder` / `explore` / `plan` only), so do-it's 10 portable agents are not
  installed on this host. Delegate to the built-ins and keep the same parent
  contract: goal, boundary, evidence back.

## Hook Depth

**Full-minus-subagent**:

| Kimi event | Kernel script | Notes |
|---|---|---|
| `UserPromptSubmit` | `router.sh` | advisory tier + DIM signals |
| `UserPromptSubmit` | `grill-prompt.sh` | Heavy or explicit only |
| `UserPromptSubmit` | `behavior-feedback.sh` | silent, default off |
| `PostToolUse` (matcher `Edit\|Write`) | `write-quality-lint.sh` | Kimi's only edit tools are `Edit` and `Write` — no `MultiEdit`/`StrReplace` |
| `Stop` | `verification-gate.sh` | advisory reminder; transcript via wire file (below) |

Deliberately not wired: `subagent-stance.sh`. Kimi's `SubagentStart` /
`SubagentStop` payloads ship an empty `session_id` and the CLI bootstrap cwd
(observed in kimi-code source, 0.26.0 — likely an upstream bug), so
session-keyed stance state would be unreliable. Revisit if upstream fixes the
payload.

## Protocol Notes (verified against kimi-code source + live smoke, 0.26.0)

- stdin base payload: `hook_event_name`, `session_id`, `cwd` plus event fields;
  all snake_case.
- `UserPromptSubmit.prompt` is a **ContentPart array**
  (`[{"type":"text","text":"…"}]`), not a string — extract with
  `[.prompt[]?.text] | join("\n")`.
- stdout on exit 0: `{"message":"…"}` or plain text is appended to context,
  wrapped as `<hook_result hook_event="…">…</hook_result>`.
  `hookSpecificOutput` honors only `message`, `permissionDecision`,
  `permissionDecisionReason` — **`additionalContext` is not parsed**. Under
  Kimi, `hooks/lib/common.sh` emits plain text instead of the Claude JSON
  envelope.
- Exit 2 blocks (stderr = reason); any other non-zero exit or timeout fails
  open. Only `UserPromptSubmit`, `PreToolUse`, `Stop` can block; do-it hooks
  stay advisory and always exit 0.
- `Stop` payload is only `{stop_hook_active}` — there is no `transcript_path`
  anywhere in Kimi's protocol. `verification-gate.sh` locates the session
  transcript at `$KIMI_CODE_HOME/sessions/*/<session_id>/agents/main/wire.jsonl`.
- `SessionStart` carries `source: "startup" | "resume"`.
- Matchers are unanchored JS regexes over the tool name (`PreToolUse` /
  `PostToolUse`) or submitted text (`UserPromptSubmit`).

## Session State

`$KIMI_CODE_HOME/do-it-data/sessions` (never `KIMI_PLUGIN_ROOT` — the managed
copy is read-only semantics). Full resolution order: `hooks/lib/common.sh`
(`do_it_session_dir`).

## Truth Plane

Use `live-kimi` when evidence depends on plugin install, manifest hook firing,
or Kimi tool events — not repo-only proof.

## Limitations

- No custom subagents — see What Ships.
- Per-user install only; no project scope.
- Hook scripts require `sh`; native Windows without a POSIX shell is
  unsupported (same posture as Codex / OpenCode adapters).
