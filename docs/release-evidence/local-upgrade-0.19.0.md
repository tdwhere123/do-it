# Local 0.19.0 upgrade evidence

## Status: pre-deployment, 2026-11-04

No persistent Claude Code, Codex, Cursor, or Grok installation has been changed.
Deployment requires the lead's final verified source commit and explicit GO.
This record does **not** establish complete native-session acceptance or release
readiness. Pi migration and publication belong to the lead.

Hook probes used the archived, exact candidate
`1a7b3804fc09d571bbea8c5690278ac427f39e1b`, not the subsequently edited worktree.
The installer-only connected-consumer fix is
`8bf448e5cc360981bd609538f2a03dbbfa9e21ba`.

## Cursor managed-install closure

An isolated regression confirmed that the managed CLI changed assets before its
post-install registration discovered an existing Cursor home lock. The same
problem occurred with both default and custom managed roots.

The managed transaction now acquires the existing home lock before changes and
retains it through registration, rollback, and cleanup. Registration borrows only
a live lock for the matching home; standalone registration retains its own lock
ownership. No second lock or cross-host locking framework was introduced.
Original, rollback, staging-cleanup, and lock-release errors remain visible.
`--no-migrate` refusal releases the lock without continuing `setup` to `doctor`.

Verification:

- Before the fix: five of six new regressions failed, including both pre-lock
  mutation cases. Evidence: `/tmp/do-it-019-cursor-managed-lock-red.log`.
- `npm run test-install`: **228 passed, zero failed/skipped**.
  Evidence: `/tmp/do-it-019-cursor-managed-install.log`.
- Native Windows Node `v24.12.0`, `node.exe --test --test-reporter=tap` against
  isolated copies of `cursor-local.test.mjs`, `cursor-recovery.test.mjs`, and
  `cursor-managed-lock.test.mjs`: **54 passed, zero failed/skipped**.
  Evidence: `/tmp/do-it-019-cursor-managed-windows.log`.
- `npm run validate:cursor-plugin`, `npm run check:skill-links`, and
  `git diff --check`: passed.

These checks do not establish that live Cursor agent/hook activity is quiescent.
Asset updates are not an atomic reader snapshot; that deployment prerequisite
remains **NOT_VERIFIED**.

## Native probes and request accounting

Private evidence root:
`~/.local/state/do-it/upgrades/0.19.0-host-probes-1a7b380/`.
Credentials remain private and are not included in this repository.

The host allocation was 27 generation requests. Its durable ledger is
`generation-ledger.jsonl`: **one admitted upstream request**, completed with
HTTP **429**; **zero unknown or outstanding requests**. Claude's automatic retry
was rejected locally before upstream dispatch. No further real-model trial was
made. This does not spend or reconcile the lead's separate Pi incident reserve.

The native Claude process used an isolated profile and a network namespace with
only a guarded loopback relay. Offline admission checks exercised the total cap,
per-run cap, and non-refunding of unknown outcomes. The real run stopped after
the first upstream failure; a CLI session/turn count was not used as accounting.

| Host | Observed evidence | Remaining boundary |
| --- | --- | --- |
| Claude Code `2.1.317` | Native fake-provider run loaded the candidate's 10 skills and 8 specialists; two `UserPromptSubmit` hooks ran, an allowed `Write` invoked `PostToolUse`, and a protected write was denied. Canonical hook script bytes matched the archived source. The real request contained Core hook context but received 429 before any tool executed. | Real-model tool/hook completion **NOT_VERIFIED**; no retry. |
| Codex | Existing Linux and Windows installations and native hook discovery were inspected without generation. | Candidate real-session hook execution and permissions **NOT_VERIFIED**. |
| Cursor | Existing Linux and Windows installations were inspected; installer regressions passed natively on both platforms. | Plugin-only/mirror-only/both invocation counts, real-session permissions, and activity quiescence **NOT_VERIFIED**. No mirror was removed on inference alone. |
| Grok | Existing installation and plugin identity were inspected without generation. | Candidate real-session hook execution and permissions **NOT_VERIFIED**. |

Claude evidence: `runs/claude-edit-rule-offline/` and `runs/claude-real-01/`
contain transport, hook, and native output logs. The effective native path deny
rule was `Edit(path)`, which also denied `Write`; initial `Write(path)` rules did
not deny that operation. This is a native permission result, not filesystem
isolation or a claim about every specialist. Fake-provider evidence is not
real-model behavior evidence. No real generation requests were sent by the
other three hosts; their request-counting boundaries were not established.

## Deployment preservation requirements

Before authorized updates, make protected external backups and pin the supplied
verified source. Preserve Windows Codex's 11 custom role files/config aliases,
unrelated settings and trust, Cursor runtime/user files, Grok's disabled
colliding `do-it` entry, and the immutable Windows 0.18.1 package snapshot.
Do not kill user processes or dispose of active work to obtain quiescence.
Installed file parity, native discovery/trust, and preservation checks are still
required after deployment; version declarations alone are insufficient.

## Optional Windows Pi check

**NOT_VERIFIED; no environment provisioned.** Windows Node `v24.12.0` and existing
Git Bash `D:\Git\bin\bash.exe` (`5.2.37`) work, but no Windows SDK 1.5 installation
or test staging was found in the existing do-it package, temporary staging, or
global npm locations. There is no Windows `.pi` profile. No Pi command or
provider request was made. Windows timeout/abort process-tree proof was not run;
Pi native runtime support claims remain Linux-only.
