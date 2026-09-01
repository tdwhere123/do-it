import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const skill = fs.readFileSync(path.join(repoRoot, "skills/do-it/do-it-adaptive/SKILL.md"), "utf8");
const policy = fs.readFileSync(path.join(repoRoot, "skills/do-it/references/adaptive-policy.md"), "utf8");
const core = fs.readFileSync(path.join(repoRoot, "skills/do-it/do-it-core/SKILL.md"), "utf8");
const glossary = fs.readFileSync(
  path.join(repoRoot, "skills/do-it/do-it-handbook/templates/glossary.md"),
  "utf8"
);
const lenses = fs.readFileSync(path.join(repoRoot, "skills/do-it/references/review-lenses.md"), "utf8");

const ANCHORS = [
  "do-it-contract:adaptive.delta-only",
  "do-it-contract:adaptive.active-cap",
  "do-it-contract:adaptive.precedence-vs-core",
  "do-it-contract:adaptive.no-core-writes",
  "do-it-contract:adaptive.child-one-delta"
];

test("adaptive interpreter carries 3–6 contract anchors", () => {
  for (const anchor of ANCHORS) {
    assert.ok(skill.includes(`<!-- ${anchor} -->`), anchor);
  }
  assert.match(skill, /delta over fixed do-it behavior/);
  assert.match(skill, /0–8 Active bullets/);
  assert.match(skill, /Pass at most the one delta/);
  assert.match(skill, /Never edit `do-it-core`/);
});

test("Core is a constraint on every rung, not a waivable mid-ladder layer", () => {
  assert.match(core, /do-it-contract:core.precedence/);
  assert.match(core, /constrains every rung/);
  assert.match(skill, /constrains every rung/);
  assert.match(policy, /constrains every rung/);
  assert.doesNotMatch(
    policy,
    /> active task contract\n> fixed Core\n> project-local personal delta/
  );
});

test("glossary retires Grill / Diverge / Plan Card / Slice as Decide modes", () => {
  assert.doesNotMatch(glossary, /\*\*Decide modes\*\*/);
  assert.match(glossary, /\*\*Decision-changing unknown\*\*/);
  assert.match(glossary, /\*\*Cheapest resolver\*\*/);
  assert.match(glossary, /\*\*Decision boundary\*\*/);
  assert.match(glossary, /\*\*Readiness\*\*/);
  assert.match(glossary, /\*\*Task Contract\*\*/);
  assert.match(glossary, /## Anti-Glossary/);
  assert.match(glossary, /Grill — retired Decide mode/);
  assert.match(glossary, /Diverge — retired Decide mode/);
  assert.match(glossary, /Plan Card — retired/);
  assert.match(glossary, /Slice — retired Decide mode/);
});

test("review lenses Spec coverage is the four contract headings", () => {
  assert.match(lenses, /every Goal, Decisions, Boundary, and Acceptance item/);
  assert.match(lenses, /not required Spec sources/);
  assert.doesNotMatch(lenses, /every request, acceptance item, grill decision/);
  assert.match(lenses, /workflow-kernel\.md\) § Change Cone/);
  assert.match(lenses, /causal-change\.md/);
  assert.match(lenses, /decision-resolvers\.md/);
  assert.doesNotMatch(lenses, /do-it-decide` plan-card guidance/);
  assert.doesNotMatch(lenses, /§ Path Map Chain/);
  assert.doesNotMatch(lenses, /do-it-code-quality` § Comments/);
});
