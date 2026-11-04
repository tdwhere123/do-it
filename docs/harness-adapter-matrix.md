# Harness Adapter Matrix

All hosts discover professional skills directly. Task groups organize the index;
they do not classify tasks or select workflows. Source inventory is
`scripts/skill-tiers.mjs` `ALL_SKILLS` (10 runnable) plus one generated
discovery entry, and `agents/*.toml` (8). Host discovery, native fake-provider
execution, real-model sessions, and effectiveness are separate from that
declaration. `npm run validate:harness-matrix` checks packaged inventories, hook
maps, and versions against those sources; it does not parse this table and does
not prove native execution.

| Host | Context | Deterministic edit checks | Specialist integration |
| --- | --- | --- | --- |
| Claude Code | UserPromptSubmit | PostToolUse | Generated Markdown; read-only roles deny Edit/Write/NotebookEdit |
| Codex | UserPromptSubmit configuration | PostToolUse configuration; live execution unverified | Separately installed native `.codex/agents` TOML roles |
| Cursor | sessionStart, beforeSubmitPrompt | postToolUse via run-hook.cmd | Canonical TOML rendered with native readonly for reader roles |
| Pi | before_agent_start | root tool_result | Optional runtimes; identity from `PI_SUBAGENT_CHILD` or patched Tintinweb `subagents:session-context` |
| Grok Build | Core after first completed tool via PostToolUse | PostToolUse supports result context | Generated Markdown agents in the distinct do-it-grok bundle |

Codex 0.162.0 discovers hooks through `.codex-plugin/plugin.json`; the builder
removes root `plugin.json`, which yielded zero hooks in the isolated comparison.
That historical `plugin/read` also reported twelve skill entries and three hook
declarations with Skills/Hooks capabilities; it is not this checkout's
inventory. Discovery does not prove execution or named-role registration.
Claude tool denials and Pi reader tool lists retain Bash and are not filesystem
sandboxes. Cursor projects the native `readonly` field; active permissions need
host verification. Plugin-native Cursor hook loading versus the user-level
`~/.cursor/hooks.json` mirror is not closed; native actual hook counts are
unverified.

Pi development SDK packages are locked at 1.5.0; peer `~1.5.0` is policy, not
proof of other patches. Unmarked sessions (no subprocess flag and no patched
session-context reply) take root hooks; published Tintinweb 0.23.0 cannot
provide creator identity. The shared projection uses one role body: Tintinweb
bare names, nicobailon `do-it.*`. Linux fake-provider suites live in
`tests/pi/native-primary.test.mjs` and `tests/pi/nicobailon-native.test.mjs`.
Windows and nicobailon 0.84.0 are **NOT_VERIFIED**. Real-model sessions and
paired-task comparisons are not established here. Tintinweb's replacement
prompt does not inherit project instruction files. See
[Pi runtime boundaries](../skills/do-it/references/host-pi.md).

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
