# Strict External Actions

This is an **opt-in host-permission profile**, not a new default workflow.
Normal do-it installs add no extra friction. The profile exists for work where
named external actions should always receive a fresh human decision.

## Scope and default

The only bundled executable profile is Claude Code's. It is installed but
inert until the parent Claude process starts with:

    DO_IT_STRICT_EXTERNAL_ACTIONS=ask claude

ask (and the ergonomic alias on) asks every time a matching action is attempted.
deny rejects the same actions outright; it is an emergency stop, not a
confirmation dialog.

The current Claude profile covers only these named shell actions:

| Class | Matched action |
|---|---|
| Remote publication | git push; gh pr merge |
| Package publication | npm publish; pnpm publish; yarn npm publish |
| Infrastructure apply | kubectl apply; terraform apply |

It does **not** detect arbitrary curl requests, custom deploy scripts, unknown
MCP/app side effects, or an action hidden behind an unlisted command. The hook
must also be installed, enabled, and trusted by the host. Treat it as a narrow
control, not a universal security boundary.

The Claude registration uses shell form with Bash (rather than directly
executing a `.sh` file), so it follows the same Git-Bash-capable path as the
other bundled shell hooks on Windows. Its `if` rules are only a fast-path: the
script verifies the received Bash command again and stays silent when the
static action label and the input do not agree. That prevents older Claude
versions that ignore `if` from widening the profile to unrelated Bash calls.

Claude's PreToolUse result uses the native ask / deny decision semantics: ask
prompts the user and deny prevents the call. Explicit Claude permission rules
are still evaluated by the host and take precedence where applicable. See the
official [hooks](https://code.claude.com/docs/en/hooks) and
[permissions](https://code.claude.com/docs/en/permissions) references.

## Other hosts

No other do-it adapter claims the same interception.

| Host | Real boundary | How to opt in |
|---|---|---|
| Codex | Host sandbox and approval policy | Keep workspace-write with network disabled unless needed; use --ask-for-approval on-request (or the corresponding config/UI setting) for a fresh host approval when an action leaves that boundary. |
| Cursor | Native Agent security / Auto-Run and sandbox settings | Configure it in the active Cursor host; do-it does not register an experimental shell veto. |
| OpenCode | Native permission rules | Merge explicit bash ask rules into your own opencode.json; do-it's template stays unchanged. |

Codex's official [approvals and sandboxing guidance](https://learn.chatgpt.com/docs/agent-approvals-security)
describes the workspace and network boundary. --yolo, full-access modes, or
disabled/untrusted hooks deliberately weaken host safeguards; no plugin can
truthfully promise to override them.

For OpenCode, merge rather than replace your current permissions. Its rules are
evaluated in order with the last matching entry winning:

    {
      "permission": {
        "bash": {
          "git push *": "ask",
          "gh pr merge *": "ask",
          "npm publish *": "ask",
          "pnpm publish *": "ask",
          "yarn npm publish *": "ask",
          "kubectl apply *": "ask",
          "terraform apply *": "ask"
        }
      }
    }

See [OpenCode permissions](https://opencode.ai/docs/permissions) for the
host's full matching and approval behavior.
