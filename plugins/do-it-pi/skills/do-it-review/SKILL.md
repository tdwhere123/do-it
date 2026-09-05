---
name: do-it-review
description: "Use to assess requirements and implementation quality independently, or to resolve a batch of review findings."
---

# Review

Keep two lenses distinct: **Spec** asks whether the implementation satisfies the
user's requirements, settled decisions, boundaries, and acceptance; **Standards**
asks whether its ownership, contracts, failure behavior, and maintainability are
sound. Passing either lens does not close a failure in the other.

Inspect the actual diff, callers, and relevant evidence. An independent context
is valuable when the author or parent may be anchored: give the reviewer the
goal, scope, decisions, and source facts, not an authoritative parent verdict.
Let the reviewer gather evidence and reach their own conclusion.

Collect the complete finding batch before causal repairs when findings may share
a root. Cluster related failures, repair the rightful owner, and check the
repair's affected surface. Re-review depth follows new changes, remaining doubt,
and risk; no fixed number of reviewers or repair rounds applies.

A useful finding identifies its location, consequence, evidence, and needed
correction. Distinguish blocking defects, important regressions, and optional
improvements. Do not claim clean while material findings remain unresolved;
identify anything not checked or deliberately deferred. Use the user's review
vocabulary when one is specified.

[Review lenses](../references/review-lenses.md) provide optional specialist detail.
