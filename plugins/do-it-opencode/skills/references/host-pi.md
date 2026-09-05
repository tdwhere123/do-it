# Pi

```text
pi install npm:@tdwhere/do-it-pi
```

The extension requires the supported Pi/Node versions declared in package.json.
Optional pi-subagents provides discovery of the portable do-it.* package agents;
the extension and skills work without it. `/do-it-status` reports adapter state
and tool registration, not proof of package-agent discovery. Local installation
uses `npm run install:pi-global`.

## Runtime

before_agent_start delivers root context or child stance; root tool_result checks edits.
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
