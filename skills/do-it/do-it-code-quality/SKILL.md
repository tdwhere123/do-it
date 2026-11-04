---
name: do-it-code-quality
description: "Use when designing, changing, or debugging code to locate causal ownership and close the affected behavior."
---

# Code Quality

Trace the live behavior far enough to find the earliest divergence and the owner
of its meaning. A symptom at the UI, cache, or adapter does not establish that
layer as the right place for policy. A missing identity at the creator is not
repaired by more heuristics at the consumer.

Useful questions include whether a legitimate mutation can bypass a check, and
whether a rule would survive replacement of the layer that currently implements
it. Map both producers and consumers when changing an API, schema, or boundary.

Prefer a direct durable change. Before adding a mechanism, look for an existing
one, including near-copies left by earlier sessions. Prepare structure only when
the current shape blocks the change or its verification. Include required
contract fallout; nearby cleanup earns its place through the problem being solved.
The smallest correct change is not the fewest lines: repeating the same decision
in several places is larger than giving it one owner. Collapsing a forwarding
layer is not smaller if that layer is the contract, policy, dependency, or
compatibility boundary. Remove leftover complexity that would force a new
layer, without dropping a compatibility, recovery, or history obligation the
contract still needs. Do not change a public interface merely to make a local
test convenient. A test that needs a fake collaborator may need a better fixture,
not a new production API.

For stateful work, consider applicable identity, interleaving, commit, retry,
and copied-state failures. The [stateful scan](../references/stateful-change-scan.md)
and [causal change notes](../references/causal-change.md) offer deeper prompts.

When attempts repeat the same failure without changing the evidence, revisit the
causal hypothesis rather than patching another nearby layer. If several fixes
assumed the same fact, write that premise and make an observation that would
differ if it were false before writing another fix. A path that always cleans up
after one side loses is compensating for the premise, not testing it. A different
error, a narrowed cause, or a ruled-out explanation can be progress; repeated tool
calls alone establish neither progress nor a reason to abort.

Silently normalizing or swallowing an impossible internal state hides the fault.
Rejecting invalid external input at the boundary that admits it is fail-fast, not
a symptom patch. If the producer is inside the owned chain, repair it there; keep
needed defensive containment while that cause is fixed.

A regression should observe the changed contract with an expectation independent
of the implementation; use a focused probe when that is more informative.
Imagine two edits: a wrong observable result should fail the check, and a
restructure that preserves observables should not.
[Verify](../do-it-verify/SKILL.md) owns evidence quality.

When the work is a sweep of similar edits or a check a reviewer must rerun, a
small rerunnable script can be the change. Learn the recipe on one unit first.
Do not invent a framework for a couple of obvious edits, and do not fan out
delegates to hand-apply what a script can do.

An independent mapper or specialist can expose a mistaken causal model. Pass
source facts and label your interpretation as a hypothesis. See
[delegation](../references/workflow-kernel.md).
