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

## Deep-audit cases (R07–R10)

These small original synthetic repositories distinguish explicit, low-frequency
deep audits from ordinary review:

- **R07** requests a full-repository read-only audit. Every included file needs
  substantive inspection evidence, not just inventory. Component tests pass,
  but mapping drops tenantId before the worker reaches a ledger that already
  supports tenant-scoped event identity. A multi-angle review must be followed
  by a distinct fresh independent causal synthesis before repair recommendations.
- **R08** requests an audit of an explicit selected-file set, excluding `ops/`.
  Candidate findings share identity vocabulary but not a common semantic owner.
  Provider subject case folding and archive run collisions are independent
  dropped-contract defects; the global webhook uniqueness hypothesis is refuted;
  the documented lastSeen marker does not establish device or authentication
  promises. Synthesis must assess each candidate without inventing missing
  requirements, a universal identity owner, or a single root.
- **R09** is an ordinary bounded read-only review of zero amount formatting. It
  should answer the local question without activating a repo audit or inspecting
  the unrelated legacy key module.

- **R10** requests an audit of a passing maintenance fixture. Unreachable private
  code, duplicate totals mechanisms, and a single-use identity pipeline have
  independent maintenance costs. The external formatter export and its validation
  wrapper are intentional. An exact generated copy permits consistency evidence
  without redundant inspection by every delegate. Public-path tests and temporary
  removal/drift probes check these fixture facts, not model judgment.

On a capable host, R07/R08/R10 require actual independent multiview delegation
following scope and inventory. Reviewer, architecture, and cleaner perspectives
receive their own context and assigned module or contract slices. Assigned files,
inspected files, cross-file checks, and synthesis are distinct; reusable inspection
is valid. No fixed agent/model/round count or persistent report ledger is required.

When a delegate cannot launch an independent context, R07/R08/R10 also require an
incomplete observations-only handoff to a capable parent, not provisional repair
recommendations. The parent may arrange synthesis but cannot substitute itself.
The fixture package test commands are exercised by the local validator tests;
component success still does not establish the intentionally missing contracts.

These cases have **no canned model trajectories**. A dry run selects them but
returns `NOT_RUN` for each condition, even if the CLI exits 0. Each fixture's A1
is only an existing local test command; it is not proof of audit coverage or
causal reasoning. The remaining acceptance items are unscored by the existing
deterministic judge and require trajectory/source inspection in a separately
approved behavior probe. Current hard gates can catch writes and unsupported
verification claims, but cannot establish substantive per-file inspection,
fresh independent synthesis, causal/refutation quality, or read-only scope
expansion. The [manual trajectory rubric](rubrics/audit-trajectories.md) gives
positive and negative criteria, including an actual unavailable-capability variant.
That variant requires host capability evidence and is not a simulated orchestration
test. No reviewer count or live-obedience claim is inferred from fixtures.

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
