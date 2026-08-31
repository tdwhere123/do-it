import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

import {
  validateTaskContract,
  validateTaskContractFile
} from "../scripts/validate-task-contract.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixtures = path.join(repoRoot, "tests/fixtures/task-contracts");
const validator = path.join(repoRoot, "scripts/validate-task-contract.mjs");

test("valid minimal contract is accepted", () => {
  assert.deepEqual(
    validateTaskContractFile(path.join(fixtures, "valid-minimal.md")),
    []
  );
});

test("missing required heading is rejected", () => {
  const errors = validateTaskContractFile(path.join(fixtures, "invalid-missing-goal.md"));
  assert.ok(errors.some((error) => error.includes("missing required heading ## Goal")));
});

test("duplicate acceptance ids are rejected", () => {
  const errors = validateTaskContractFile(path.join(fixtures, "invalid-duplicate-aid.md"));
  assert.ok(errors.some((error) => error.includes("duplicate acceptance id A1")));
});

test("progress checkboxes are rejected", () => {
  const errors = validateTaskContractFile(
    path.join(fixtures, "invalid-progress-checkbox.md")
  );
  assert.ok(errors.some((error) => error.includes("progress checkbox is not allowed")));
});

test("decisions without provenance tags are rejected", () => {
  const source = `# X

## Goal
Done.

## Decisions
- D1 Ship it tomorrow.

## Boundary
- In: src

## Acceptance
- A1 It ships
`;
  const errors = validateTaskContract(source, "no-tag.md");
  assert.ok(errors.some((error) => error.includes("provenance tag")));
});

test("CLI accepts the valid fixture and rejects invalid ones", () => {
  const ok = spawnSync(process.execPath, [validator, path.join(fixtures, "valid-minimal.md")], {
    encoding: "utf8"
  });
  assert.equal(ok.status, 0, ok.stderr);

  const bad = spawnSync(
    process.execPath,
    [validator, path.join(fixtures, "invalid-missing-goal.md")],
    { encoding: "utf8" }
  );
  assert.equal(bad.status, 1);
  assert.match(bad.stderr, /missing required heading ## Goal/);
});
