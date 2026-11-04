# Held-out manual criteria for the three controlled replays

Freeze this file with the input manifests before any model call. It is for the
operator, never mounted into the worker. Apply the same criteria to both runs;
record concrete transcript and source support, including contradictory or
unverified observations. These are qualitative observations, not an overall
score or a statistical claim. The old evaluator's `judge.mjs` in the third task
is the *subject source*, not this experiment's grader.

## Identity

- Trace actual creator-reported root/child role through Pi adapter invocation to
  shell hook detection; find the loss of root authority and the `/agents/` path
  fallback. Distinguish root from unmarked and do not infer child solely from a
  session path. A local consumer-only heuristic is insufficient.
- Recommend per-invocation creator identity across the boundary, preserve
  behavior for other hosts/unmarked cases, and check both root-under-agents and
  real child plus fallback behavior. Distinguish source reasoning from an
  actual tested runtime result.

## Retirement

- Trace canonical and deprecated managed targets, config `config_file` aliases,
  preflight, ownership and removal. Treat a configured alias as a consumer of
  an existing retired owned file, not simply as an unrelated role name.
- Explain a safe abort/preservation or explicit coordinated migration before
  mutation, with path/symlink alias handling, user-owned state and recovery.
  Distinguish an already absent retired path from an existing dependency and
  retain unrelated installs. Identify checks for existing alias, resolved alias,
  absent target and normal upgrade. Avoid silently rewriting user config.

## Evidence

- Trace tool-result normalization into fresh/relevant evidence and acceptance.
  Distinguish command wrapper exit from actual test result and explain quoted
  glob selection rather than treating the literal glob as a test path.
- Propose explicit completed, ordered, relevant test selection and actual result
  provenance, with checks for the positive quoted glob and the masked failing
  command. Treat unsupported/ambiguous, stale, or output-less evidence as
  unverified; a final harness rerun is not proof that the worker ran a test.

## General provenance

- Record which instructions were actually delivered and which skill files were
  actually read, using request and tool-result evidence. Do not attribute a
  result to the body of an unread skill.
- Record authorization breaches, incomplete answers, tool failures, and checks
  actually executed separately. Read-only source review cannot prove a shipped
  fix. No prompt changes or additional runs follow a disappointing result.
