# Harness Adapter Matrix

All hosts discover professional skills directly. Task groups organize the index;
they do not classify tasks or select workflows.

| Host | Context | Deterministic edit checks | Specialist integration |
| --- | --- | --- | --- |
| Claude Code | UserPromptSubmit | PostToolUse | Generated Markdown agents |
| Codex | UserPromptSubmit | PostToolUse | Portable TOML agents |
| Cursor | sessionStart, beforeSubmitPrompt | postToolUse via run-hook.cmd | Generated agents |
| OpenCode | chat.message | tool.execute.after | Preserves user agent registrations |
| Pi | before_agent_start | root tool_result | Optional pi-subagents; child stance only |
| Kimi Code | sessionStart, UserPromptSubmit | PostToolUse | Native built-in agents |

Hook payloads and responses follow the host protocol. Advisory hooks fail open
on malformed input or unavailable tooling. Native permissions enforce configured
access and side effects; hooks do not infer user authorization from prose.
The optional Claude strict external-action profile retains precise configured
operation checks. No URL-content policing hook is installed.

There is no completion scan, forced review, automatic task-pointer recovery,
lexical classification, or custom adaptive personalization. Session state only
supports compact-context deduplication and edit-check bookkeeping. Without a
host data directory, session bookkeeping uses a temporary directory rather than
creating a project .do-it scaffold.

Evidence collection defaults off. Pi/OpenCode invoke evidence-observer only when
DO_IT_EVIDENCE_MODE=observe. Native hook hosts can explicitly register or invoke
the packaged observer with that setting and host JSON input. The observer's
filesystem, redaction, and malformed-input protections remain tested; records
never establish task acceptance automatically.

See [installation](./install.md), [migration](./simplification-migration.md),
and [strict external actions](./strict-external-actions.md).
