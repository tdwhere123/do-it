# Harness Adapter Matrix

All hosts discover professional skills directly. Task groups organize the index;
they do not classify tasks or select workflows.

| Host | Context | Deterministic edit checks | Specialist integration |
| --- | --- | --- | --- |
| Claude Code | UserPromptSubmit | PostToolUse | Generated Markdown; eight reader roles deny Edit/Write/NotebookEdit |
| Codex | UserPromptSubmit configuration | PostToolUse configuration; live execution unverified | Separately installed native `.codex/agents` TOML roles |
| Cursor | sessionStart, beforeSubmitPrompt | postToolUse via run-hook.cmd | Canonical TOML rendered with native readonly for reader roles |
| Pi | before_agent_start | root tool_result | Optional runtime exposing Agent/subagent; persisted child stance isolation verified in a fresh process |
| Grok Build | Core after first completed tool via PostToolUse | PostToolUse supports result context | Generated Markdown agents in the distinct do-it-grok bundle |

Codex 0.162.0 discovers hooks through `.codex-plugin/plugin.json`; the builder
removes root `plugin.json`, which yielded zero hooks in the isolated comparison.
The final repository bundle returned twelve skills and three hook declarations
with Skills/Hooks capabilities. Discovery does not prove execution or named-role
registration. Claude tool
denials and Pi reader tool lists retain Bash and are not filesystem sandboxes.
Cursor projects the native `readonly` field; active permissions need host verification.
A fresh Pi 1.1.0 process verified stance-only context and no root hooks for a
persisted native child running `pwd`; root/fork and edit suppression have lifecycle tests.
See [Grok installation](./install.md#grok-build) for the separate `do-it-grok`
bundle. Its Core context arrives after the first completed tool; no pre-action
bootstrap or tool-free-turn injection is claimed.

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

Evidence collection defaults off. Pi invokes evidence-observer only when
DO_IT_EVIDENCE_MODE=observe. Native hook hosts can explicitly register or invoke
the packaged observer with that setting and host JSON input. The observer's
filesystem, redaction, and malformed-input protections remain tested; records
never establish task acceptance automatically.

See [installation](./install.md), [migration](./simplification-migration.md),
and [strict external actions](./strict-external-actions.md).
