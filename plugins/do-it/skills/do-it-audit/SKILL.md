---
name: do-it-audit
description: "Use when the user explicitly requests a deep repository or scoped audit; not for ordinary diff review."
---

# Deep Audit

This is an explicitly requested big check, not the default review path. An audit
request alone authorizes inspection and diagnosis, not project edits or repairs.
Any implementation authorization remains bounded by its granted scope and takes
effect after synthesis. Ordinary review, debugging, and small changes do not
inherit this skill's coverage or independent-synthesis requirements.

## Scope and depth

Separate **where to inspect** from **which risks to investigate**. Use the user's
stated scope: the full repository, selected subsystems or paths, or a change and
its affected contracts. If scope is missing, offer those choices; ask about a
specialist focus only when it changes the examination. Do not repeat settled
choices or require a language/output-format interview.

Establish the checkout and file inventory. Every included file needs substantive
inspection, including relevant tests, configuration, scripts, and documentation;
listing paths or searching for patterns does not count as reading them. Track
read sections, remaining sections, exclusions with reasons, and cross-file
checks using the [coverage guidance](references/coverage.md). Do not quietly
replace a large audit with hotspot sampling. Unread included files mean partial
coverage, even if the examined files yielded no findings.

Use complementary perspectives appropriate to the selected risks. Reuse the
judgment in Review, Architecture, Code Quality, and Verify; the
[audit lenses](references/lenses.md) add deeper questions where applicable.
Divide large scopes into owned slices without losing their interactions. Choose
specialists and models for the work, not a fixed roster, quota, or tool framework.
Initial reviews should establish evidence and violated contracts, deferring
patch proposals until the finding batch has been examined together.

## Independent causal synthesis

After collecting the multi-angle findings, assign synthesis to a **fresh,
independent agent context**, not the parent or one of the initial reviewers.
An existing architecture-strategist role can serve; no new agent type is needed.
Give it the scope, coverage gaps, settled requirements, source locations and
observations, the complete finding batch, and rejected or disputed candidates.
Parent interpretations and existing repair proposals remain hypotheses, not an
authoritative diagnosis. The synthesizer must be able to inspect original evidence.

Its task is to challenge the proposed relationships:

- Do the findings share a causal owner, legal-state definition, authority, or
  producer-consumer contract, or merely similar vocabulary?
- Is meaning genuinely undefined or contradictory, or is an already-defined
  distinction lost in implementation, serialization, admission, or classification?
- Which findings are independent local defects, accepted policy, or false positives?
- Would a proposed repair act on the wrong layer, suppress valid work, or break
  another established requirement? What evidence would disprove the explanation?

Return supported causal groups and their narrowest responsible owners, findings
that must remain separate, refuted hypotheses that must not drive repairs, and
minimal discriminating checks for uncertainty. "No common root established" is
a valid result; a shared label is not a reason to redesign a subsystem.

The parent reconciles this analysis and coverage gaps before proposing repairs.
If a delegate cannot launch agents, hand the evidence batch back to a capable
parent to arrange the fresh context; the parent may coordinate, not replace it.
While independent synthesis is unavailable or pending, return observations,
coverage gaps, and that handoff only. Keep the audit incomplete and withhold
repair recommendations, including ones labeled provisional; neither parent
self-review nor a renamed findings summary fulfills this stage. New material
findings require revisiting the affected synthesis, not a fixed review count.

## Delivery

Present the diagnosis, supporting evidence, consequences, scope actually covered,
remaining uncertainty, and repair priorities justified by the synthesis. Preserve
refutations and distinguish observed behavior from suspected mechanisms. Do not
inflate finding severity or confidence from a suspicious name, TODO, or file size.

Completion requires inspection of all included files and applicable cross-slice
contracts, plus independent synthesis. Explicit exclusions are not inspected
files. A coverage-complete audit is neither a defect-free guarantee nor runtime
verification: name which checks actually ran and what they establish. Use the
conversation unless the user requests a saved report; no score dashboard, HTML,
fixed issue-card format, or persistent audit system is required.
