# Local 0.19.0 deployment

Completed on 2026-11-04 under explicit deployment authorization, using exact
verified source **`2c246ef236b3280621b63ab9d61e1c623076789b`**.
This is a new deployment record; the earlier
[pre-deployment evidence](local-upgrade-0.19.0.md) remains unchanged.

## Installed outcomes

| Existing installation | Result and provider-free verification |
| --- | --- |
| Linux Claude Code `2.1.317` | Updated `do-it@do-it` from 0.18.1 to **0.19.0** through native marketplace/update commands. Native control initialization discovered the 10 canonical skills and 8 do-it agents. |
| Windows Claude Code `2.1.94` | Existing 0.18.1 installation was backed up and updated through its native CLI to **0.19.0**. Native control initialization exposed all 10 canonical skills and 8 agents. The older host reports skill names without the newer namespace prefix. |
| Linux Codex `0.165.0` | Plugin **0.19.0** installed natively; native app-server discovery returned 10 plugin skills and 3 enabled/trusted hooks. Managed native-agent setup/doctor verified 8 canonical role files, zero missing/drift; four hash-owned retired roles were removed. |
| Windows Codex `0.164.0-alpha.11.1` | Plugin **0.19.0** installed using the existing current executable. Native discovery returned 10 plugin skills and 3 enabled/trusted hooks. All **11 custom native role files and configured aliases remain unchanged**; no canonical role overlay was forced over this custom installation. |
| Linux Cursor | Copied **0.19.0** using the fixed local installer; all bundled files match source. User hook wiring was merged, and **194 existing runtime files**, unrelated files, plugin-root inode, and data-directory inode were preserved. **Reload Window required.** |
| Windows Cursor | Copied **0.19.0** into the existing real local-plugin directory; all bundled files match source. **80 existing runtime files**, unrelated files, root/data directory identities, and unrelated user hooks were preserved. **Reload Window required.** |
| Linux Grok Build `1.0.70` | Installed **do-it-grok 0.19.0** natively with trust. Final native inspect selected its new installed path and showed 10 skills and 8 specialist bodies. Existing disabled colliding `do-it` entries remain unchanged. |

No existing Windows Grok plugin registry was found; none was installed. No host
executable, retired host, Pi runtime, or global npm CLI was installed or upgraded
by this deployment worker. Existing sessions/processes were not killed; use fresh
sessions or the host's reload mechanism to consume changed resources.

## Exact sources and protected recovery material

Private deployment root (**mode 0700**, outside tracked repositories):

```text
~/.local/state/do-it/upgrades/0.19.0-deployment-2c246ef/
  source/       exact git archive of 2c246ef
  backups/      prior managed payloads, settings, registrations, roles and hooks
  evidence/     native output, inventories and verification results
```

Windows marketplace source is the new, byte-verified snapshot:
`%LOCALAPPDATA%\do-it\packages\0.19.0-2c246ef\package`.
The old `0.18.1-2bb8fc2/package` snapshot's **426 files remain byte-identical**.
Claude and Codex marketplace registrations now point to these pinned snapshots,
not the development checkout. Codex required native removal/re-addition of only
its `tdwhere-do-it` marketplace to change the source.

Grok's native install added a new source registration while retaining the old
one. The intermediate registry was backed up, then only the obsolete registration
pointing at the development checkout was removed. Its old installed directory
was retained; the active registration points at the pinned source bundle.

No live rollback was needed. Recovery copies are retained, including the prior
registries and Cursor payload/data. Any future Cursor rollback must preserve live
runtime data rather than replace the entire plugin directory from a backup.

## Verification and evidence

All following evidence paths are relative to the private deployment root:

- `evidence/installed-parity-preservation.json` and
  `evidence/final-verification.log`: **PASS** for all seven installed payloads,
  the Windows source snapshot, custom roles/aliases, Cursor runtime bytes and
  directory identities, old Windows snapshot, unrelated settings/hooks, and
  Grok disabled entries.
- `evidence/backups.json`, `evidence/preservation-before.json`: backup inventory
  and pre-update hashes/identities. Backup contents may be private and are not
  included in this repository.
- `evidence/claude-update.log`, `claude-windows-update-native.log`,
  `claude-initialize.jsonl`, `claude-windows-initialize.jsonl`: native update and
  no-user-prompt initialization. Linux initialization also ran in a network
  namespace with no external connectivity.
- `evidence/codex-linux-update-native.log`, `codex-windows-update.log`, and
  `codex-{linux,windows}-native.jsonl`: native installation, discovery and trust.
  Only the three current do-it hook trust entries per profile changed, using the
  **complete native compound `currentHash` values** after payload parity passed;
  unrelated trust entries remained unchanged.
- `evidence/cursor-update.log`, `windows-processes-before.json`: installation
  and bounded activity inspection. No running Cursor agent/hook command was
  visible on either platform; Windows had 13 Cursor GUI processes. This was not
  a guarantee of quiescence or an atomic reader snapshot. No process was killed,
  no active data was cleared, and reload was not forced.
- `evidence/grok-update.log`, `grok-inspect-final.json`: native installation and
  selected-source discovery. Aggregate inventory counters were not substituted
  for the actual skill/agent entries.

## Explicit limits and accounting

Deployment performed **no new generation requests**. Final experimental host
accounting remains **1/27 consumed**, HTTP 429, with the subsequent retry blocked
before forwarding and zero unknown/outstanding requests. The prior immutable
ledger is under `0.19.0-host-probes-1a7b380/generation-ledger.jsonl`.

Native initialization/inspection and trusted declarations do not establish live
hook execution or native permission enforcement in a real model turn. Those
previously reported gaps, including Cursor plugin/mirror duplicate invocation
counts, remain **NOT_VERIFIED**. No additional model probes or Windows Pi setup
were attempted. Pi activation, registry publication, tags, and pushes belong to
the lead and are not claimed as this worker's verification.
