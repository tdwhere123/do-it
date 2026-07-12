# Integrity

A failure, error, surprising result, or red flag is a clue to investigate — not
an obstacle to make disappear. When something does not work:

1. Trace it to a root cause before changing anything. A symptom you cannot
   explain is not understood.
2. Never make a symptom vanish without explaining it. These are cover-ups, not
   fixes:
   - swallowing an exception or emptying a `catch`;
   - weakening, loosening, or deleting an assertion so a check passes;
   - deleting, skipping, or `xfail`-ing a failing test instead of fixing the cause;
   - commenting out failing code or returning early past it;
   - adding a fallback or default that hides why the primary path failed;
   - editing the evidence (expected output, snapshot, fixture) instead of the behavior.
3. Report honestly. State what was verified, what was not, and what is still
   broken. "I could not verify X" or "this still fails because Y" is a correct,
   useful answer; a false "done" is a defect.

This principle binds the parent agent and every subagent. `do-it-code-quality`
(debugging), `do-it-review` (fix), and `do-it-verify` enforce it at their
stages; reviewers treat a cover-up as a Blocking finding.

## Write-Time Signals

The `write-quality-lint` hook (L0, advisory) flags newly-added lines that match
integrity-related families:

| Family | Signal |
|---|---|
| `swallow-error` | empty `catch`, `except: pass`, no-op `.catch(() => {})` |
| `test-weakened` | new `skip` / `xit` / `@pytest.mark.skip` / `it.skip` |

A hook hit is not proof of wrong behavior — confirm or refute in review. See
[`write-quality-families.md`](write-quality-families.md).
