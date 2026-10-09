# Architecture

do-it ships twelve independently selected skills (including the explicit
`do-it-router` discovery compatibility alias) and ten specialist roles. Skill
descriptions determine task fit. Neither the index groups nor specialist roles
create a mandatory pipeline, delegation quota, artifact system, or fixed test
count.

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
of this host's hook support. A subsequent native `plugin/read` of the final
repository bundle returned twelve skills, three hook declarations (two
UserPromptSubmit and one PostToolUse), and only Skills/Hooks capabilities.

Native specialists are installed separately with
`do-it setup --target=codex --only=agents`. The inspected Codex loader reads
`.codex/agents` and explicit configured roles, not plugin agent metadata.
Hook discovery does not establish live hook execution; installed TOML files do
not establish named-role dispatch or sandbox enforcement. See
[installation](./install.md) and the [host matrix](./harness-adapter-matrix.md).

Claude's native `claude plugin validate --strict .claude-plugin/plugin.json`
passed after quoting plugin paths. Root validation also passed, but checks the
marketplace surface and does not replace explicit plugin-manifest validation.

Role enforcement is host-specific. The shared parser in
`scripts/lib/agent-source.mjs` feeds Markdown renderers from canonical TOML.
The eight read-only Claude roles receive `disallowedTools: Edit, Write,
NotebookEdit`; Bash remains available, so this is not a filesystem sandbox.
Cursor generates its own agents with native `readonly: true` for those roles.
Pi reader roles omit edit/write tools but retain Bash. Codex sandbox settings
apply only when the host actually loads the native role. Verify active host
permissions separately; advisory hooks and diagnostics cannot establish task
acceptance or a universal security guarantee.

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
[Pi 1.1.0 extension API](https://github.com/earendil-works/pi/blob/abe508e1/packages/coding-agent/docs/extensions.md) and
[packages](https://github.com/earendil-works/pi/blob/abe508e1/packages/coding-agent/docs/packages.md);
[Grok plugins](https://docs.x.ai/build/features/skills-plugins-marketplaces.md),
[hooks](https://docs.x.ai/build/features/hooks.md), and
[subagents](https://docs.x.ai/build/features/subagents.md).
For Grok 1.0.46, its bundled user guide provides the event-specific output
semantics that the shorter public pages omit.

Grok Build has a separate generated `plugins/do-it-grok/` bundle and
`.grok-plugin/plugin.json` named `do-it-grok`, avoiding the observed collision
with Claude marketplace discovery of `do-it`. Its adapter normalizes Grok's
camelCase payloads. UserPromptSubmit only advances turn state and emits no Core
context; PostToolUse delivers Core and edit-check context. Core
arrives after the first completed tool; prompt/session hooks do not supply an
initial context guarantee. Grok Markdown contains canonical instruction bodies,
without translating Codex sandbox settings or Claude tool denials into Grok
permissions. Native Grok Build 1.0.46 loaded-source inspection reported twelve skills and ten
specialists; the Grok suite passed 9/9 checks with the absolute 1.0.46 executable
selected by `DO_IT_GROK_BINARY`. Native package validation and discovery are separate from proof of
runtime execution.

Pi development dependencies target 1.1.0. Its adapter detects either `Agent` or
`subagent`; in-process child detection combines runtime manager presence,
parent-session lineage, and absence of both delegation tools. A fresh-process
probe with the native Agent runtime verified one stance message in each of two
child model requests, one persisted stance invocation, no Core or root hooks,
and an unchanged `pwd` result. This covers a persisted child with fresh context;
root/fork selection and edit suppression also have lifecycle tests. See
[Pi runtime boundaries](../skills/do-it/references/host-pi.md).

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
