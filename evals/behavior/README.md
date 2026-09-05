# Behavior eval harness

Local fixtures exercise goal preservation, causal fixes, scope, relevant evidence,
and honest reporting. They test the evaluator and its examples; they do not prove
that a model or a native host will behave correctly. Ordinary `npm test` uses
fixtures and injected SDK fakes and never calls paid models.

## Conditions and scenarios

| Condition | Meaning |
| --- | --- |
| `vanilla` | no do-it |
| `legacy` | frozen do-it 0.16.0 tree at `8e85add081b2793fb39529e1a57a36155fe03847` |
| `kernel` | current do-it source and generated bundles; `candidate` is an alias |

The custom adaptive condition, profile staging, and profile activation scenarios
have been retired. Existing `baselines/` files remain historical evidence for
their recorded versions, conditions, prompts, and rubrics; they do not certify
the current simplification or control permission to change it.

Scenario YAML records the prompt, fixture, authorized actions, expected behavior,
and relevant failure checks. Its schema is internal test data, not a required
format for user task notes. The seed suite contains D01, D02, B01, B02, R03, R04,
R06, C01, and C04; `--suite release` selects all current scenarios.

Delegation counts are cost observations. They fail only where the scenario user
explicitly forbids delegation, not because a task has an assigned tier.

## Local use

```bash
node evals/behavior/validate.mjs
node evals/behavior/runner.mjs --dry-run --scenario D01
node evals/behavior/runner.mjs --dry-run --condition legacy --samples 2 --blind
node evals/behavior/report.mjs evals/behavior/baselines/0.16.0.json
node --test tests/behavior-eval*.test.mjs
```

`--dry-run` selects fixture replay. Only conditions with a corresponding canned
trajectory run; missing trajectories are `NOT_RUN`. A full seed replay includes
deliberately stale or irrelevant evidence and exits 1 when those gates fire.
That is evaluator coverage, not a model measurement.

Reports keep Correctness, Integrity, Cost, and Locality separate. No overall
score can hide a failing authorization or evidence check. Injection metering
counts host-delivered do-it context, including historical bootstrap forms;
assistant echoes are excluded. Run records retain model, condition, host, commit,
permissions, costs, and trajectory references.

## Optional live evaluation

Live evaluation requires separate authorization for external model calls and
cost. The existing Cursor and Pi adapters use their configured SDKs and models;
a missing SDK or credential produces `NOT_RUN`. CI blocks live calls unless
`DO_IT_EVAL_LIVE=1`. Do not enable that variable for ordinary checks.

An explicitly authorized comparison can use:

```bash
DO_IT_EVAL_LIVE=1 node evals/behavior/runner.mjs --backend live --host cursor,pi --scenario D01 --condition vanilla,legacy,kernel
```

Each run gets an isolated workspace and host settings. The frozen legacy plugin
is extracted from local Git history; the current plugin uses the current bundle.
Cursor uses its own API credential; Pi uses its configured DeepSeek credential.
Neither adapter uses OpenAI credentials. Raw output stays in gitignored `runs/`;
only reviewed aggregates and non-sensitive fixtures belong in version control.
