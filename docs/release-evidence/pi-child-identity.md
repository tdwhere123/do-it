# Pi 1.5 primary-runtime child identity

This is **local, provider-free verification**, not a published runtime release or
proof that a user's installed package has changed. No live Pi installation,
settings, global roles, credentials, or fallback configuration were modified.
No remote push, publication, or network-backed model request was made.

## Reproducible artifacts

- Do-it starting point: `296e4bd` (8 canonical roles, updated shared child stance).
- Native host: the do-it Pi package's locked **Pi 1.5.0** SDK.
- Primary runtime base: Tintinweb **0.23.0**, commit
  `a60247c47f8b0a17bfe7208f9e248e464eda05f0`. Its entire `src/` tree matches
  the installed 0.23.0 source (`diff -qr`, read-only comparison).
- Upstream patch: `7a48987717c469f1f16202b9c8753a88bc862076` in the separate
  `/home/tdwhere/vibe/pi-subagents-child-identity` repository, branch
  `fix/public-child-session-identity`.
- Portable [upstream patch](pi-child-identity/0001-fix-runtime-expose-session-scoped-child-identity.patch.gz)
  (gzip-compressed `git format-patch`, preserving its original whitespace).
- Committed executable probe: `tests/pi/native-primary.test.mjs` and
  `tests/pi/fixtures/primary-{probe,observer}.mjs`.
- The JSON files in [pi-child-identity/](pi-child-identity/) retain actual session
  identity responses, tool results, hook counters, native discovery metadata,
  shutdown events, cancellation observations, request counts, and source/fixture hashes.
  Temporary project paths are historical identifiers; fixture projects are
  removed after each run. Evidence snapshots are not future role inventory rules.

To reproduce, prepare two independent source checkouts of the runtime at the
base commit. Decompress the committed patch into `git am` in one checkout
(`gzip -dc /path/to/0001-fix-runtime-expose-session-scoped-child-identity.patch.gz | git am`),
then run `npm ci --ignore-scripts` in each. Do not use or modify the live `~/.pi` package.
In a do-it checkout with its Pi development dependencies installed:

```bash
npm run test-pi
DO_IT_TINTINWEB_SOURCE=/absolute/path/to/patched-runtime \
DO_IT_TINTINWEB_BASELINE=/absolute/path/to/unpatched-0.23.0 \
DO_IT_PI_EVIDENCE_DIR=/absolute/path/to/new-evidence \
node --test tests/pi/native-primary.test.mjs
```

The native tests skip explicitly if the corresponding source path is absent;
a normal `npm run test-pi` alone is not native-runtime acceptance. The probe uses
Pi's actual resource loader, native `Agent` tool, SDK sessions and fake model
provider. Fake responses invoke real file/Bash tools and real shell hooks in
isolated temporary projects. Network fetch is denied and model-network access
is disabled. Child identity is never supplied by the probe or inferred from
its labels. The canonical writer and role catalog are derived from `agents/*.toml`.

## Results and contract

The native suite passes **7/7**, including the explicit unpatched comparison:

| Case | Retained result |
| --- | --- |
| Persisted child | [persisted.json](pi-child-identity/persisted.json): creator says child; stance once; no root Core, lint, or evidence observer |
| In-memory child | [memory.json](pi-child-identity/memory.json): no session file; same child routing |
| Nested delegation | [nested.json](pi-child-identity/nested.json): the child exposes `Agent`; it and its in-memory descendant remain children |
| Ordinary fork | [fork.json](pi-child-identity/fork.json): a nonempty `parentSession` remains root; Core and write-quality hooks run |
| Concurrent cancellation | [concurrent.json](pi-child-identity/concurrent.json): real runtime stop cancels one child's barrier; its sibling completes Bash; identities remain isolated |
| Filtered extensions | [filtered.json](pi-child-identity/filtered.json): runtime identity survives a child extension allowlist |
| Unpatched 0.23.0 | [unpatched-persisted.json](pi-child-identity/unpatched-persisted.json): no response; root hooks run; unsupported, not falsely classified |

Every created session emits native shutdown once. No in-process child sets
`PI_SUBAGENT_CHILD` globally. Each patched child has exactly one stance dispatch,
and no root hook counters after actual writes/Bash execution. Consumer unit tests
also cover malformed/version-mismatched responses and the separate subprocess
marker. Existing real-shell owner-isolation and native structured-output tests
remain in the Pi suite. Removing the patch by pointing the patched probe at the
baseline produces exit 1 on the missing identity assertion (negative control).

The public event is `subagents:session-context`. A synchronous `reply` after
`session_start` receives a frozen `{ version: 1, runtime:
"@tintinweb/pi-subagents", role: "root" | "child" }` value. The creator injects
child identity; root registration happens only in the manager's root context.
Shutdown removes that session's responder. This is live execution identity,
not ancestry or a permission boundary. The marker is not a possible extension
tool provider and does not bypass the runtime's zero-tools refusal.

The do-it consumer accepts only that version/runtime/role shape, or the separate
`PI_SUBAGENT_CHILD=1` subprocess marker. No reply means **unmarked**, with root
hooks and an explicit `/do-it-status` warning. The old private-manager,
parent-session and missing-tool heuristic is removed. Thus unpatched 0.23.0
children, even persisted ones, are not supported by this new adapter.

Upstream checks: `npm run lint`, `npm run typecheck`,
`npm run test -- --maxWorkers=2` (**2,522 passed, 7 skipped, 123 files**) and
`npm run build` passed. The first full run exposed a zero-tools refusal regression
caused by counting the new marker as a possible tool provider; the creator's
existing gate was corrected and the full suite rerun successfully. These upstream
tests use the runtime's locked Pi 1.1 dependencies; the independent native probe
above is the Pi **1.5.0** integration evidence.

Do-it validation after rebasing onto `296e4bd`:

- With both runtime source variables set as above, `npm run test-pi` passed
  **49/49**, zero skips, including the 7 native cases and structured-output test.
- Without those optional sources, the same suite passed 42 tests and explicitly
  skipped the 7 native cases; that is not a substitute for the native run.
- `npm run prepack`, `npm run check:skill-links`, `npm run validate:legacy-names`,
  `npm run smoke:pi-package`, and `git diff --check` passed. Package smoke proves
  standalone loading with no subagent runtime installed, not delegated execution.
- After rebasing onto `fdcdc0b`, the same source-enabled `npm run test-pi`
  passed **49/49** again, and `npm run smoke:pi-package` passed for the source
  **0.19.0** package. `npm run check:skill-links` and `git diff --check` also
  passed. Historical JSON snapshots above were preserved, not overwritten.
- Full repository `npm test` was not run for this scoped slice.

The cancellation fixture distinguishes a context event from a model request:
Pi can prepare one final context before observing the child's aborted signal.
Only actual faux-provider calls are counted as requests. The cancelled tool's
error is expected; other tool errors fail the probe.

## Boundaries and remaining work

- The patch has not been submitted upstream or published. A local checkout still
  reports package version 0.23.0; the capability/source hash, not semver alone,
  distinguishes the patched implementation. Published unpatched 0.23.0 remains
  unsupported for child routing. Installation instructions require deliberately
  selecting the reviewed source, not loading two copies of the runtime.
- Native discovery exposes do-it's current canonical roles under **bare names**.
  The shared package projection has not been split into independently activated
  runtime adapters. Naming, prompt and metadata semantics differ from nicobailon.
- `pi-subagents` 0.35.1 package discovery remains tested; Pi 1.5 native lifecycle
  for that runtime, including its current 0.84.0 release, is **NOT_VERIFIED**.
  Its existing optional peer range is not evidence for every version in it.
- Role tool lists, Bash access, allowed-extension metadata and this trusted
  identity event are not filesystem sandbox enforcement. Tintinweb replacement
  prompts do not inherit project instruction files; delegate required constraints.
- Retained/resumed children and reopening a saved child transcript as an ordinary
  root were not separate native cases in this run. Creator injection and lifecycle
  unit coverage support the intended live-role contract; do not present those
  unexecuted flows as additional native evidence.
