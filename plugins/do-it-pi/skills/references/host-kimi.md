# Kimi Code

```text
/plugins install https://github.com/tdwhere123/do-it
```

Kimi reads kimi.plugin.json, skills, and the three commands. The portable custom
agent bundle is not installed: Kimi uses its native built-in agent mechanism.
Kimi context output is plain text; other native hook hosts use their JSON shape.

## Runtime

sessionStart and UserPromptSubmit deliver context; PostToolUse checks edits.
The default path has no task classifier, completion-language scan, profile
injection, or automatic task selection. The router skill is a compatibility
alias only. Choose useful skills directly from descriptions.

Independent specialists gather evidence and form conclusions in scoped contexts.
Keep read-only and write ownership restrictions explicit; the parent integrates
and verifies. Host permissions enforce configured access and side effects.

## Diagnostics and migration

Diagnostics default off. For Pi/OpenCode, set `DO_IT_EVIDENCE_MODE=observe` in the
host environment. Other hosts can explicitly register `evidence-observer.sh` on
the desired tool-result event with that setting, or invoke it manually with a
host-shaped JSON payload on stdin. Cursor uses `run-hook.cmd evidence-observer`.
These records are observations, not proof of task acceptance.

Existing profiles, memory, task notes, and runtime pointers remain untouched.
Custom adaptive personalization is retired. Native host instructions or memory
own preferences. See [migration](https://github.com/tdwhere123/do-it/blob/main/docs/simplification-migration.md) and
[installation details](https://github.com/tdwhere123/do-it/blob/main/docs/install.md).
