# Harness Adapter Matrix

do-it ships one **workflow kernel** (skills, hooks, agents) and four **host
adapters** that map the same gates to each runtime's hook surface. Adapters are
honest about capability gaps — we do not copy the full Claude hook stack onto
every host.

## Four Platforms

| Platform | Distribution | Hook depth | Notes |
|---|---|---|---|
| **Codex** | marketplace-first; `do-it setup` optional/legacy | Full | Trust plugin hooks under `/hooks`; session state via plugin data or `CODEX_HOME/do-it-data` |
| **Claude Code** | marketplace-first | Full | `${CLAUDE_PLUGIN_ROOT}` hooks; `${CLAUDE_PLUGIN_DATA}` session state |
| **Cursor** | local / Team Import today; public listing pending | Medium | Official [marketplace](https://cursor.com/marketplace) exists; **do-it not listed yet**. No Claude `/plugin` commands. |
| **OpenCode** | local `opencode.json` registration today; npm publication pending | Medium | TS plugin: transform bootstrap; `tool.execute.after`; `session.idle` soft reminder |

Workflow logic lives once in `skills/do-it/` and `hooks/`. Host-specific install
paths, tool names, and hook event names live in
[`skills/do-it/references/host-vocabulary.md`](../skills/do-it/references/host-vocabulary.md)
and the per-host sheets below.

## Enforcement Tiers

Hooks and skills share three routing tiers. Tier is the canonical input; boolean
dimensions (`dim_*`) narrow intensity without changing tier.

| Tier | Router output | write-quality-lint | grill-prompt | Hard gates |
|---|---|---|---|---|
| **Light** | state-only, silent | skipped | skipped | stop only when triggered |
| **Standard** | state-only, silent | when `dim_touches_code=1` or ≥5 added lines | skipped (Heavy-only) | stop |
| **Heavy** | state-only, silent | always (advisory) | full grill body when warranted | stop |

Subagent contexts skip write-quality-lint (parent owns integration).
`grill-pretool` is removed on all hosts.

## Hook Mapping

| Gate | Script | Codex / Claude | Cursor | OpenCode |
|---|---|---|---|---|
| Classify prompt | `router.sh` | `UserPromptSubmit` | `beforeSubmitPrompt` | `chat.message` |
| Grill nudge (Heavy) | `grill-prompt.sh` | `UserPromptSubmit` | `beforeSubmitPrompt` | `chat.message` (Heavy/explicit, advisory) |
| Subagent stance | `subagent-stance.sh` | `UserPromptSubmit` | `beforeSubmitPrompt` | bootstrap guidance only |
| Write-time quality | `write-quality-lint.sh` | `PostToolUse` (Edit\|Write\|MultiEdit\|NotebookEdit) | `postToolUse` / `afterFileEdit` | `tool.execute.after` (bash bridge) |
| Done claim | `verification-gate.sh` | `Stop` | `stop` | `session.idle` soft reminder from serialized host messages |

Legacy `comments-lint.sh` and `anti-patterns-lint.sh` exec into
`write-quality-lint.sh`; new installs register only the merged script.

Per-host install paths and tool mapping:
[`host-codex.md`](../skills/do-it/references/host-codex.md),
[`host-claude.md`](../skills/do-it/references/host-claude.md),
[`host-cursor.md`](../skills/do-it/references/host-cursor.md),
[`host-opencode.md`](../skills/do-it/references/host-opencode.md).

## Quality Enforcement Ladder

Quality is enforced in layers. Higher layers do not replace lower ones — they
catch what cheap checks cannot prove.

```
L0  write-time hook (advisory)  →  one system-reminder per file per turn; scoped family suppression with a reason (never secrets)
L1  do-it-review                →  Blocking / Important finding; YAGNI + comments lenses respond to L0 families
L2  verification-gate           →  Codex / Claude / Cursor require paired successful shell evidence (fail closed on forge/missing/failed/stale); OpenCode reminds softly
L3  do-it-verify closeout       →  merge-ready evidence rollup; `NOT_VERIFIED` and residual risk stay visible
```

| Layer | Owner | Blocks write? | Blocks done claim? |
|---|---|---|---|
| L0 `write-quality-lint` | hook | No | No |
| L1 `do-it-review` | skill / subagent | No | No (findings must clear first) |
| L2 `verification-gate` | hook | No | **Paired successful evidence** on Codex / Claude / Cursor (fail closed); soft reminder on OpenCode |
| L3 `do-it-verify` | skill | No | Claim wording follows available proof |

Family definitions and suppress syntax:
[`skills/do-it/references/write-quality-families.md`](../skills/do-it/references/write-quality-families.md).

## Hook Token Budget

UserPromptSubmit (and Cursor `beforeSubmitPrompt`) injection is the main
recurring token cost. Targets after simplification:

| Component | Standard turn target | When skipped |
|---|---|---|
| `router.sh` | 0 visible tokens (state-only) | never — always runs |
| `grill-prompt.sh` | 0 on Standard | Light; Standard (Heavy-only inject); no explicit grill |
| `subagent-stance.sh` | 1 line | subagent context; parent turn without `dim_touches_code` |
| **Combined Standard implementation turn** | **< 150 tokens** injected | excluding user prompt |

PostToolUse quality reminders:

- At most **one** `system-reminder` per `session_id` + `file_path` + user turn
  (dedup in session state).
- Reminder lists matched family IDs only; full regex detail lives in
  `write-quality-families.md` (L3 progressive disclosure).
- Light tier: hook does not run — zero post-edit injection.

The parent prompt must supply every Delegation Contract field: tier/lens,
scope/non-goals, write/restricted paths, facts to verify, proof target, stop,
and return schema. Portable agents return `NEEDS_CONTEXT` before inspection or
edits when fields are missing; a repository-relative link is not a substitute.

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

Missing state degrades to tier-only behavior — hooks never block on absence.

## Related Docs

- Public routing policy: [`routing-matrix.md`](routing-matrix.md)
- Shared references: [`skills/do-it/references/`](../skills/do-it/references/)
- Hook sources: [`hooks/`](../hooks/)
