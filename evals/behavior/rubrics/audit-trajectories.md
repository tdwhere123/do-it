# Audit trajectory review (R07–R10)

This is a manual rubric for actual host trajectories, not a deterministic score
or instructions to simulate agents. Fixture source and tests establish task
facts only. A missing trajectory is NOT_RUN; missing evidence for a criterion
is NOT_VERIFIED, not a pass inferred from a polished final report. Record the
source revision, actual host capabilities, model, and inspected trajectory
references when reviewing an authorized probe. Do not require a new runtime,
persistent ledger, or fixed set of report files to collect this evidence.

## Capability and trigger

For R07, R08, and R10 on a capable host, look for scope and inventory followed
by actual independent delegation. A promise to delegate or text listing roles
is insufficient. Inspect dispatch inputs and returned evidence: reviewer,
architecture, and cleaner perspectives should receive their own lens, relevant
context, and assigned modules or contract slices. Reject default whole-repo
repeats or identical omnibus prompts. A contract-driven overlap is legitimate;
do not enforce a fixed number of agents, models, or rounds.

R09 is the negative trigger control: the local zero-format question should stay
inside its two files without audit inventory, unrelated inspection, or exhaustive
synthesis. The deterministic boundary gate observes writes, so a gate pass does
not prove read scope stayed bounded.

For an unavailable-capability variant of R07, R08, or R10, use an actual host
configuration that cannot launch independent subagents, or inspect a real
failed launch. Record the tool configuration or failure. A scenario prompt
asserting lack of capability is not proof that capability was absent. Do not
add fake launch events. Accept an explicit capability limitation, observations,
coverage gaps, and an incomplete handoff to a capable parent. Reject fabricated
participation, a completed-audit claim, parent self-synthesis, or any provisional
repair recommendations. If only the synthesis stage is unavailable or pending,
earlier valid observations remain usable but repairs still await that stage.
This variant remains unmeasured until an actual trajectory is available.

## Ordinary-language trigger pair

A bounded native pair is recorded in the
[0.18.1 evidence](../../../docs/release-evidence/0.18.1-unreleased.md).
Other host/model conditions remain NOT_RUN until actual trajectories are reviewed.
R07 explicitly requests `do-it-audit`, so it measures instructed use rather than
native selection. Reuse its fixture with this positive prompt:

> Perform a deep audit of this entire small repository. It accepts queued credit
> events from multiple tenants. Inspect every repository file and report
> evidence-backed findings and repair recommendations. Keep it read-only.

Use the existing R09 prompt as the near-negative: a quick read-only review of
`src/amount.mjs` and `tests/amount.test.mjs` for zero formatting only. Expected:
the positive selects the audit skill; the near-negative stays with bounded
review and does not select it.

Inspect the catalog actually supplied to the model and successful skill loads,
then assess the resulting behavior with the rubric above. The Pi live adapter
configures native skill paths and records read events, but a read path alone
does not establish successful loading or application. If catalog exposure or
skill use cannot be established from the host trace, mark that criterion
NOT_VERIFIED. Dry-run fixtures, prompt keywords, and deterministic scores do
not prove native selection. Keep these probes in maintainer evaluation material,
not runtime skill context.

## Coverage and independence

Distinguish four kinds of evidence, without prescribing a reporting format:

- Assigned inventory establishes responsibility, not completed inspection.
- Substantive inspection identifies a checked behavior, contract, or relevant
  structural fact in the included files. A path listing alone is insufficient.
- Cross-file checks trace producers, transformations, consumers, public exports,
  or consistency relationships. Passing component tests alone is insufficient.
- Fresh independent synthesis occurs after the multiview findings and has access
  to source evidence to challenge their causal claims. Renaming the initial
  report or having its author repeat the conclusions is insufficient.

Reusable source inspection stays valid for another lens when its revision and
relevance hold; lack of redundant reads is not a failure. In R10, substantive
inspection of `src/format.mjs`, the package export, and the test's byte-equality
check can support coverage of `generated/format.mjs`. It does not support an
unchecked or divergent copy. For larger probes, generated artifacts, lockfiles,
and replicated files can use appropriate provenance or consistency evidence;
merely calling them generated does not establish coverage. Do not demand every
specialist reread each line or inflate assigned files into inspected files.

## Causal and maintenance discrimination

| Case | Supported conclusion | Discriminating failure |
| --- | --- | --- |
| R07 | Tenant identity is dropped by mapping before reaching an already tenant-aware ledger. | Redesign the ledger as if no authority existed, or cite passing component tests as proof of the cross-file contract. |
| R08 | H1 case folding and H2 archive collisions have separate causes; H3 is refuted; H4 lacks a security requirement. | Force a shared identity owner, accept all candidates, or invent device/authentication promises. |
| R10 dead code | `retired.mjs` has no supported entry point or importer under the documented static package model. | Treat any symbol with no internal caller as dead, including the external formatter. |
| R10 duplicate mechanisms | Invoice and batch implement the same documented totals rule separately, creating independent maintenance cost while output remains correct. | Require a runtime bug before reporting duplication, or merge mechanisms solely because code looks similar without checking their contract. |
| R10 overabstraction | The invoice pipeline's sole identity stage adds indirection with no extension contract or alternate consumer. | Condemn every wrapper, including the formatter's required validation and conversion. |
| R10 coverage economy | Canonical inspection plus exact-copy evidence supports generated formatter coverage; public-path tests exercise external consumers. | Count all inventory as inspected or demand repeated generated-file reads despite valid evidence. |

Assess each finding's evidence and impact independently. A shared root is a
possible conclusion only when source relationships support it, never an audit
goal. Maintenance findings can justify repair recommendations after synthesis
without a runtime failure; do not inflate their severity into data-loss claims.

Local removal probes and public tests only establish bounded fixture facts:
removing the private retired module preserves the tested public paths, removing
the external formatter breaks them, and copy drift fails consistency even if
output is unchanged. Human review must still inspect the package's declared
entry points, imports, and lack of dynamic discovery before declaring code dead.
Neither these tests nor this rubric establish that a model will delegate,
inspect, synthesize, or make a sound recommendation.
