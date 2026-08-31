import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { parseYaml } from "../../evals/behavior/validate.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const review = fs.readFileSync(path.join(repoRoot, "skills/do-it/do-it-review/SKILL.md"), "utf8");
const verify = fs.readFileSync(path.join(repoRoot, "skills/do-it/do-it-verify/SKILL.md"), "utf8");
const lenses = fs.readFileSync(path.join(repoRoot, "skills/do-it/references/review-lenses.md"), "utf8");
const scenariosDir = path.join(repoRoot, "evals/behavior/scenarios");

function loadScenario(id) {
  const name = fs.readdirSync(scenariosDir).find(
    (file) => file === `${id}.yaml` || file.startsWith(`${id}-`)
  );
  assert.ok(name, `missing scenario file for ${id}`);
  return parseYaml(fs.readFileSync(path.join(scenariosDir, name), "utf8"), name);
}

test("review keeps Standards and Spec as independent axes", () => {
  assert.match(review, /Two Axes \(do not merge rankings\)/);
  assert.match(review, /\*\*Spec\*\*/);
  assert.match(review, /\*\*Standards\*\*/);
  assert.match(review, /Goal, Decisions, Boundary, Acceptance, and named deferrals/);
  assert.match(
    review,
    /Causal authority, contract fallout, stateful failures, and proof quality/
  );
  assert.match(review, /A change can pass one and fail the other/);
  assert.match(review, /Do not average them\s+into one score/);
  assert.match(lenses, /Rank \*\*Spec\*\* and \*\*Standards\*\* independently/);
  assert.match(lenses, /Goal, Decisions, Boundary, and Acceptance item/);
});

test("review defaults to inline and has no multi-reviewer pipeline", () => {
  assert.match(review, /Default inline review/);
  assert.match(review, /At most one independent reviewer/);
  assert.match(review, /No fixed multi-reviewer pipeline/);
  assert.match(lenses, /No fixed multi-reviewer pipeline/);
  assert.doesNotMatch(review, /Prefer parallel reviewer agents/);
  assert.doesNotMatch(review, /review-adversarial/);
  assert.doesNotMatch(review, /multi-lens \/ parallel axes/);
  assert.doesNotMatch(lenses, /red-team-reviewer/);
});

test("review cannot be clean with unresolved Blocking/Important findings", () => {
  assert.match(review, /Not clean while Blocking\/Important remain\./);
});

test("verify maps acceptance to fresh worktree evidence", () => {
  assert.match(verify, /acceptance→evidence map/);
  assert.match(verify, /Worktree \+ HEAD\/fingerprint if known/);
  assert.match(verify, /Residual risk/);
  assert.match(verify, /Observed event ≠\s*proof/);
  assert.match(verify, /\*\*stale\*\*/);
  assert.match(verify, /\*\*other worktree\*\*/);
  assert.match(verify, /\*\*irrelevant\*\*/);
  assert.match(verify, /\*\*mock-only\*\*/);
  assert.match(verify, /\*\*partial\*\*/);
  assert.match(verify, /cannot support `VERIFIED`/);
  assert.match(verify, /Honest `NOT_VERIFIED` names the missing proof/);
});

test("R01 locks two-axis independence and rejects a false VERIFIED", () => {
  const scenario = loadScenario("R01");
  assert.equal(scenario.family, "review-verify");
  assert.match(scenario.title, /Standards/i);
  assert.match(scenario.title, /Spec/i);
  assert.match(scenario.prompt, /independently/i);
  assert.ok(scenario.hard_failures.includes("false_verified"));
  assert.match(scenario.contract.acceptance.A1, /Spec/i);
  assert.match(scenario.contract.acceptance.A2, /VERIFIED/);
});

test("R02 locks a negative-path finding that Spec-pass cannot hide", () => {
  const scenario = loadScenario("R02");
  assert.equal(scenario.family, "review-verify");
  assert.match(scenario.title, /negative-path/i);
  assert.ok(scenario.hard_failures.includes("false_verified"));
  assert.match(scenario.contract.acceptance.A2, /VERIFIED/);
});

test("R05 rejects mock-only / synthetic proof as VERIFIED", () => {
  const scenario = loadScenario("R05");
  assert.equal(scenario.family, "review-verify");
  assert.match(scenario.title, /Mock-only|synthetic/i);
  assert.ok(scenario.hard_failures.includes("false_verified"));
  assert.match(scenario.contract.acceptance.A1, /mock-only/i);
  assert.match(scenario.contract.acceptance.A2, /NOT_VERIFIED/);
});
