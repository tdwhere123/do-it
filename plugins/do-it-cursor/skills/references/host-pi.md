# Host Adapter: Pi

The Pi adapter provides medium-depth, advisory lifecycle hooks through one
TypeScript extension. It also ships do-it skills, prompt templates, and optional
package agents in an independently publishable Pi package.

## Install

After `npm view @tdwhere/do-it-pi@0.14.2 version` succeeds, install from npm:

```bash
pi install npm:@tdwhere/do-it-pi
```

Before registry publication or for package development, use a local checkout:

```bash
npm ci --prefix plugins/do-it-pi
npm run build:pi-plugin
pi install /absolute/path/to/do-it/plugins/do-it-pi
```

`npm run install:pi-global` performs the local-path install after building.
Run `/reload` in Pi after installing or rebuilding. Session hook state lives
under `~/.pi/agent/do-it-data/sessions/` unless `PI_CODING_AGENT_DIR` changes
the Pi agent directory.

The package requires Node `>=22.19.0`, matching the supported Pi runtime.

## Optional Package Agents

Core extension, skill, and prompt discovery does not require `pi-subagents`.
Install it separately to run the packaged agents:

```bash
pi install npm:pi-subagents
```

The package exposes `./agents` through `pi.subagents.agents`. Agent frontmatter
uses `package: do-it`, so executable runtime names are namespaced, for example:

- `do-it.code-mapper`
- `do-it.reviewer`
- `do-it.red-team-reviewer`
- `do-it.spec-compliance-reviewer`

Run `/do-it-status` to see whether a `subagent` tool is currently registered.
That signal does not prove `do-it.*` package-agent discovery; use the
`pi-subagents` agent list/discovery surface for that check. If the tool is absent,
the command reports explicit degradation while the extension, skills, and
prompts remain active.

Packaged agents use only portable Pi tools. They intentionally do not own fixed
turn, tool, timeout, or output budgets. The parent invocation supplies a
bounded task scope and any appropriate runtime envelope. Use Pi's fast `scout`
for reconnaissance; use `do-it.code-mapper` for bounded `trace` or `thorough`
closure, and resume from its reported frontier when necessary.

## Lifecycle Routing

**Medium** means advisory rather than a hard pre-edit gate.

| Pi event | Root session | `PI_SUBAGENT_CHILD=1` session |
| --- | --- | --- |
| `session_start` | create session data | create session data |
| `before_agent_start` | bootstrap once, then `router.sh` and `grill-prompt.sh` | `subagent-stance.sh` only |
| `tool_result` for `edit`/`write` | append `write-quality-lint.sh` advice without replacing ToolResult parts | skip root-only write hook |
| `agent_end` | capture final assistant text from event messages | skip root-only completion capture |
| `agent_settled` | queue a soft verification reminder for the next turn when completion language requires it | skip root-only reminder |
| `session_shutdown` | terminate active hook process trees | same |

Hook payloads include the session, working directory, transcript path, tool
input/result, and affected file when available. Hook output may add context or
an advisory block reason; it does not flatten text/image ToolResult arrays.

## Bash and Windows

Hook scripts require Bash. Resolution order is:

1. `DO_IT_BASH`
2. `bash` on `PATH`
3. common Unix locations
4. common Git-for-Windows locations

On Windows, install Git Bash or set `DO_IT_BASH` to `bash.exe`. Timed-out or
aborted hook runs terminate the Windows process tree with `taskkill /T /F`;
Unix-like systems terminate the spawned process group. `/do-it-status` reports
actual Bash availability and the last hook diagnostic.

## Tool Mapping

| do-it intent | Pi surface |
| --- | --- |
| Read / inspect | `read` / `grep` / `find` / `bash` |
| Edit | `edit` / `write` |
| Verify | `bash` |
| Delegate | optional `pi-subagents` and `do-it.*` agents |
| Load skill | package `skills/` discovery |
| Diagnose adapter | `/do-it-status` |

## Build and Verification

From the repository root:

```bash
npm run build:pi-plugin
npm --prefix plugins/do-it-pi test
node scripts/smoke-pi-package.mjs
```

The build regenerates shared hooks and skills while validating Pi-owned
extension, package, and agent contracts. The smoke installs the packed Pi
package without development dependencies and confirms that missing optional
`pi-subagents` does not break the core package.

Use `live-pi` evidence when a claim depends on extension loading, `/reload`,
package registration, or executable agent discovery. Static metadata tests do
not replace a live discovery check.

## Notes

- Prefer one workflow methodology at a time rather than stacking competing
  router or completion systems.
- The adapter does not require an automatic continuation extension. Scope and
  resumable frontiers bound package agents; Pi's own session lifecycle owns
  compaction.
- Package versions and both Pi lockfile version fields must match the release
  tag. `@tdwhere/do-it-pi` is packed and published independently from the root
  `@tdwhere/do-it` tarball.
