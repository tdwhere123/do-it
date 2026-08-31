import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const skillPath = path.join(repoRoot, "skills/do-it/do-it-code-quality/SKILL.md");
const causalPath = path.join(repoRoot, "skills/do-it/references/causal-change.md");

const LOOP_NAMES = ["Trace", "Locate", "Change", "Stress", "Prove", "Settle"];

const FORBIDDEN_SKILL_NAMES = [
  "do-it-idempotency",
  "do-it-retries",
  "do-it-cache",
  "do-it-tdd",
  "do-it-debugging",
  "do-it-comments-discipline",
  "do-it-worktree-isolation"
];

function readSkill() {
  assert.equal(fs.existsSync(skillPath), true, `missing ${skillPath}`);
  return fs.readFileSync(skillPath, "utf8");
}

test("build kernel is significantly shorter than the 0.16 baseline", () => {
  const source = readSkill();
  const bytes = Buffer.byteLength(source, "utf8");
  const lines = source.split(/\n/).length;
  assert.ok(bytes < 4800, `SKILL.md is ${bytes} bytes; expected significantly under 6153`);
  assert.ok(lines < 95, `SKILL.md is ${lines} lines; expected significantly under 108`);
});

test("hot path names the six loop stages in order", () => {
  const source = readSkill();
  const headings = [...source.matchAll(/^## (.+)$/gm)].map((match) => match[1]);
  const indexes = LOOP_NAMES.map((name) => headings.indexOf(name));
  assert.ok(
    indexes.every((index) => index >= 0),
    `missing loop heading; found: ${headings.join(", ")}`
  );
  assert.deepEqual(
    [...indexes].sort((a, b) => a - b),
    indexes,
    "loop headings must keep Trace → Locate → Change → Stress → Prove → Settle"
  );
});

test("patch-or-prepare gate, causal cone, and stateful-scan pointer are present", () => {
  const source = readSkill();
  assert.match(source, /Patch-or-Prepare Gate/);
  assert.match(source, /Prepare keeps behavior/);
  assert.match(source, /Change alters acceptance/);
  assert.match(source, /causal cone/);
  assert.match(source, /stateful-change-scan\.md/);
  assert.match(source, /Identity/);
  assert.match(source, /Interleaving/);
  assert.match(source, /Commit/);
  assert.match(source, /Amplification/);
  assert.match(source, /Copies/);
  assert.equal(fs.existsSync(causalPath), true, "missing causal-change.md");
  const causal = fs.readFileSync(causalPath, "utf8");
  assert.match(causal, /causal cone/i);
  assert.match(causal, /Patch-or-Prepare/);
});

test("does not invent per-failure-mode skills", () => {
  const source = `${readSkill()}\n${fs.readFileSync(causalPath, "utf8")}`;
  for (const name of FORBIDDEN_SKILL_NAMES) {
    assert.equal(source.includes(name), false, `must not introduce skill name ${name}`);
  }
});
