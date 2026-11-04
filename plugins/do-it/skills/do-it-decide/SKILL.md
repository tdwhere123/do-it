---
name: do-it-decide
description: "Use when uncertainty about a choice, plan, dependency, or handoff could materially change what gets built."
---

# Decide

Find the uncertainty that can change the outcome, authority, scope, reversibility,
or credible verification. State competing explanations and the observation that
would distinguish them. Choose the smallest useful check: repository inspection,
a primary source, a focused experiment, a user decision, or independent analysis.
More reading helps only if it can change the choice; there is no prescribed order.

Compare alternatives on a meaningful tradeoff, not a list of labels. Explain
which constraint makes each viable option win and who pays its migration,
operation, or recovery cost. A declared dependency, for example, does not prove
which implementation a running system uses. When one option meets the actual
requirements with less complexity and no hidden caller cost, choose it. When the
choice is consequential and the codebase has no close precedent, compare two or
three options that differ in structure, not labels. Ordinary edits do not need a
design bake-off.

If implementation convenience and the consumer's experience conflict, name the
consumer (end user, caller, or next reader) and prefer their experience unless a
settled constraint says otherwise.

Preserve settled decisions unless new evidence invalidates their basis. Mark
assumptions as assumptions. Ask for a material preference or missing fact the
environment cannot provide; do not turn readable facts into an interview.

Start authorized work when remaining uncertainty is reversible or best resolved
through implementation. Advance in independently checkable units; a later unit
should not be the first proof that an earlier one worked. Do not pause authorized
reversible work to ask whether to proceed; still stop for intent, authority,
secrets, spend, destruction, or push. Do not turn a useful experiment into a
prerequisite for unrelated, already authorized work. An independent challenger
should test the load-bearing premise or offer a cheaper credible route, not
reopen every settled choice. Pass facts and decisions separately from hypotheses.

Keep continuity in chat or existing project docs. When a durable handoff helps,
record the goal, settled decisions, boundary, acceptance, and unresolved question
in the project's natural format. [Task notes](../references/task-contract.md)
offer an example, not a required document grammar.
