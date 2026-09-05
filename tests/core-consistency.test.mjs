import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { validateCoreConsistency } from "../scripts/validate-core-consistency.mjs";
const root = path.resolve(import.meta.dirname, "..");
test("generated Core and runtime copies match", () => {
  assert.deepEqual(validateCoreConsistency(root).errors, []);
});
test("generated consistency detects a changed Core copy", () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "do-it-consistency-"));
  try {
    for (const dir of ["hooks", "skills", "plugins"]) fs.cpSync(path.join(root, dir), path.join(temp, dir), { recursive: true, filter: (p) => !p.includes("node_modules") && !p.includes(".test-dist") });
    fs.appendFileSync(path.join(temp, "plugins/do-it/skills/do-it-core/SKILL.md"), "drift\n");
    assert.ok(validateCoreConsistency(temp).errors.some((error) => error.includes("do-it-core/SKILL.md") && error.includes("drifted")));
  } finally { fs.rmSync(temp, { recursive: true, force: true }); }
});
