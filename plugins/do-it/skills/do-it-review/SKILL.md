---
name: do-it-review
description: "Use to assess requirements and implementation quality independently, or to resolve a batch of review findings."
---

# Review

Keep two lenses distinct: **Spec** asks whether the implementation satisfies the
user's requirements, settled decisions, boundaries, and acceptance; **Standards**
asks whether its ownership, contracts, failure behavior, and maintainability are
sound. Passing either lens does not close a failure in the other.

Inspect the actual diff, callers, and relevant evidence. For an unclear design
or requirement, try reconstructing its behavior and path from the task and
artifacts. An inability to connect the promise, owner, and consumer exposes a gap;
do not invent intent or fill it in from the author's confident summary. Share the
reconstruction only when it clarifies a finding. An independent context is
valuable when the author or parent may be anchored: give the reviewer the
goal, scope, decisions, and source facts, not an authoritative parent verdict.
Let the reviewer gather evidence and reach their own conclusion.

Collect the complete finding batch before causal repairs when findings may share
a root. Cluster related failures, repair the rightful owner, and check the
repair's affected surface. Re-review depth follows new changes, remaining doubt,
and risk; no fixed number of reviewers or repair rounds applies.

For explicit deep audits, [Audit](../do-it-audit/SKILL.md) governs file, layer,
and chain coverage and fresh causal synthesis before repair proposals. Ordinary
reviews do not inherit that workflow.

For a candidate defect, name the input or state that reaches it, the contract it
violates, and the resulting consequence. Then look for the strongest reason it
might be false: an earlier guard, an intentional exception, a different owner,
or a caller that cannot produce that state. Trace the controlling code rather
than treating a suspicious API or missing local check as proof.

Use a bounded reproduction when it can discriminate the claim safely. A complete
static trace can also establish a defect; an unavailable runtime is not grounds
to discard sound source evidence. Conversely, a decisive missing deployment fact
stays an open question, not a confirmed failure. Distinguish what was observed
from what is inferred, and do not inflate impact beyond the demonstrated path.

A useful finding identifies its location, consequence, evidence, and needed
correction (deferred until synthesis during an audit). The correction is not
permission to edit during review-only work. Leave out style preference and
unreachable hypotheticals; distinguish blocking defects, important regressions,
and optional improvements. Do not claim clean while material findings remain
unresolved. Identify unchecked or deferred scope, using the user's vocabulary.

[Review lenses](../references/review-lenses.md) provide optional specialist detail;
for example, use the maintainability lens when an added abstraction, export,
dependency, or parallel implementation raises a concrete necessity or change-cost
question. Keep that inspection bounded to the change and affected contracts.
