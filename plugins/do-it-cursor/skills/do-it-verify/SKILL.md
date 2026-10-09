---
name: do-it-verify
description: "Use when selecting evidence for a delivery claim, regression fix, installation, or branch closeout."
---

# Verify

Match evidence to the claim. A passing command establishes what that command
actually checked; it does not automatically establish user acceptance. Prefer
checks that exercise the affected behavior after the relevant change. Confirm
that the intended items or assertions were actually checked: a validator that
inspects nothing cannot establish that its target is valid.

Consider whether evidence is stale, from another checkout, unrelated, simulated,
or incomplete. Local tests can establish local behavior without establishing
production operation. Reproduce the original symptom when verifying a bug fix
and cover materially affected paths that share its cause. Choose evidence from
the causal claim, not a fixed test count; a plausible diff or an unrelated green
command does not close it. Retain relevant valid evidence, and bound conclusions
when affected paths remain unchecked. Exercise package and host integration
when claiming an installation works.

Report the result and relevant check, plus material gaps or remaining risks.
Use NOT_VERIFIED when proof is missing, and explain what is missing. No fixed
acceptance table, status vocabulary, or report template is required unless the
user or project asks for one.

For branch closeout, inspect the intended diff and review state and follow the
user's authorized commit, merge, publication, or cleanup scope. Parent agents
integrate delegated results and verify the combined change. Hook silence and
diagnostic event records are not proof of completion.
