# nicobailon / Pi 1.5 native compatibility

Probed in worktree `do-it-wt-pi-compat` on branch `upgrade/pi-compat`, based on
`296e4bd` where the plugin version is `@tdwhere/do-it-pi` 0.18.1. Main later
moved to 0.19.0 (`fdcdc0b`); rerun this boundary after integration rather than
treating the version string as current main.

This is a provider-free native boundary check, not a Tintinweb result and not
an upgrade of repository dependency metadata.

## Versions and paths

| Piece | Value |
| --- | --- |
| Base commit | `296e4bd` |
| Pi SDK / CLI | `@earendil-works/pi-coding-agent` 1.5.0 |
| CLI script | `plugins/do-it-pi/node_modules/@earendil-works/pi-coding-agent/dist/bundle/cli.js` |
| nicobailon | `pi-subagents` 0.35.1 (TypeScript entry `./index.ts`, not the 0.84.0 compiled `.js` package) |
| do-it plugin | `@tdwhere/do-it-pi` 0.18.1 at that base |
| Canonical roles | `agents/*.toml` names, qualified as `do-it.*` (roster cardinality belongs to the inventory test) |

## Platform

Native child spawn/abort was exercised on POSIX/Linux. Windows is skipped in
this suite (`process.platform === "win32"`) because the probe uses a POSIX
shell wrapper and bash hooks.

## What the fake provider does and does not prove

The parent and child use Pi's in-process `fauxProvider` with scripted replies.
That is simulated protocol compliance: tool calls, spawn, hooks, role text, and
structured tool results. It is not real-model judgment, planning quality, or
live-provider behavior.

## Result

**VERIFIED** for this boundary with installed 0.35.1 on Linux. 0.84.0 was not
evaluated because 0.35.1 loaded, discovered package roles, and completed a real
Pi 1.5 child spawn.

Reproducer from the repo root: `node --test tests/pi/nicobailon-native.test.mjs`.
It uses a temporary `HOME` / `PI_CODING_AGENT_DIR`, a fake provider, and
`PI_SUBAGENT_PI_BINARY` pointing at the 1.5 CLI above. Live user Pi config is
not read.

Proven:

- Package discovery source is `package` under `plugins/do-it-pi/agents`, names
  `do-it.*`.
- Parent SDK session registers nicobailon's native `subagent` tool and calls it.
- Child is a spawned Pi 1.5 process (`PI_SUBAGENT_CHILD=1`) for
  `do-it.code-mapper`.
- Delegated constraints observed in the child: `inheritProjectContext=1`,
  `inheritSkills=0`, tools `read`, `bash`, `intercom` (plus nicobailon
  `contact_supervisor`), project `AGENTS.md` marker present, package role text
  present, nicobailon child-boundary instructions present.
- Root session receives do-it prompt-submit context; the child receives
  subagent stance and not the root kernel.
- Subagent tool content/details survive the parent adapter (`NICO_CHILD_OK`,
  `details.results[0].agent`).
- Abort is requested only after the child fake-provider handshake (live pid).
  The child process exits before writing normal completion facts, the subagent
  result is not `NICO_CHILD_OK`, and the parent can prompt again with
  `subagent` / `edit` still registered.

## Limitations (not encoded as do-it support)

- This is not OS isolation. Reader roles still have `bash`.
- nicobailon adds `contact_supervisor` to the child tool list and infers
  attested acceptance (structured `acceptance-report`) from
  `acceptanceRole: read-only`. A child that only returns prose is
  `acceptance.status: rejected` even when `exitCode` is 0. That overlay is
  documented, not treated as a passing acceptance claim.
- nicobailon's parent extension early-returns in children; child semantics
  come from `PI_SUBAGENT_CHILD=1`, the injected prompt-runtime extension, and
  package extensions loaded from isolated settings.
- In-memory parent sessions store child session files under
  `/tmp/pi-subagent-session-*`.
- Do not treat `@tintinweb/pi-subagents` and `pi-subagents` as the same
  runtime.

## Next decision

Lead / primary-runtime owner: keep 0.35.1 as an optional compatibility peer
now that native lifecycle is proven, or still consider 0.84.0 only if a
later requirement needs its compiled entry or newer APIs. Do not silently
retarget the lockfile from this probe.
