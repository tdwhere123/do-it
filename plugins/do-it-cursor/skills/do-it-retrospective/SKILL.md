---
name: do-it-retrospective
description: "Use only when the user explicitly asks to enable, disable, inspect, report, or persist opt-in local do-it learning events."
disable-model-invocation: true
---

# Do-It Retrospective

Turn local learning events into a small, testable improvement — not a new
rule pile. The recorder is disabled by default and never changes behavior by
itself. Events are observations, not active policy. Never auto-write
`do-it-adaptive` profile files or `do-it-core`.

## First Move

- To enable: send the exact text `/do-it-retrospective on` when the host passes
  it to prompt hooks. To disable: `/do-it-retrospective off`. Use
  `/do-it-retrospective status` for state only and
  `/do-it-retrospective report` for a local report.
- Read `.do-it/runtime/events/learning.jsonl` (canonical) and, if present, the
  legacy `.do-it/runtime/retrospective/events.jsonl`. Both are local and
  gitignored.
- In a Git checkout, runtime state uses that worktree's local exclude; it never
  edits the project's tracked `.gitignore`.
- Treat each row as a fallible, redacted observation (user feedback or
  objective workflow metadata), not a transcript, verdict, or permission to
  activate a rule.

Some hosts do not expose plugin slash commands. There, use the same exact text
when it reaches the chat prompt, or ask to enable retrospective logging or
produce a retrospective report in plain language; do not claim a native command
exists. A bare `/do-it-retrospective` shows usage rather than exposing a report.

## Light — Status or One Event

Report whether the local recorder is enabled and summarize one event. Do not
edit instructions, plugin code, the event log, adaptive profile, or Core.

## Standard — Review Local Signals

1. Validate each JSONL line; ignore malformed lines and say how many were
   skipped. Do not print raw excerpts, paths, secrets, or session IDs.
2. Group repeated signals by observed behavior (delegation, completion-after-edit,
   scope creep, review blocking, host gap).
3. Judge cause before proposing a rule: code/test, project truth, task
   contract, host observability gap, or adaptive candidate.
4. Use this compact report shape:

       Recorder / observability
       Event coverage and gaps
       Repeated failure signals
       Candidate policies (max 3)
       Counterexamples / competing causes
       Recommended action:
         no-action | code/test fix | project truth fix | task-contract fix | host gap | adaptive candidate
       Evidence still missing

5. A single event defaults to `no-action`. Prefer a test or a narrowly scoped
   hook repair over a prompt delta.

The report does not write `.do-it/runtime/adaptive/profile.md`, global
adaptive profile, `do-it-core`, or the Core TSV.

## Heavy — Persist a Lesson

Heavy is parent-owned unless explicitly assigned. Show the exact target file
and exact proposed wording, then ask one decision at a time.

- Edit an existing `AGENTS.md` or `CLAUDE.md` only after that confirmation.
- Never write adaptive profile or Core from this skill (`core §r-scope`).
  Promotion is `do-it-adaptive` after the user confirms exact wording.
- If neither instruction file exists, stop and ask which target the user
  wants; do not create a new instruction file by default.
- Never add raw excerpts, session IDs, paths, credentials, or an incident
  changelog to an instruction file.
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
- *"A retrospective must activate an adaptive profile."* — Observation stays
  observation; Active deltas need confirmation and independent evidence.
- *"A retrospective must fix the plugin immediately."* — Diagnose first;
  implementation needs its own scoped request and proof.

## Red Flags

- Recorder is enabled by implication rather than an exact user choice.
- A summary exposes redacted text, local paths, or secret-like material.
- A candidate rule names a single incident instead of a reusable boundary.
- Profile or Core is edited from a report.
- An instruction file is edited before the user confirms its exact wording.

## Verification

Before claiming a retrospective is complete, report: recorder status; number
of valid and skipped events; recurring signals; recommended action; that
profile and Core were not modified; confirmed file changes, if any; and the
fresh check that proves the resulting instruction or implementation.
