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

Seed scenarios: D01, D02, B01, B02, R03, R04, R06, C01, C04.
`--suite release` loads all 28 YAML files under `scenarios/`.

## Scoring

1. Deterministic hard gates fail the run even if a rubric looks good.
2. Report four independent faces: Correctness, Integrity, Cost,
   Locality (Maintainability).
3. Never emit a composite / overall / weighted score.

`cost.injected_tokens` counts host-injected do-it text only: compact
kernel, `<do-it-bootstrap>`, `<system-reminder>`, and router/grill/
architecture/adaptive emissions. Assistant restatements of those
strings are not injection. A meter that only matches `Do-it kernel:`
will report legacy as 0.

## Backends

| Backend | Status |
| --- | --- |
| `fixture` | **runnable** — replays canned trajectories, executes fixture tests, scores gates |
| `live` | **runnable with credentials** — Cursor (`@cursor/sdk` local Agent + Grok 4.6 max) and Pi (`createAgentSession` + `deepseek-v4-flash` / `thinkingLevel: max`) |

Live never runs from ordinary `npm test`. CI blocks live unless
`DO_IT_EVAL_LIVE=1`. A missing SDK or credential is `NOT_RUN` for that
host — never a fake trajectory. Vanilla uses isolated settings (Cursor
`settingSources: []`; Pi temp `agentDir` with only the DeepSeek key).
Kernel / legacy / adaptive stage the matching plugin into that isolated
workspace. Legacy is the 0.16.0 baseline tree
(`8e85add081b2793fb39529e1a57a36155fe03847`).

Do not use official `OPENAI_API_KEY`. Do not use Pi `openai-codex` or
Pi `xai/grok-4.6` for this gate.

## CLI

```bash
node evals/behavior/validate.mjs
node evals/behavior/runner.mjs --dry-run --scenario D01
node evals/behavior/runner.mjs --scenario D01,D02 --condition legacy --dry-run
node evals/behavior/runner.mjs --dry-run --condition legacy --samples 2 --blind
node evals/behavior/report.mjs evals/behavior/baselines/0.16.0.json

# Live (paid; not part of npm test)
export DO_IT_EVAL_LIVE=1
export CURSOR_API_KEY=...          # Cursor Dashboard → Integrations
# Pi reads ~/.pi/agent/auth.json deepseek API key only
node evals/behavior/runner.mjs --backend live --host cursor --scenario D01 --condition vanilla,legacy,kernel,adaptive
node evals/behavior/runner.mjs --backend live --host pi --scenario D01 --condition vanilla,legacy,kernel,adaptive
node evals/behavior/runner.mjs --backend live --host pi --suite release --samples 2
node evals/behavior/runner.mjs --backend live --host cursor,pi --suite release --samples 2
```

`--dry-run` always selects the fixture backend. `--backend live` with
no runnable host exits 2 and records `NOT_RUN`. `--host` selects
`cursor` and/or `pi`. `--blind` hides the condition from the judge
input; the manifest still records it.

`--scenario D01` is the smoke dry-run (exit 0). A full seed dry-run
exits 1 because R03/R04/R06 default trajectories are canned honesty
failures that prove the hard gates; that is not a model measurement.

Each run record stores: `model`, `condition`, `host`, `repo_commit`,
`permissions`, `cost`, `trajectory_ref`.

## Layout

```text
evals/behavior/
  scenarios/*.yaml
  fixtures/<name>/{workspace,trajectories,fixture.json}
  rubrics/
  runner.mjs  validate.mjs  judge.mjs  report.mjs
  hosts/cursor-sdk.mjs hosts/pi-sdk.mjs
  baselines/0.16.0.json
  runs/                 # gitignored raw output
```

Raw trajectories stay under `runs/` (gitignored). Commit only aggregates
and non-sensitive fixtures.

## Tests

`node --test tests/behavior-eval*.test.mjs` covers validate, the
deterministic judge, fixture dry-run, and live adapters with injected
fakes. Ordinary `npm test` still must not call paid SDKs. Do not export
`DO_IT_EVAL_LIVE` in CI. Real model runs use the live CLI above
(`DO_IT_EVAL_LIVE=1 node evals/behavior/runner.mjs --backend live ...`).

## Live evidence (S19)

Pi `--suite release --samples 2` × `{vanilla,legacy,kernel,adaptive}`
already ran on 2026-09-01 into gitignored
`evals/behavior/runs/2026-09-01-s19-release-pi/` (224 runs, exit 1,
hard-gate failures). Commit-able aggregate:
`baselines/candidate-0.17-s19-release-pi.json`. Some C02/C03 samples are
`NOT_RUN` (Pi live timed out after 300000ms).

Cursor full 28 × 4 × samples=2 matrix is **NOT_RUN** (`CURSOR_API_KEY`
unset). Earlier probe serialization leaked that key into gitignored
aggregates — rotate; do not paste or reuse it. Claude / Codex /
OpenCode / Kimi live remain **NOT_VERIFIED**.

S16 Phase B (delete router) is **NO-GO** until kernel vs live-legacy
hard gates are not mixed and Cursor is no longer missing. Four faces,
no composite score.
