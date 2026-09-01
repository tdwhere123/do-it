import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const skillPath = path.join(repoRoot, "skills/do-it/do-it-architecture/SKILL.md");
const rationalePath = path.join(
  repoRoot,
  "skills/do-it/do-it-architecture/references/architecture-rationale.md"
);
const statefulScanPath = path.join(
  repoRoot,
  "skills/do-it/references/stateful-change-scan.md"
);

const SURFACES = [
  "Spine & Surfaces",
  "Authority & Ownership",
  "Failure & Recovery",
  "Change & Cutover",
  "Governance"
];

const QUARTET = ["Semantic", "Admission", "Projection", "Recovery"];

const LENSES = [
  "L1 Spine",
  "L2 Surfaces",
  "L3 Authority",
  "L4 Ownership",
  "L5 Negative path",
  "L6 Guards",
  "L7 Governed path",
  "L8 Change/deletion"
];

function readSkill() {
  assert.equal(fs.existsSync(skillPath), true, `missing ${skillPath}`);
  return fs.readFileSync(skillPath, "utf8");
}

function readRationale() {
  assert.equal(fs.existsSync(rationalePath), true, `missing ${rationalePath}`);
  return fs.readFileSync(rationalePath, "utf8");
}

function lineCount(text) {
  return text.replace(/\n$/, "").split("\n").length;
}

test("architecture skill exists and is shorter than the 109-line baseline", () => {
  const text = readSkill();
  const lines = lineCount(text);
  assert.ok(lines < 109, `SKILL.md is ${lines} lines; must be shorter than 109`);
});

test("Change & Cutover owns net-growth; Governance is guards and honest path", () => {
  const text = readSkill();
  const change = text.match(/\*\*Change & Cutover\*\*[^\n]+/);
  const governance = text.match(/\*\*Governance\*\*[^\n]+/);
  assert.ok(change, "missing Change & Cutover row");
  assert.ok(governance, "missing Governance row");
  assert.match(change[0], /new noun/);
  assert.match(change[0], /net-growth/);
  assert.match(governance[0], /honest path/);
  assert.doesNotMatch(governance[0], /new noun/);
  const rationale = readRationale();
  assert.match(rationale, /\*\*Change & Cutover\*\*.*new noun/);
  assert.match(rationale, /\*\*Governance\*\*.*L6 Guards, L7 Governed path/);
});

test("hot path names the five decision surfaces in order", () => {
  const text = readSkill();
  const indexes = SURFACES.map((name) => text.indexOf(name));
  assert.ok(
    indexes.every((index) => index >= 0),
    `missing surface; found indexes ${indexes.join(", ")}`
  );
  assert.deepEqual(
    [...indexes].sort((a, b) => a - b),
    indexes,
    "surfaces must keep Spine & Surfaces → Authority & Ownership → Failure & Recovery → Change & Cutover → Governance"
  );
});

test("hot path no longer lists the original eight L-numbered lenses", () => {
  const text = readSkill();
  assert.doesNotMatch(text, /\|\s*\*\*L1 Spine\*\*/);
  assert.doesNotMatch(text, /\|\s*\*\*L8 Change\/deletion\*\*/);
});

test("authority quartet is named and is not one physical writer", () => {
  const text = readSkill();
  for (const role of QUARTET) {
    assert.match(text, new RegExp(`\\*\\*${role}\\*\\*`), `missing quartet role ${role}`);
  }
  assert.match(text, /one semantic authority ≠ one physical writer/i);
  assert.match(text, /Replace test/i);
  assert.match(text, /Bypass test/i);
});

test("a new surface with no consumer is a stop", () => {
  const text = readSkill();
  assert.match(text, /no consumer/i);
  assert.match(text, /stop/i);
});

test("hot path points at the stateful change scan", () => {
  const text = readSkill();
  assert.match(text, /stateful-change-scan\.md/);
  assert.match(
    text,
    /\[`?\.\.\/references\/stateful-change-scan\.md`?\]\(\.\.\/references\/stateful-change-scan\.md\)/
  );
  assert.equal(fs.existsSync(statefulScanPath), true, `missing ${statefulScanPath}`);
});

test("private reversible choice is not an architecture dossier", () => {
  const text = readSkill();
  assert.match(text, /private reversible choice/);
  assert.match(text, /architecture dossier/);
});

test("task routes stay on the hot path, compressed", () => {
  const text = readSkill();
  for (const route of [
    "greenfield_design",
    "architecture_review",
    "boundary_change",
    "structural_refactor"
  ]) {
    assert.match(text, new RegExp(`\`${route}\``), `missing route ${route}`);
  }
});

test("rationale keeps the original eight lenses as progressive detail", () => {
  const text = readRationale();
  for (const lens of LENSES) {
    assert.match(text, new RegExp(`\\*\\*${lens}\\*\\*`), `rationale missing ${lens}`);
  }
  for (const surface of SURFACES) {
    assert.ok(text.includes(surface), `rationale missing surface ${surface}`);
  }
  assert.match(text, /stateful-change-scan\.md/);
});
