# nicobailon / Pi 1.5 native compatibility

Probed in worktree `do-it-wt-pi-compat` on branch `upgrade/pi-compat`.
This is a provider-free native boundary check, not a Tintinweb result and not
an upgrade of repository dependency metadata.

## Versions and paths

| Piece | Value |
| --- | --- |
| Pi SDK / CLI | `@earendil-works/pi-coding-agent` 1.5.0 |
| CLI script | `plugins/do-it-pi/node_modules/@earendil-works/pi-coding-agent/dist/bundle/cli.js` |
| nicobailon | `pi-subagents` 0.35.1 (TypeScript entry `./index.ts`, not the 0.84.0 compiled `.js` package) |
| do-it plugin | `@tdwhere/do-it-pi` 0.18.1 |
| Canonical roles | eight `agents/*.toml` names, qualified as `do-it.*` |

## Result

**VERIFIED** for this boundary with installed 0.35.1. 0.84.0 was not evaluated
because 0.35.1 loaded, discovered package roles, and completed a real Pi 1.5
child spawn.

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
- Aborting the child leaves the parent session able to prompt and still
  holding `subagent` / `edit`.

## Limitations (not encoded as do-it support)

- This is not OS isolation. Reader roles still have `bash`.
- nicobailon adds `contact_supervisor` to the child tool list and infers
  attested acceptance (structured `acceptance-report`) from
  `acceptanceRole: read-only`. A child that only returns prose is
  `acceptance.status: rejected` even when `exitCode` is 0.
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
