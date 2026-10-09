---
name: do-it-audit
description: "Use when the user explicitly requests a deep repository or scoped audit; not for ordinary diff review."
---

# Deep Audit

An explicit deep audit authorizes inspection and diagnosis, not project edits.
Implementation authorization remains bounded by its granted scope and takes
effect after synthesis. Ordinary review, debugging, and small changes do not
inherit this skill's coverage or independent-synthesis requirements.

## Scope and independent inspection

Separate **where to inspect** from **which perspective to apply**. Use the user's
scope: repository, selected subsystems or paths, or a change and its affected
contracts. If missing, clarify scope without reopening settled choices.

After a bounded checkout and inventory pass, a host capable of delegation must
initiate independent professional review; do not finish a parent-only audit
before inviting reviewers. Prefer parallel independent work where dependencies
allow. Default substantive perspectives are correctness (`reviewer`), architecture
(`architecture-strategist`), and maintainability (`code-quality-cleaner`). Add
red-team, security, state, performance, or spec perspectives where relevant.
These are responsibilities, not a fixed worker count, model roster, or tool.

Map module/file and contract slices separately from perspectives. Every included
file has a base inspection owner; target overlapping specialist inspection at
risky cross-module contracts rather than making everyone read everything. Give
delegates the common scope, read-only boundary, settled constraints, and source
facts, their own lens, and only necessary project contracts. They need neither
all skill references nor the full repository or conversation. Label parent
hypotheses as hypotheses. The parent selects and excerpts only assigned lens
questions from the [audit lenses](references/lenses.md); do not hand every child
an all-role directory or section list. References are optional aids for concrete
questions, not instructions to transitively load the whole reference tree.

Delegates independently inspect their slices and return compact verified
findings, counterevidence, inspected scope, and gaps. Establish consequences and
violated contracts, or concrete maintenance costs and supported simplification
opportunities; defer repair proposals until independent synthesis. Keep slices
read-only, including probes and commands.

All maintained source in scope needs substantive inspection appropriate to its
file type and risks, including relevant tests, scripts, configuration, and
contract documentation. Inventory, assignment, searches, and hotspot sampling
do not establish full coverage. Use [coverage guidance](references/coverage.md)
for alternative integrity evidence on generated copies, locks, and assets and
for a compact parent-owned record of inspection and cross-file contracts.

## Independent causal synthesis

After independent initial findings and parent deduplication, assign the evidence
batch to a **fresh, independent agent context**, distinct from the parent and
initial reviewers. An existing architecture-strategist role can serve; no new
agent type is needed. Supply scope and coverage evidence, settled requirements,
source locations, findings, counterevidence, and rejected or disputed candidates.
Parent interpretations and repair ideas are hypotheses, not authority. Preserve
access to original evidence, but target verification of findings, causes, owners,
and refutations; do not rerun the whole audit.

The synthesizer must distinguish:

- Confirmed contract defects and independent local defects from risks or false
  positives; similar vocabulary does not establish a common cause.
- Genuinely undefined or contradictory semantics from established distinctions
  dropped in implementation, serialization, admission, or classification.
- Supported maintenance and simplification opportunities from optional taste;
  a concrete maintenance cost does not require a proven runtime bug.
- Causal groups and their narrowest responsible owners, counterevidence and
  refuted explanations, and uncertainty needing a discriminating check.

Challenge whether a repair would act on the wrong layer, suppress valid work,
or break an established requirement. "No common root established" is valid.
The parent reconciles the synthesis and coverage before recommending repairs.

If independent contexts are unavailable, explicitly report the capability
limitation and return an observations-only incomplete handoff to a capable
parent or native delegation mechanism. A delegate unable to launch agents hands
the batch back to the parent to arrange the fresh context. The parent cannot
self-substitute. While synthesis is unavailable or pending, withhold all repair
recommendations, including provisional ones; a renamed summary is not independence.

Reuse valid inspection and synthesis evidence across rounds and new synthesizers.
Follow up bounded gaps, critical uncertainty, conflicts, or new evidence/scope;
do not silently abandon agreed pending work. Revisit affected synthesis only for
a material new finding or causal change. There is no fixed round count and no
reread, reset, or loop merely to obtain a formal completion label. If completion
is impossible, report an honest partial result and the remaining work.

## Delivery

Report in this order: scope, completion and evidence; functional/contract bugs;
architecture and responsibilities; maintainability and cleanup; then disputes,
causes, priorities, and gaps. Distinguish confirmed bugs, risks, maintenance
costs, and optional improvements. Preserve counterevidence and refutations;
do not inflate severity from a suspicious name, TODO, style, or file size.

Completion requires substantive coverage of all included files, applicable
cross-file contracts, and fresh independent synthesis. Exclusions are not
inspected files. Coverage completion is neither a defect-free guarantee nor
runtime verification: name checks actually run and their limits. Use the
conversation unless the user requests a saved report; no mandatory Markdown
ledger, score dashboard, or persistent audit system is needed.
