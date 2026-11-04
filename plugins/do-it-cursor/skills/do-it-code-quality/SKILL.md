---
name: do-it-code-quality
description: "Use when designing, changing, or debugging code to locate causal ownership and close the affected behavior."
---

# Code Quality

Trace the live behavior far enough to find the earliest divergence and the owner
of its meaning. A symptom at the UI, cache, or adapter does not establish that
layer as the right place for policy.

Useful questions include whether a legitimate mutation can bypass a check, and
whether a rule would survive replacement of the layer that currently implements
it. Map both producers and consumers when changing an API, schema, or boundary.

Prefer a direct durable change. Before adding a mechanism, look for an existing
one, including near-copies left by earlier sessions. Prepare structure only when
the current shape blocks the change or its verification. Include required
contract fallout; nearby cleanup earns its place through the problem being solved.
Do not change a public interface merely to make a local test convenient. A test
that needs a fake collaborator may need a better fixture, not a new production API.

For stateful work, consider applicable identity, interleaving, commit, retry,
and copied-state failures. The [stateful scan](../references/stateful-change-scan.md)
and [causal change notes](../references/causal-change.md) offer deeper prompts.
A regression should observe the changed contract with an expectation independent
of the implementation; use a focused probe when that is more informative.
[Verify](../do-it-verify/SKILL.md) owns evidence quality.

When attempts repeat the same failure without changing the evidence, revisit the
causal hypothesis rather than patching another nearby layer. A different error,
a narrowed cause, or a ruled-out explanation can be progress; repeated tool calls
alone establish neither progress nor a reason to abort.

An independent mapper or specialist can expose a mistaken causal model. Pass
source facts and label your interpretation as a hypothesis. See
[delegation](../references/workflow-kernel.md).
