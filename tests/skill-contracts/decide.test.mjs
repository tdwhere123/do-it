import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const skillPath = path.join(repoRoot, "skills/do-it/do-it-decide/SKILL.md");
const resolversPath = path.join(repoRoot, "skills/do-it/references/decision-resolvers.md");
const skill = fs.readFileSync(skillPath, "utf8");

const STEPS = [
  "## 1. Find the decision-changing unknown",
  "## 2. Cheapest reliable resolver",
  "## 3. Dominant route or decision boundary",
  "## 4. Readiness",
  "## 5. Minimal contract"
];

const ANCHORS = [
  "do-it-contract:decide.find-unknown",
  "do-it-contract:decide.cheap-resolver",
  "do-it-contract:decide.dominant-or-boundary",
  "do-it-contract:decide.readiness",
  "do-it-contract:decide.minimal-contract",
  "do-it-contract:decide.settled-protection"
];

test("five-step algorithm headings and contract anchors are present", () => {
  for (const heading of STEPS) {
    assert.ok(skill.includes(`${heading}\n`), heading);
  }
  for (const anchor of ANCHORS) {
    assert.ok(skill.includes(`<!-- ${anchor} -->`), anchor);
  }
});

test("Grill / Diverge / Plan Card / Slice are not a top-level mode table", () => {
  assert.doesNotMatch(skill, /^## Modes\b/m);
  assert.doesNotMatch(skill, /\|\s*\*{0,2}Grill\*{0,2}\s*\|/);
  assert.doesNotMatch(skill, /\|\s*\*{0,2}Diverge\*{0,2}\s*\|/);
  assert.doesNotMatch(skill, /\|\s*\*{0,2}Plan [Cc]ard\*{0,2}\s*\|/);
  assert.doesNotMatch(skill, /\|\s*\*{0,2}Slice\*{0,2}\s*\|/);
});

test("delegation defaults to 0 subagents with no fixed agent count", () => {
  assert.match(skill, /Default \*\*0\*\* subagents/);
  assert.match(skill, /No fixed stage or agent count/);
  assert.doesNotMatch(skill, /Heavy default/i);
});

test("settled [user]/[evidence]/[choice] stay closed; [assumption] stays open", () => {
  assert.match(skill, /\[user\]/);
  assert.match(skill, /\[evidence\]/);
  assert.match(skill, /\[choice\]/);
  assert.match(skill, /\[assumption\]/);
  assert.match(skill, /stay closed/);
  assert.match(skill, /open/);
});

test("D01-style no ceremony for bounded reversible work", () => {
  assert.match(skill, /Do not manufacture a plan file, interview, or worker/);
  assert.match(skill, /inspect, act, check/);
});

test("S17 boundary regex phrases remain until that card replaces them", () => {
  assert.match(skill, /Ask \*\*one\*\* question at a time; wait for the answer\./);
  assert.match(skill, /Do not enact the plan until shared understanding is confirmed/);
});

test("readiness and contract shape live in task-contract; resolvers are linked", () => {
  assert.match(skill, /task-contract\.md/);
  assert.match(skill, /decision-resolvers\.md/);
  assert.equal(fs.existsSync(resolversPath), true);
  const resolvers = fs.readFileSync(resolversPath, "utf8");
  assert.match(resolvers, /## Resolver ladder/);
  assert.match(resolvers, /## Research-first surfaces/);
});

test("does not restate Core canonical sentences", () => {
  assert.doesNotMatch(
    skill,
    /Spend only the cognition the decision is worth: choose the smallest useful capability/
  );
  assert.doesNotMatch(
    skill,
    /Resolve decision-changing uncertainty by the cheapest reliable method; ask the user only for a material choice/
  );
});
