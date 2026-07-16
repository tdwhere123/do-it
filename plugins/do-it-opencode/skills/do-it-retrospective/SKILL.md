---
name: do-it-retrospective
description: "Use only when the user explicitly asks to enable, disable, inspect, report, or persist opt-in local do-it behavioral feedback."
disable-model-invocation: true
---

# Do-It Retrospective

Turn local behavioral feedback into a small, testable improvement — not a new
rule pile. The recorder is disabled by default and never changes behavior by
itself.

## First Move

- To enable: send the exact text `/do-it-retrospective on` when the host passes
  it to prompt hooks. To disable: `/do-it-retrospective off`. Use
  `/do-it-retrospective status` for state only and
  `/do-it-retrospective report` for a local report.
- Read only the current project's
  `.do-it/runtime/retrospective/events.jsonl`. It is local and gitignored.
- In a Git checkout, runtime state uses that worktree's local exclude; it never
  edits the project's tracked `.gitignore`.
- Treat each excerpt as a fallible, redacted user observation, not a complete
  transcript or a verdict about the model.

Some hosts do not expose plugin slash commands. There, use the same exact text
when it reaches the chat prompt, or ask to enable retrospective logging or
produce a retrospective report in plain language; do not claim a native command
exists. A bare `/do-it-retrospective` shows usage rather than exposing a report.

## Light — Status or One Event

Report whether the local recorder is enabled and summarize one event. Do not
edit instructions, plugin code, or the event log.

## Standard — Review Local Signals

1. Validate each JSONL line; ignore malformed lines and say how many were
   skipped.
2. Group repeated signals by observed behavior (for example, delegation,
   action-boundary handling, or unnecessary workflow noise).
3. Use this compact report shape:

       Retrospective report
       - Recorder: enabled/disabled; valid/skipped events; observed date range
       - Repeated signals: grouped observations, not raw excerpts
       - Candidate lessons (at most 3): observation → likely cause → smallest
         rule or code change → evidence still missing
       - No action yet: one-off or ambiguous observations that need recurrence

4. Separate a one-off bad outcome from a repeatable policy gap. Prefer a test
   or a narrowly scoped hook repair over a vague instruction.

## Heavy — Persist a Lesson

Heavy is parent-owned unless explicitly assigned. Before writing a durable
instruction, show the exact target file and exact proposed wording, then ask
one decision at a time for confirmation.

- Edit an existing `AGENTS.md` or `CLAUDE.md` only after that confirmation.
- If neither exists, stop and ask which target the user wants; do not create a
  new instruction file by default.
- Never add raw feedback excerpts, session IDs, paths, credentials, or a
  changelog of incidents to an instruction file.
- Do not commit, push, open a PR, or change the recorder setting unless the
  user separately asks.

## Stop Conditions

Stop at reporting when logging is disabled, the log is absent, evidence is a
single ambiguous event, the target instruction file is unclear, or the proposed
lesson would broaden scope beyond the observed pattern.

## Common Rationalizations

- *"One frustrated message proves a new global rule is needed."* — It is a
  signal; find recurrence or a concrete broken contract first.
- *"The recorder captured it, so it is safe to paste into AGENTS.md."* — Keep
  local excerpts local; persist only an approved, general lesson.
- *"A retrospective must fix the plugin immediately."* — Diagnose first;
  implementation needs its own scoped request and proof.

## Red Flags

- Recorder is enabled by implication rather than an exact user choice.
- A summary exposes redacted text, local paths, or secret-like material.
- A candidate rule names a single incident instead of a reusable boundary.
- An instruction file is edited before the user confirms its exact wording.

## Verification

Before claiming a retrospective is complete, report: recorder status; number
of valid and skipped events; recurring signals; confirmed file changes, if any;
and the fresh check that proves the resulting instruction or implementation.
