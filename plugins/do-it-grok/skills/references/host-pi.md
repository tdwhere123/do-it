# Pi

```text
pi install npm:@tdwhere/do-it-pi
```

The extension and skills work without a subagent runtime. The locked development
host is Pi 1.5.0; the package requires Node 22.19 or newer. The primary runtime
is `@tintinweb/pi-subagents`. Correct in-process child routing currently requires
the **local source patch** documented in `docs/release-evidence/pi-child-identity.md`
in the do-it source checkout, not the published, unpatched 0.23.0 package.
This patch is not published and no live installation is changed by the
repository tests.

Tintinweb currently discovers package agents by their literal bare names, such
as `code-mapper`. The separate `pi-subagents` compatibility runtime qualifies
these agents as `do-it.*`; version 0.35.1 has a discovery test, not a complete
Pi 1.5 lifecycle proof. The two runtimes read the same package declaration but
interpret metadata differently. Runtime-specific role projection/activation
remains separate work; do not install both expecting automatic selection.

`/do-it-status` reports adapter state, session identity and tool registration,
not proof of package-agent discovery. Inspect the active runtime's actual role
list and source; user and project roles can override package roles. Do not delete
custom/global roles or change fallback configuration just because labels overlap.
Local do-it installation uses `npm run install:pi-global`. `pi update` updates Pi
itself; `pi update --extensions` reconciles packages. Pinned sources remain pinned.

## Runtime identity

After startup, the patched runtime answers `subagents:session-context` on the
current session's `pi.events` bus, synchronously invoking the supplied `reply`
callback with `{ version: 1, runtime: "@tintinweb/pi-subagents", role: "root" | "child" }`.
Its child creator injects the responder into each child's own runtime, including
in-memory, persisted and nested sessions. An ordinary root or fork reports root.
The responder is removed on shutdown; no process-global environment mutation,
prompt scan, manager inspection or tool-availability inference supplies identity.
This is an integration contract among trusted extensions, not a sandbox.

`before_agent_start` delivers root context or child stance; root `tool_result`
checks edits. Child stance comes from the shared `subagent-stance.sh` contract
once per session; child tool results skip root lint and diagnostic hooks.
Provider-free native tests verify persisted and in-memory children, nested
`Agent` access, extension filtering, ordinary forks, and cancellation of one
concurrent child while its sibling continues. Shutdown cancels hooks belonging
to that extension instance, not other in-process sessions. Pi 1.5 structured
tool output survives appended lint advisories.

`PI_SUBAGENT_CHILD=1` remains the separate subprocess identity contract. Without
it or the new runtime response, the session is **unmarked** and uses root hooks;
`/do-it-status` says so. Unpatched Tintinweb 0.23.0 children are therefore
unsupported, including persisted children: the former lineage/tool heuristic
has been removed rather than retained as a second authority. To try the local
patch, review the verification record and deliberately replace only the selected
runtime package source; do not load patched and unpatched copies together.

The default path has no task classifier, completion-language scan, profile
injection, or automatic task selection. Choose useful skills directly from
descriptions. Tintinweb's replacement prompt suppresses project context files;
supply required project constraints explicitly in the delegation.

Independent specialists gather evidence and form conclusions in scoped contexts.
Keep read-only and write ownership restrictions explicit; the parent integrates
and verifies. Generated agents derive their bodies from `agents/*.toml`;
`scripts/lib/pi-agent-adapter.mjs` adds Pi metadata and coordination. The
extension TypeScript remains maintained source. Reader roles retain Bash, and
other loaded extensions can supply tools: these lists and instructions do not
establish filesystem sandbox enforcement.

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
