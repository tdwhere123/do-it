# Pi identity: lifecycle boundary review resolution

This follows the [first-pass creator identity record](pi-child-identity.md).
That record and its JSON snapshots remain unchanged historical evidence. This
follow-up closes review batch `b1ec923d-53c4-47f` in the isolated Pi worktree.
It is **not authorization to migrate a live installation**.

## Versions and operational gate

- Integration base: `565f685`, source do-it **0.19.0**. Published **0.18.1** is
  a different artifact; the source package has not been published by this work.
- Host: actual Pi **1.5.0**, Linux, local scripted faux provider only. Network
  fetch and model-network access are disabled; no external model requests.
- Primary runtime: base Tintinweb **0.23.0** with creator patch
  `7a48987717c469f1f16202b9c8753a88bc862076` in
  `/home/tdwhere/vibe/pi-subagents-child-identity`. The upstream API required
  no changes for this review batch. The portable patch remains in the first-pass
  record. Published, unpatched 0.23.0 is **not** equivalent to this source.
- Package peer policy remains SDK `~1.5.0` and optional nicobailon `0.35.1`,
  with the latter development dependency also exact. Only SDK **1.5.0** has
  the native evidence here; the patch range is compatibility policy.

**Migration remains blocked pending explicit authorization or an explicitly
agreed safe boundary.** The user's main source plugin is live-linked. Integrating
and reloading the new adapter there, without the paired runtime patch, would
remove heuristic-based child handling while the installed unpatched runtime
cannot provide identity. Preparing and testing the patch did not authorize that
operational change. No live settings, installation, global role, or fallback was
modified. No remote push or publication occurred. Do not deploy either adapter
commit alone as an implicitly authorized migration.

## Dispositions

| Finding | Resolution and evidence |
| --- | --- |
| Explicit root lost in shell heuristics | The adapter passes an invocation-local `DO_IT_PI_SESSION_ROLE`. `common.sh` honors it only for `DO_IT_EVENT_HOST=pi`, before path/other-host fallbacks. A root session stored under `/agents/` receives Core, write-quality, and evidence hooks: [root-path.json](pi-child-identity-boundaries/root-path.json). Other hosts retain their heuristics. Unmarked adapter sessions still report unmarked and explicitly use the documented root-hook default, not path inference. |
| Stance receipt committed before delivery | Pi no longer uses `subagent_stance_seen` as a receipt. The adapter checks actual owned stance messages in the SDK's active persisted projection, including in-memory sessions. The shell renders the unchanged semantic stance without precommitting a Pi dedupe flag. A real hook output is held in a disposable package copy until the real bridge times out; retained resume delivers once, a second resume does not relaunch it, and a disk-reopened child retains the receipt: [interrupted-resume.json](pi-child-identity-boundaries/interrupted-resume.json). A unit control also discards successful output before persistence, then verifies retry. |
| Saved child reminders remain active in roots | New owned messages have versioned role/kind metadata. The `context` projection omits only owned reminders for the other execution role. Anchored historical `customType: do-it` messages without metadata are recognized; user messages, quoted text, and other extension messages are not scanned away. Saved child reopen and ordinary fork retain their original transcript entries byte-for-byte while omitting modern and legacy child stances from actual faux-provider requests: [reopen-root.json](pi-child-identity-boundaries/reopen-root.json). |
| Child fork retains root reminder | Resuming a saved child from a forked parent exercises Tintinweb's real child-fork path. The new child retains inherited history but excludes owned root context, retains one delivered stance, and leaves the source child file unchanged: [child-fork.json](pi-child-identity-boundaries/child-fork.json). |
| Mapper name falsely universally qualified | `scripts/lib/pi-agent-adapter.mjs` now explicitly distinguishes Tintinweb's `code-mapper` from nicobailon's `do-it.code-mapper`; the generated mapper and generation tests agree. No new runtime-selection framework or duplicate canonical instructions. |

The semantic stance and its explicit authorization wording are unchanged. The
shell's invocation/dispatch counters measure **attempts**, not successful SDK
delivery: the interrupted/recovered case has two hook attempts and one persisted
stance. Failed diagnostics do not satisfy the stance receipt. The projection
preserves raw history, rather than deleting entries or rewriting user content.
This is trusted extension coordination, not sandbox enforcement.

## Controls and exact validation

Three disposable-copy negative controls disable one causal fix at a time. Each
probe exits 1 on the expected model-visible assertion, rather than on unrelated
setup failure:

- [negative-root-path.json](pi-child-identity-boundaries/negative-root-path.json):
  disable explicit shell root precedence; Core is incorrectly absent.
- [negative-interrupted-resume.json](pi-child-identity-boundaries/negative-interrupted-resume.json):
  restore pre-output shell dedupe; the recovered child lacks stance.
- [negative-reopen-root.json](pi-child-identity-boundaries/negative-reopen-root.json):
  disable owned reminder filtering; the reopened root sees child stances.

The controls mutate only temporary package copies. They do not change shipped
sources or live packages. The full native suite also reruns the original persisted,
in-memory, nested, filtered-extension, ordinary-fork, concurrent-cancellation,
and unpatched comparison cases, with new evidence files in
`docs/release-evidence/pi-child-identity-boundaries/`. Historical snapshots are not
replaced; the writer rejects an existing evidence filename.

Commands run in `/home/tdwhere/vibe/do-it-wt-pi` after rebasing onto `565f685`:

```bash
npm run prepack
npm run lint-hooks
npm run test-hooks
DO_IT_TINTINWEB_SOURCE=/home/tdwhere/vibe/pi-subagents-child-identity \
DO_IT_TINTINWEB_BASELINE=/home/tdwhere/vibe/pi-subagents-0.23-baseline \
DO_IT_PI_EVIDENCE_DIR=/home/tdwhere/vibe/do-it-wt-pi/docs/release-evidence/pi-child-identity-boundaries \
npm run test-pi
npm run smoke:pi-package
npm run check:skill-links
npm run validate:legacy-names
git diff --check
```

All passed. **Pi suite: 65/65, zero skips**, including 14 primary native cases
and negative controls, the accepted nicobailon cases, structured-result retention,
and the lead-owned SDK/evaluator boundary tests. Hook suites passed; the expanded
stance shell suite has 9 passing assertions. `prepack` rebuilt generated copies
and passed agent, Cursor, host-matrix, and Core-consistency checks. Package smoke
passed for **0.19.0** through the real Pi loader without a subagent runtime.
Full repository `npm test` and separate evaluator suites were not repeated for
this bounded slice. To reproduce, use a **new** evidence directory.

## Compatibility and remaining limits

The accepted nicobailon **0.35.1** native Linux boundary is documented separately
in [tests/pi/nicobailon-native.md](../../tests/pi/nicobailon-native.md): package
`do-it.*` discovery, project inheritance, child stance without root hooks,
preserved results, readiness-gated cancellation, child PID death, and parent
survival. It uses simulated provider protocol compliance, not real-model judgment.
Its attested acceptance overlay rejects prose-only completion even when exit code
is 0. Neither **0.84.0** nor Windows native lifecycle is claimed verified.

The primary API remains loader-local, synchronous, frozen, and unsubscribed at
shutdown. No private manager, tool-list, prompt, or lineage inference was restored.
Simultaneously loading conflicting runtimes is discouraged, not treated as an
adversarial extension sandbox. Compaction-generated summaries and other arbitrary
paraphrases of historical instructions are not reinterpreted or rewritten by this
owned-message projection. The remaining operational decision is the explicitly
authorized paired migration, not an automatic package install from these tests.
