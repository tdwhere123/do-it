# Claude Code

```text
/plugin marketplace add tdwhere123/do-it
/plugin install do-it@do-it
```

Claude loads hooks/hooks.json from the plugin. The strict external-action profile
is optional; see [strict actions](../../../docs/strict-external-actions.md).

## Runtime

UserPromptSubmit delivers context and child stance; PostToolUse checks edits.
The default path has no task classifier, completion-language scan, profile
injection, or automatic task selection. There is no router compatibility alias.
Choose useful skills directly from descriptions.

Independent specialists gather evidence and form conclusions in scoped contexts.
Keep read-only and write ownership restrictions explicit; the parent integrates
and verifies. Canonical `sandbox_mode` is read-only for six roles and
workspace-write for `documentation-engineer` and `test-engineer`. Generated
Markdown maps the read-only roles to `disallowedTools: Edit, Write,
NotebookEdit`. Bash remains available; these denials are not a filesystem
sandbox. Verify active host permissions separately.

## Diagnostics and migration

Diagnostics default off. For Pi, set `DO_IT_EVIDENCE_MODE=observe` in the
host environment. Other hosts can explicitly register `evidence-observer.sh` on
the desired tool-result event with that setting, or invoke it manually with a
host-shaped JSON payload on stdin. Cursor uses `run-hook.cmd evidence-observer`.
These records are observations, not proof of task acceptance.

Existing profiles, memory, task notes, and runtime pointers remain untouched.
Custom adaptive personalization is retired. Native host instructions or memory
own preferences. See [migration](../../../docs/simplification-migration.md) and
[installation details](../../../docs/install.md).
