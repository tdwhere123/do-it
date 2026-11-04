# Pi

```text
pi install npm:@tdwhere/do-it-pi
```

The extension and skills work without a subagent runtime. The locked development
host is Pi 1.5.0; the package requires Node 22.19 or newer. The primary runtime
is `@tintinweb/pi-subagents` (0.23.0 was probed). It discovers the current
package agents by their literal bare names, such as `code-mapper`. The separate
`pi-subagents` compatibility runtime qualifies these agents as `do-it.*`; version
0.35.1 has a discovery test, not a complete Pi 1.5 lifecycle proof. Both read the
same package declaration, so do not assume they use the same agent metadata.

`/do-it-status` reports adapter state and `Agent` or `subagent` tool registration,
not proof of package-agent discovery. Inspect the active runtime's actual role
list and source; user and project roles can override package roles. Local
installation uses `npm run install:pi-global`. `pi update` updates Pi itself;
`pi update --extensions` reconciles packages. Pinned sources remain pinned.

## Runtime

before_agent_start delivers root context or child stance; root tool_result checks edits.
The adapter recognizes `PI_SUBAGENT_CHILD=1`; for in-process children it also
checks the runtime manager, parent-session lineage, and absence of either
delegation tool together. An ordinary fork or shared manager alone is not a
child marker. The child branch selects stance and skips root edit and
diagnostic hooks. With Pi 1.5.0 and Tintinweb 0.23.0, a local fake-provider probe
confirmed this for a persisted, non-nested child. It also confirmed that an
in-memory child and a child with nested `Agent` access are misidentified as
roots: their stance is missing and root hooks can run. A nested in-memory child
has the same limitation. These cases remain unsupported pending a reliable
runtime child-identity seam. Tintinweb's replacement prompt also suppresses
project context files; supply required project constraints in the delegation.
Shutdown cancels hooks belonging to that extension instance, not hooks owned by
other in-process sessions.
The default path has no task classifier, completion-language scan, profile
injection, or automatic task selection. The router skill is a compatibility
alias only. Choose useful skills directly from descriptions.

Independent specialists gather evidence and form conclusions in scoped contexts.
Keep read-only and write ownership restrictions explicit; the parent integrates
and verifies. Generated agents derive their bodies from `agents/*.toml`;
`scripts/lib/pi-agent-adapter.mjs` adds Pi metadata and coordination. The
extension TypeScript remains maintained source. Reader roles retain Bash, so
tool lists and read-only instructions are not an OS sandbox. Other loaded
extensions can also provide tools; do not assume these lists prevent mutation.

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
