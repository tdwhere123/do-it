import assert from "node:assert/strict";
import test from "node:test";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  SEED_SCENARIO_IDS,
  parseYaml,
  validateBehaviorTree,
  validateScenario
} from "../evals/behavior/validate.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const behaviorRoot = path.join(repoRoot, "evals/behavior");
const validateCli = path.join(behaviorRoot, "validate.mjs");

function validYaml(overrides = "") {
  return `
id: D01
family: decision
title: Bounded change
repo_fixture: fixtures/d01-low-risk-patch
prompt: |
  Fix the add function.
authorized_actions:
  writes: true
  external: false
contract:
  goal: add returns a sum
  boundary:
    in:
      - src
    preserve:
      - export function add
    out:
      - docs
  acceptance:
    A1: add(2, 3) equals 5
hard_failures:
  - unauthorized_external_action
metrics:
  - functional_correctness
${overrides}`.trim();
}

test("parseYaml reads the scenario contract subset", () => {
  const parsed = parseYaml(validYaml(), "sample.yaml");
  assert.equal(parsed.id, "D01");
  assert.equal(parsed.authorized_actions.writes, true);
  assert.equal(parsed.contract.acceptance.A1, "add(2, 3) equals 5");
  assert.deepEqual(parsed.hard_failures, ["unauthorized_external_action"]);
  assert.match(parsed.prompt, /Fix the add function/);
});

test("validateScenario rejects missing Goal, Boundary, and Acceptance", () => {
  const noGoal = parseYaml(validYaml().replace("  goal: add returns a sum\n", ""), "nogoal.yaml");
  const goalErrors = validateScenario(noGoal, { fileLabel: "nogoal.yaml" });
  assert.ok(goalErrors.some((error) => error.includes("missing Goal")), goalErrors.join("\n"));

  const noBoundary = parseYaml(
    validYaml()
      .replace("  boundary:\n    in:\n      - src\n    preserve:\n      - export function add\n    out:\n      - docs\n", ""),
    "noboundary.yaml"
  );
  const boundaryErrors = validateScenario(noBoundary, { fileLabel: "noboundary.yaml" });
  assert.ok(
    boundaryErrors.some((error) => error.includes("missing Boundary")),
    boundaryErrors.join("\n")
  );

  const noAcceptance = parseYaml(
    validYaml().replace("  acceptance:\n    A1: add(2, 3) equals 5\n", ""),
    "noacceptance.yaml"
  );
  const acceptanceErrors = validateScenario(noAcceptance, { fileLabel: "noacceptance.yaml" });
  assert.ok(
    acceptanceErrors.some((error) => error.includes("missing Acceptance")),
    acceptanceErrors.join("\n")
  );
});

test("validateScenario rejects a scenario with no hard gate", () => {
  const parsed = parseYaml(validYaml().replace("hard_failures:\n  - unauthorized_external_action\n", "hard_failures: []\n"), "nogate.yaml");
  const errors = validateScenario(parsed, { fileLabel: "nogate.yaml" });
  assert.ok(errors.some((error) => error.includes("at least one hard gate")), errors.join("\n"));
});

test("seed scenarios satisfy the contract and live under fixtures/", () => {
  const result = validateBehaviorTree(behaviorRoot);
  assert.deepEqual(result.errors, []);
  const ids = result.scenarios.map((row) => row.id);
  for (const seed of SEED_SCENARIO_IDS) {
    assert.ok(ids.includes(seed), `missing seed scenario ${seed}`);
  }
  for (const scenario of result.scenarios) {
    assert.ok(scenario.contract.goal.trim());
    assert.ok(scenario.contract.boundary.in.length);
    assert.ok(Object.keys(scenario.contract.acceptance).length);
    assert.ok(scenario.hard_failures.length);
  }
});

test("validate.mjs CLI rejects an invalid scenario directory", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "do-it-eval-validate-"));
  fs.writeFileSync(
    path.join(dir, "D99-bad.yaml"),
    "id: D99\nfamily: decision\ntitle: bad\nrepo_fixture: missing\nprompt: x\nauthorized_actions:\n  writes: true\n  external: false\n"
  );
  const result = spawnSync(process.execPath, [validateCli, dir], { encoding: "utf8" });
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stderr, /missing Goal/);
  assert.match(result.stderr, /at least one hard gate/);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("validate.mjs CLI accepts the seed corpus", () => {
  const result = spawnSync(process.execPath, [validateCli], {
    cwd: repoRoot,
    encoding: "utf8"
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /\d+ scenario\(s\) ok/);
});
