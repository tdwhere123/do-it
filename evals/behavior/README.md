# Behavior eval harness

Repeatable A/B eval for do-it conditions, separate from hook/unit CI.

This is **not** promotion evidence from a single run. Ordinary `npm test`
must not call paid/external models.

## Conditions

| Condition | Meaning |
| --- | --- |
| `vanilla` | no do-it |
| `legacy` | do-it 0.16.0 |
| `kernel` | candidate fixed kernel + thin runtime |
| `adaptive` | KERNEL + a specified adaptive profile |

Same fixture, same prompt, fresh workspace, same permissions. Sample
more than once before drawing conclusions.

`0.16.0.json` is the **behavior** baseline. The S00 static repo snapshot
is `baselines/0.16.0-repo.json` and must not be mixed in.

## Scenario contract

YAML under `scenarios/` must include `id`, `family`, `title`,
`repo_fixture`, `prompt`, `authorized_actions`, `contract`
(Goal / Boundary / Acceptance), `hard_failures` (≥1), and `metrics`.

Seed scenarios in this wave: D01, D02, B01, B02, R03, R04, R06, C01, C04.
Do not invent the remaining 24 here.

## Scoring

1. Deterministic hard gates fail the run even if a rubric looks good.
2. Report four independent faces: Correctness, Integrity, Cost,
   Locality (Maintainability).
3. Never emit a composite / overall / weighted score.

## Backends

| Backend | Status |
| --- | --- |
| `fixture` | **runnable** — replays canned trajectories, executes fixture tests, scores gates |
| `live` | **unimplemented** — do not fake a host/model run |

If model credentials are missing, record `NOT_RUN` for the model run and
still execute the fixture harness.

## CLI

```bash
node evals/behavior/validate.mjs
node evals/behavior/runner.mjs --dry-run --scenario D01
node evals/behavior/runner.mjs --scenario D01,D02 --condition legacy --dry-run
node evals/behavior/runner.mjs --dry-run --condition legacy --samples 2 --blind
node evals/behavior/report.mjs evals/behavior/baselines/0.16.0.json
```

`--dry-run` is the fixture backend. `--backend live` exits 2 and states
unimplemented. `--blind` hides the condition from the judge input; the
manifest still records it.

`--scenario D01` is the smoke dry-run (exit 0). A full seed dry-run
exits 1 because R03/R04/R06 default trajectories are canned honesty
failures that prove the hard gates; that is not a model measurement.

Each run record stores: `model`, `condition`, `repo_commit`,
`permissions`, `cost`, `trajectory_ref`.

## Layout

```text
evals/behavior/
  scenarios/*.yaml
  fixtures/<name>/{workspace,trajectories,fixture.json}
  rubrics/
  runner.mjs  validate.mjs  judge.mjs  report.mjs
  baselines/0.16.0.json
  runs/                 # gitignored raw output
```

Raw trajectories stay under `runs/` (gitignored). Commit only aggregates
and non-sensitive fixtures.

## Tests

`node --test tests/behavior-eval*.test.mjs` covers validate, the
deterministic judge, and dry-run only. Parent integration should add
those tests to ordinary `npm test` without adding `eval:behavior` model
calls.
