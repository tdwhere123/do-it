---
name: do-it-verify
description: "Use when selecting evidence for a delivery claim, regression fix, installation, or branch closeout."
---

# Verify

Match evidence to the claim. A passing command establishes what that command
actually checked; it does not automatically establish user acceptance. Prefer
checks that exercise the affected behavior after the relevant change. Confirm
which checkout, inputs, assertions, and execution path produced the result. A
validator that inspected nothing, or a test runner that skipped the intended
case, cannot establish that its target is valid.

Consider whether evidence is stale, from another checkout, unrelated, simulated,
or incomplete. A green result can be manufactured: tests special-cased to the
fixture, hard-coded expected values, weakened or skipped assertions, deleted
failing tests, swallowed errors, or fallbacks that produce the expected output
without the intended mechanism. Check that the passing check would fail if the
claimed behavior were absent. For a failing-before claim, inspect the actual
failure: the predicted mismatch is evidence; an unrelated import, setup, or
runtime error is not. For a passing-after claim, inspect the relevant result rather
than only the enclosing shell's exit code: `failing-test; echo done` can return 0.

Reproduce the original symptom when verifying a bug fix and cover materially
affected paths that share its cause. Choose evidence from the causal claim, not
a fixed test count; a plausible diff or an unrelated green command does not close
it. Retain valid evidence and bound conclusions when paths remain unchecked.

Separate local correctness, host integration, and operation in a real deployment.
A source test does not prove that an installed package is discovered or invoked;
a discovered role name does not prove which instructions or permissions it uses.
Exercise the relevant native boundary when making those claims. Prefer the
artifact the user or caller would observe over compilation, logs, or a
delegate's claim. When a check disagrees with other evidence, inspect what each
actually observed; do not presume the code or the measurement is right. A
parent-only liveness check can pass if the child simply finished; it does not
prove cancellation or isolation. Do not contact external services or alter a
production contract just to obtain stronger proof than the task authorizes;
report that missing proof instead.

For a performance or eval number, name what limited it, the run-to-run noise,
and why the workload matches the decision. Do not treat a gain larger than the
changed piece's local cost as automatically invalid; trace secondary effects
(contention, queueing, cache, or critical path) or confirm the changed work ran
before attributing it.

Report the result and relevant check, plus material gaps or remaining risks.
Use NOT_VERIFIED when proof is missing, and explain what is missing. No fixed
acceptance table, status vocabulary, or report template is required unless the
user or project asks for one.

For branch closeout, inspect the intended diff and review state and follow the
user's authorized commit, merge, publication, or cleanup scope. Parent agents
integrate delegated results and verify the combined change. Hook silence and
diagnostic event records are not proof of completion.
