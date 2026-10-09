# Codex

```text
codex plugin marketplace add tdwhere123/do-it
codex plugin add do-it@tdwhere-do-it
```

Inspect and trust configured plugin hooks in `/hooks`; verify live execution
separately. Native sandbox and approval settings remain authoritative.

The bundle uses `plugins/do-it/.codex-plugin/plugin.json`. An isolated native
Codex 0.162.0 `plugin/read` comparison found zero hooks with root `plugin.json`
and found hooks with the Codex manifest. The final repository bundle returned
twelve skills and three hook declarations with Skills/Hooks capabilities.
The builder removes the root manifest
and plugin `agents/` directory; specialists use the separate native path below.

Plugin skills/hooks and native specialist roles have separate installation
paths. Codex loads `.codex/agents` or explicit configured roles, not the plugin
`agents` field. From a checkout, use
`node bin/do-it.mjs setup --target=codex --only=agents` and
`node bin/do-it.mjs doctor --target=codex --only=agents`. `CODEX_HOME` selects
the target home. File parity does not prove live role discovery or sandboxing.

## Runtime

The generated hook configuration maps UserPromptSubmit to context/child stance
and PostToolUse to edit checks through `codex-post-tool.sh`, including native
`apply_patch` file targets. Schema validation and native plugin skill
discovery are not live hook-execution evidence.
The default path has no task classifier, completion-language scan, profile
injection, or automatic task selection. The router skill is a compatibility
alias only. Choose useful skills directly from descriptions.

Independent specialists gather evidence and form conclusions in scoped contexts.
Keep read-only and write ownership restrictions explicit; the parent integrates
and verifies. Host permissions enforce configured access and side effects.

## Diagnostics and migration

Diagnostics default off. For Pi, set `DO_IT_EVIDENCE_MODE=observe` in the
host environment. Other hosts can explicitly register `evidence-observer.sh` on
the desired tool-result event with that setting, or invoke it manually with a
host-shaped JSON payload on stdin. Cursor uses `run-hook.cmd evidence-observer`.
These records are observations, not proof of task acceptance.

Existing profiles, memory, task notes, and runtime pointers remain untouched.
Custom adaptive personalization is retired. Native host instructions or memory
own preferences. See [migration](https://github.com/tdwhere123/do-it/blob/main/docs/simplification-migration.md) and
[installation details](https://github.com/tdwhere123/do-it/blob/main/docs/install.md).
