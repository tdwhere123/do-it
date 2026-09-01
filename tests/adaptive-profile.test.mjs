import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

import {
  MAX_ACTIVE,
  MAX_STATEMENT_CHARS,
  SCHEMA_ID,
  classifyActiveBullet,
  validateAdaptiveProfile,
  validateAdaptiveProfileFile
} from "../scripts/validate-adaptive-profile.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixtures = path.join(repoRoot, "tests/fixtures/adaptive");
const validator = path.join(repoRoot, "scripts/validate-adaptive-profile.mjs");

function profile(activeLines) {
  return `---
schema: ${SCHEMA_ID}
---

## Active
${activeLines}
`;
}

test("valid fixture is accepted", () => {
  assert.deepEqual(validateAdaptiveProfileFile(path.join(fixtures, "valid.md")), []);
});

test("empty Active is within the 0–8 budget", () => {
  assert.deepEqual(validateAdaptiveProfile(profile(""), "empty.md"), []);
});

test("oversize Active is rejected", () => {
  const errors = validateAdaptiveProfileFile(path.join(fixtures, "invalid-oversize.md"));
  assert.ok(errors.some((error) => error.includes(`Active exceeds ${MAX_ACTIVE} bullets`)));
});

test("duplicate P### ids are rejected", () => {
  const errors = validateAdaptiveProfileFile(path.join(fixtures, "invalid-duplicate-id.md"));
  assert.ok(errors.some((error) => error.includes("duplicate id P001")));
});

test("illegal scope is rejected", () => {
  const errors = validateAdaptiveProfileFile(path.join(fixtures, "invalid-illegal-scope.md"));
  assert.ok(errors.some((error) => error.includes("illegal scope [router]")));
});

test("Core-weakening statements are rejected", () => {
  const errors = validateAdaptiveProfileFile(path.join(fixtures, "invalid-core-weaken.md"));
  assert.ok(errors.some((error) => error.includes("honesty/boundary weaken")));
});

test("paths, secrets, and raw events are rejected", () => {
  const errors = validateAdaptiveProfileFile(path.join(fixtures, "invalid-banned-content.md"));
  assert.ok(errors.some((error) => error.includes("banned path, secret, event, or rationale")));
});

test("unknown headings and Core rule restatement are rejected", () => {
  const headingErrors = validateAdaptiveProfile(
    `---
schema: ${SCHEMA_ID}
---

## Active
- P001 [all] Resolve low-risk reversible ambiguity autonomously instead of asking.

## Notes
Stored incident.
`,
    "notes.md"
  );
  assert.ok(headingErrors.some((error) => error.includes("unknown heading ## Notes")));

  const restated = classifyActiveBullet(
    "P001",
    "all",
    "Keep r-verify optional when a green command already ran."
  );
  assert.equal(restated, "core-weaken");
});

test("statement length and id shape are bounded", () => {
  assert.equal(MAX_STATEMENT_CHARS, 120);
  const long = "A".repeat(MAX_STATEMENT_CHARS + 1);
  assert.equal(classifyActiveBullet("P001", "all", long), "overlong");
  assert.equal(classifyActiveBullet("P1", "all", "Keep deltas short."), "bad-id");
  assert.equal(
    classifyActiveBullet(
      "P001",
      "all",
      "Resolve low-risk reversible ambiguity autonomously instead of asking."
    ),
    null
  );
});

test("CLI accepts the valid fixture and rejects invalid ones", () => {
  const ok = spawnSync(process.execPath, [validator, path.join(fixtures, "valid.md")], {
    encoding: "utf8"
  });
  assert.equal(ok.status, 0, ok.stderr);
  assert.match(ok.stdout, /validate-adaptive-profile: .*valid\.md ok/);

  const bad = spawnSync(
    process.execPath,
    [validator, path.join(fixtures, "invalid-duplicate-id.md")],
    { encoding: "utf8" }
  );
  assert.equal(bad.status, 1);
  assert.match(bad.stderr, /duplicate id P001/);
});
