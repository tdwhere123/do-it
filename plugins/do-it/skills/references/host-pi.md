# Pi

```text
pi install npm:@tdwhere/do-it-pi
```

The extension and skills work without a subagent runtime. The locked development
host is Pi 1.5.0; the SDK peer policy is `~1.5.0`, not evidence for other patch
versions. The package requires Node 22.19 or newer. The primary runtime
is `@tintinweb/pi-subagents`. Correct in-process child routing currently requires
the **local source patch** documented in `docs/release-evidence/pi-child-identity-boundaries.md`
in the do-it source checkout, not the published, unpatched 0.23.0 package.
This patch is not published and no live installation is changed by the
repository tests.

Tintinweb currently discovers package agents by their literal bare names, such
as `code-mapper`. The separate `pi-subagents` compatibility runtime qualifies
these agents as `do-it.*`. Its optional peer and development dependency are
pinned to **0.35.1**. Native Pi 1.5.0 tests on Linux with a simulated provider
verify package discovery, project-instruction inheritance, child stance without
root hooks, preserved results, and cancellation after a child-readiness handshake
with PID death and parent survival. See `tests/pi/nicobailon-native.md` in the
source checkout. Windows lifecycle and 0.84.0 are **NOT_VERIFIED**. A prose-only
child result can still be rejected by nicobailon's attested acceptance overlay.

The runtimes read the same package declaration but interpret metadata differently.
The shared projection names each runtime explicitly; it does not imply automatic
runtime selection or filesystem isolation. Do not load both runtimes expecting
automatic selection.

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
checks edits. A per-invocation Pi hook role carries that decision through the shell
boundary: a root transcript under `/agents/` is still root. Other hosts retain
their existing heuristics. Child stance comes from the unchanged shared semantic
contract in `subagent-stance.sh`; Pi deduplicates against a stance actually stored
in the active SDK session projection, not a pre-output shell flag. Timeout or
lost output therefore permits retry on resume. Child tool results skip root lint
and diagnostic hooks.

Owned reminders carry role metadata. The model-context projection omits reminders
for the other role on reopen/fork, including anchored historical `customType:
"do-it"` reminders without metadata. Raw transcript entries and user content are
not deleted or rewritten. Saved child transcripts opened as roots and children
resumed from a forked parent are covered by native tests.
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
runtime package source; do not load patched and unpatched copies together. **Migration is paired:** replacing or
reloading a live-linked do-it checkout is operationally an installation change.
Do not deploy this adapter alone to an unpatched Tintinweb installation. A paired
runtime/adapter migration requires explicit authorization; the isolated tests do
not authorize or perform it.

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
