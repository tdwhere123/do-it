# Harness Adapter Matrix

do-it ships one **workflow kernel** (skills, hooks, agents) and four **host
adapters** that map the same advisory signals to each runtime's hook surface. Adapters are
honest about capability gaps — we do not copy the full Claude hook stack onto
every host.

## Four Platforms

| Platform | Distribution | Hook depth | Notes |
|---|---|---|---|
| **Codex** | marketplace-first; `do-it setup` optional/legacy | Full | Trust plugin hooks under `/hooks`; session state via plugin data or `CODEX_HOME/do-it-data` |
| **Claude Code** | marketplace-first | Full | `${CLAUDE_PLUGIN_ROOT}` hooks; `${CLAUDE_PLUGIN_DATA}` session state |
| **Cursor** | local / Team Import today; public listing pending | Medium | Official [marketplace](https://cursor.com/marketplace) exists; **do-it not listed yet**. No Claude `/plugin` commands. |
| **OpenCode** | global vendor / package-name registration today; npm publication pending | Medium | TS plugin: transform bootstrap; `tool.execute.after`; `session.idle` soft reminder |

Workflow logic lives once in `skills/do-it/` and `hooks/`. Host-specific install
paths, tool names, and hook event names live in
[`skills/do-it/references/host-vocabulary.md`](../skills/do-it/references/host-vocabulary.md)
and the per-host sheets below.

## Routing Tiers

Hooks and skills share three routing tiers. Tier is an advisory input; boolean
dimensions (`dim_*`) narrow intensity without changing it. Direct user intent
and model judgment take precedence over router labels.

| Tier | Router output | write-quality-lint | grill-prompt | Completion reminder |
|---|---|---|---|---|
| **Light** | state-only, quiet | skipped | skipped | advisory only when relevant |
| **Standard** | state + compact advisory stance | when `dim_touches_code=1` or ≥5 added lines | skipped (Heavy-only) | advisory only when relevant |
| **Heavy** | state-only | always (advisory) | full grill body when warranted | advisory only when relevant |

Subagent contexts skip write-quality-lint (parent owns integration).
`grill-pretool` is removed on all hosts.

## Hook Mapping

| Signal | Script | Codex / Claude | Cursor | OpenCode |
|---|---|---|---|---|
| Opt-in feedback capture | `behavior-feedback.sh` | `UserPromptSubmit` plus narrow `UserPromptExpansion`, silent and default off | `beforeSubmitPrompt`, silent and default off | `chat.message`, silent and default off; only a confirmed root session is eligible |
| Classify prompt | `router.sh` | `UserPromptSubmit` | `beforeSubmitPrompt` | `chat.message` |
| Grill nudge (Heavy) | `grill-prompt.sh` | `UserPromptSubmit` | `beforeSubmitPrompt` | `chat.message` (Heavy/explicit, advisory) |
| Subagent stance | `subagent-stance.sh` | `UserPromptSubmit` | `beforeSubmitPrompt` | bootstrap guidance only |
| Write-time quality | `write-quality-lint.sh` | `PostToolUse` (Edit\|Write\|MultiEdit\|NotebookEdit) | `postToolUse` / `afterFileEdit` | `tool.execute.after` (bash bridge) |
| Done claim | `verification-gate.sh` | `Stop` | `stop` | `session.idle` soft reminder from serialized host messages |

Legacy `comments-lint.sh` and `anti-patterns-lint.sh` exec into
`write-quality-lint.sh`; new installs register only the merged script.

## Authorization Enforcement

No current do-it hook is a universal permission veto. The router, grill,
subagent stance, quality lint, and verification gate are workflow guidance;
they must not be described as hard confirmation.

- In Codex, a plugin hook can add context but cannot veto a `PreToolUse` or
  `PermissionRequest` call. Use the host's sandbox, approval policy, and
  command rules for a hard boundary; `--yolo` / bypass modes deliberately
  remove that protection. See the [Codex hooks](https://learn.chatgpt.com/docs/hooks)
  and [approval guidance](https://learn.chatgpt.com/docs/agent-approvals-security).
- Claude Code has a default-off, narrow `PreToolUse` profile for named remote
  publication and infrastructure-apply commands. `DO_IT_STRICT_EXTERNAL_ACTIONS=ask`
  requests a true host confirmation; `deny` stops those named commands. It is
  not a universal network or MCP guard. See
  [`strict-external-actions.md`](strict-external-actions.md).
- Cursor and OpenCode keep the same advisory workflow contract; configure
  their native permissions separately when an operation needs enforcement.

Per-host install paths and tool mapping:
[`host-codex.md`](../skills/do-it/references/host-codex.md),
[`host-claude.md`](../skills/do-it/references/host-claude.md),
[`host-cursor.md`](../skills/do-it/references/host-cursor.md),
[`host-opencode.md`](../skills/do-it/references/host-opencode.md).

## Quality Evidence Ladder

Quality is supported in layers. Higher layers do not replace lower ones — they
add context when cheaper checks cannot prove a claim.

```
L0  write-time hook (advisory)  →  one system-reminder per file per turn; scoped family suppression with a reason (never secrets)
L1  do-it-review                →  Blocking / Important finding; YAGNI + comments lenses respond to L0 families
L2  verification-gate           →  edited completion claims receive an advisory reminder for fresh, claim-specific proof; it does not infer proof from command names
L3  do-it-verify closeout       →  claim-specific evidence rollup; `NOT_VERIFIED` and residual risk stay visible
```

| Layer | Owner | Blocks write? | Blocks done claim? |
|---|---|---|---|
| L0 `write-quality-lint` | hook | No | No |
| L1 `do-it-review` | skill / subagent | No | No — unresolved findings shape the final claim |
| L2 `verification-gate` | hook | No | No — advisory reminder only |
| L3 `do-it-verify` | skill | No | Claim wording follows available proof |

Family definitions and suppress syntax:
[`skills/do-it/references/write-quality-families.md`](../skills/do-it/references/write-quality-families.md).

## Hook Token Budget

UserPromptSubmit (and Cursor `beforeSubmitPrompt`) injection is the main
recurring token cost. Targets after simplification:

| Component | Standard turn target | When skipped |
|---|---|---|
| `behavior-feedback.sh` | 0 tokens; no stdout/context | disabled by default; ordinary prompts and unverified child sessions |
| `router.sh` | one compact advisory line on Standard | Light and Heavy |
| `grill-prompt.sh` | 0 unless Heavy or explicit | Light; Standard without an explicit grill |
| `subagent-stance.sh` | one compact line once per subagent session | parent context and later child turns |
| **Combined Standard implementation turn** | **only task-relevant advisory context** | no fixed workflow injection |

PostToolUse quality reminders:

- At most **one** `system-reminder` per `session_id` + `file_path` + user turn
  (dedup in session state).
- Reminder lists matched family IDs only; full regex detail lives in
  `write-quality-families.md` (L3 progressive disclosure).
- Light tier: hook does not run — zero post-edit injection.

Bundled agents are optional capability experts. The parent gives a delegated
slice its goal and any needed ownership or side-effect boundary; workers inspect
independently, return useful evidence or uncertainty, and the parent integrates.
There is no fixed delegation contract, agent count, or role matrix.

## Session State Resolution

Hooks resolve per-session state through the search order documented in
`hooks/lib/common.sh`:

1. `$CURSOR_PLUGIN_DATA/sessions`
2. `$CLAUDE_PLUGIN_DATA/sessions`
3. `$DO_IT_HOOK_DATA/sessions`
4. `$OPENCODE_DATA/sessions`
5. `$CODEX_HOME/do-it-data/sessions`
6. `<repo>/.do-it/runtime/sessions`
7. `${TMPDIR}/do-it-sessions`

Missing state degrades to minimal advisory behavior — hooks never block on
absence.

State is keyed only by the host-supplied session ID. A child assigned a
different session ID does not automatically inherit a parent's no-write
boundary; an adapter must pass or verify that relationship explicitly before
claiming cross-session inheritance.

## Related Docs

- Public routing policy: [`routing-matrix.md`](routing-matrix.md)
- Shared references: [`skills/do-it/references/`](../skills/do-it/references/)
- Hook sources: [`hooks/`](../hooks/)
