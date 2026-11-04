# Architecture

The 0.19.0 architecture ships independently selected skills from
`skills/do-it/` (`scripts/skill-tiers.mjs` `ALL_SKILLS`: 10 runnable) plus one
generated discovery entry (`do-it-skills-index` in `index.json`), and specialist
roles from `agents/*.toml` (8). Skill descriptions determine task fit. Neither
the index groups nor specialist roles create a mandatory pipeline, delegation
quota, artifact system, or fixed test count. `do-it-router` has no callable
alias; retired names remain only in history, absence tests, and migration
records.

Those figures are source declaration. Host discovery, native fake-provider
execution, real-model sessions, and task effectiveness are separate claims.
Packaging metadata does not imply any of the latter.

## Canonical ownership

| Maintained owner | Generated projection | Boundary |
| --- | --- | --- |
| `skills/do-it/*/SKILL.md` | Host skill bundles and discovery indexes | Preserve full descriptions; indexes organize discovery without rewriting triggers. |
| Marked bootstrap excerpt in `do-it-core/SKILL.md` | `hooks/data/core-context.txt` via `scripts/build-core-context.mjs` | Runtime context has no independently maintained principle text. |
| `agents/*.toml` | Claude/Cursor/Grok/Pi Markdown; separately installed Codex TOML roles | Specialist bodies have one source. |
| `scripts/lib/pi-agent-adapter.mjs` | Pi agent metadata and supervisor coordination | Host mechanics remain separate from specialist judgment. |
| `plugins/do-it-pi/extensions/*.ts` | Pi runtime adapter | Maintained source, not generated agent policy. |
| `manifest.json`, package metadata, host builders | Host inventory and plugin manifests | Packaging is separate from native host discovery and enforcement. |

`npm run build:generated` refreshes shared output; each host builder refreshes
its bundle. See [maintenance](./maintenance.md). Generated files must not become
second authorities when a source instruction changes.

## Delivery and enforcement

Claude Code, Codex, Cursor, Pi, and Grok Build are the maintained host set.
OpenCode and Kimi Code repository support is retired. This support change does
not remove local applications, configuration, profiles, or memory.

Codex uses `plugins/do-it/.codex-plugin/plugin.json`. In an isolated native
`codex 0.162.0` app-server `plugin/read` comparison, the root Agent Plugins 1.0
manifest exposed skills but found zero hooks; the Codex manifest in the same
package exposed hooks. The builder therefore removes root `plugin.json` and
plugin `agents/` output. A schema-valid portable manifest is insufficient proof
of this host's hook support. That historical probe also reported twelve skill
entries and three hook declarations with Skills/Hooks capabilities; it is not a
current-inventory assertion. This checkout packages 10 runnable skill
directories plus generated `_index.md`. Current native discovery and live hook
execution need their own evidence.

Native specialists are installed separately with
`do-it setup --target=codex --only=agents`. The inspected Codex loader reads
`.codex/agents` and explicit configured roles, not plugin agent metadata.
Hook discovery does not establish live hook execution; installed TOML files do
not establish named-role dispatch or sandbox enforcement. See
[installation](./install.md) and the [host matrix](./harness-adapter-matrix.md).

Claude's plugin-manifest surface is `.claude-plugin/plugin.json`. Root
marketplace validation does not replace explicit plugin-manifest validation, and
neither command proves live hook execution.

Role enforcement is host-specific. The shared parser in
`scripts/lib/agent-source.mjs` feeds Markdown renderers from canonical TOML.
`sandbox_mode` is `read-only` for six roles and `workspace-write` for
`documentation-engineer` and `test-engineer`. Claude projections add
`disallowedTools: Edit, Write, NotebookEdit` only on read-only roles; Cursor
sets native `readonly: true` for those same roles. Pi reader roles omit
edit/write tools but retain Bash. Codex sandbox settings apply only when the
host actually loads the native role. Verify active host permissions separately;
advisory hooks and diagnostics cannot establish task acceptance or a universal
security guarantee. Tool lists and read-only instructions are not a filesystem
sandbox.

Primary contracts: [Agent Plugins 1.0 schema](https://agent-plugins.org/schemas/1.0.0/plugin.schema.json),
[Codex plugins](https://developers.openai.com/codex/plugins/),
[Codex subagents](https://developers.openai.com/codex/subagents/), and the pinned
[Codex role loader](https://github.com/openai/codex/blob/82883da25e3be5883e905afa02c3a639d02a97aa/codex-rs/agent-roles/src/loader.rs).

Other host contracts inspected on 2026-10-09:
[Claude manifests](https://code.claude.com/docs/en/plugins/manifest-reference.md),
[hooks](https://code.claude.com/docs/en/hooks.md), and
[subagents](https://code.claude.com/docs/en/sub-agents.md);
[Cursor plugins](https://cursor.com/docs/reference/plugins) and
[subagents](https://cursor.com/docs/context/subagents);
[Grok plugins](https://docs.x.ai/build/features/skills-plugins-marketplaces.md),
[hooks](https://docs.x.ai/build/features/hooks.md), and
[subagents](https://docs.x.ai/build/features/subagents.md).
For Grok 1.0.46, its bundled user guide provides the event-specific output
semantics that the shorter public pages omit. The locked Pi development SDK is
`@earendil-works/pi-coding-agent` 1.5.0 in `plugins/do-it-pi/package.json`; the
optional peer `~1.5.0` is a version policy, not evidence for other patch
versions.

Grok Build has a separate generated `plugins/do-it-grok/` bundle and
`.grok-plugin/plugin.json` named `do-it-grok`, avoiding the observed collision
with Claude marketplace discovery of `do-it`. Its adapter normalizes Grok's
camelCase payloads. UserPromptSubmit only advances turn state and emits no Core
context; PostToolUse delivers Core and edit-check context. Core
arrives after the first completed tool; prompt/session hooks do not supply an
initial context guarantee. Grok Markdown contains canonical instruction bodies,
without translating Codex sandbox settings or Claude tool denials into Grok
permissions. A 1.0.46 loaded-source inspection that reported twelve skills and
ten specialists is historical, not this checkout's inventory; the generated
bundle currently has 10 skill directories and 8 agent files. Native package
validation and discovery are separate from proof of runtime execution.

Pi child identity is `PI_SUBAGENT_CHILD=1` (subprocess) or a patched Tintinweb
`subagents:session-context` reply
`{ version: 1, runtime: "@tintinweb/pi-subagents", role: "root" | "child" }`.
Otherwise the session is unmarked and root hooks apply. Lineage and presence of
`Agent`/`subagent` tools are not identity; `/do-it-status` still reports whether
those tools are registered, which is not package-agent discovery. Published
`@tintinweb/pi-subagents` 0.23.0 cannot provide creator identity. The reviewed
patch (portable form of `7a48987`) ships with its MIT license and pinned recipe
at `install/pi-runtime/tintinweb/` and, in the standalone Pi tarball,
`docs/tintinweb/`. Repository tests do not patch a live installation.

The shared physical projection keeps one `agents/*.toml` body.
Tintinweb discovers bare names such as `code-mapper`; nicobailon `pi-subagents`
0.35.1 (optional peer and devDependency, exact) qualifies `do-it.*`. Do not load
both runtimes expecting automatic selection. Tintinweb's replacement prompt does
not inherit project instruction files; pass required constraints in the
delegation. Skip-gated Linux fake-provider suites are
`tests/pi/native-primary.test.mjs` and `tests/pi/nicobailon-native.test.mjs`.
Windows and nicobailon 0.84.0 lifecycle are **NOT_VERIFIED**. Real-model host
sessions and paired-task effectiveness are not established here. See
[Pi runtime boundaries](../skills/do-it/references/host-pi.md).

Cursor's declared hook map is sessionStart, beforeSubmitPrompt, and postToolUse
via `run-hook.cmd`. Plugin-native hook loading versus the user-level
`~/.cursor/hooks.json` mirror is not closed; native actual hook counts are
unverified.

## Upstream comparison

The 0.18.1 review compared the following pinned sources. Ideas are adapted to
do-it's existing skills and maintenance checks; no upstream framework is installed.

| Repository and inspected source | Useful principle and do-it application | Limit |
| --- | --- | --- |
| google/skills — [finding-google-skills](https://github.com/google/skills/blob/aaec8c9a5beeeaf3b9b6efe8a86bd3d24ad0cedd/skills/developers/finding-google-skills/SKILL.md) | Check that retrieval produced usable content; successful tool exit alone is insufficient evidence. `do-it-verify` distinguishes a command result from the claim it supports. | Twelve skills do not need a separate finder service or retrieval framework. |
| getsentry/skills — [security-review](https://github.com/getsentry/skills/blob/d18b7aa8ba878354e5c348310230e652f7690f9c/skills/security-review/SKILL.md), [skill-writer/EVAL.md](https://github.com/getsentry/skills/blob/d18b7aa8ba878354e5c348310230e652f7690f9c/skills/skill-writer/EVAL.md) | Trace attacker-controlled input through a reachable path before asserting exploitability; the red-team role uses this evidence boundary. Natural-language requests and negative trigger cases belong in skill maintenance; reference links state when to load deeper material. | No runtime SPEC/AXIS machinery or mandatory skill-writing artifact set. |
| trailofbits/skills — [post-patch-validation](https://github.com/trailofbits/skills/blob/82fe8226252622fa807643bdca1710901198553a/plugins/post-patch-validation/skills/post-patch-validation/SKILL.md), [AGENTS.md](https://github.com/trailofbits/skills/blob/82fe8226252622fa807643bdca1710901198553a/AGENTS.md) | Require evidence tied to the original failure and affected causal paths; distinguish a validator inspecting nothing from a meaningful pass. Trigger checks are maintenance evidence where feasible. | No mandatory two-test rule, fixed phases, or imported runner/artifact system. |
| github/spec-kit — [README](https://github.com/github/spec-kit/blob/93989802b1401c99cc7de6e4ed76572f9cb662e8/README.md), [AGENTS.md](https://github.com/github/spec-kit/blob/93989802b1401c99cc7de6e4ed76572f9cb662e8/AGENTS.md) | Independent entrypoints and explicit missing verification reinforce direct task-fit skill use and bounded delivery claims. | Missing proof is not proof of a fix. do-it does not adopt the spec-driven command sequence or document scaffold. |
| vercel-labs/agent-skills — [vercel-optimize](https://github.com/vercel-labs/agent-skills/blob/063bee94c3f4df8453406c830b0a7df0f2860278/skills/vercel-optimize/SKILL.md) | Production performance claims need relevant metrics and verified configuration; local green tests establish only local behavior. | Metrics-first investigation is specific to production optimization, not a prerequisite for ordinary coding. |

The [source and rewrite map](./upstream-map.md) retains earlier lineage. Current
skills and agent bodies, rather than historical process descriptions, own the
shipped behavior. Evaluation fixtures establish only what they exercise; a
comparison or dry run does not prove live model compliance. The
[0.18.1 verification record](./release-evidence/0.18.1-unreleased.md) contains
bounded native discovery and actual model observations.
