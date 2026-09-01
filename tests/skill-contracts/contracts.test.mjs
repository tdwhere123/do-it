import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import {
  AGENT_CHILD_CONTRACT_ID,
  AGENT_NOT_DEFAULT_CONTRACT_ID,
  EXPECTED_AGENT_INVENTORY,
  NOT_DEFAULT_AGENTS,
  collectAnchors,
  hasFixedAgentCount,
  validateSkillContracts
} from "../../scripts/validate-skill-contracts.mjs";
import { CORE_SKILLS } from "../../scripts/skill-tiers.mjs";
import { runValidateSkillBudgets } from "../../scripts/validate-skill-budgets.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const decidePath = "skills/do-it/do-it-decide/SKILL.md";
const contractsCli = path.join(repoRoot, "scripts/validate-skill-contracts.mjs");
const budgetsCli = path.join(repoRoot, "scripts/validate-skill-budgets.mjs");
const boundariesCli = path.join(repoRoot, "scripts/validate-core-skill-boundaries.mjs");

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

test("live repo satisfies the skill/agent contract registry", () => {
  assert.deepEqual(validateSkillContracts({ repoRoot }), []);
});

test("rewording prose while keeping anchors still passes", () => {
  const original = read(decidePath);
  const reworded = original
    .replace(
      "Ask **one** question at a time; wait for the answer.",
      "Pose a single question, then wait."
    )
    .replace(
      "Do not enact the plan until shared understanding is confirmed",
      "Hold implementation until the user confirms the plan"
    );
  assert.notEqual(reworded, original);
  assert.deepEqual(
    validateSkillContracts({ repoRoot, overlays: { [decidePath]: reworded } }),
    []
  );
});

test("deleting a key contract anchor fails", () => {
  const original = read(decidePath);
  const deleted = original.replace("<!-- do-it-contract:decide.find-unknown -->", "");
  const errors = validateSkillContracts({
    repoRoot,
    overlays: { [decidePath]: deleted }
  });
  assert.ok(
    errors.some((error) => error.includes("missing do-it-contract:decide.find-unknown")),
    errors.join("\n")
  );
});

test("unknown contract anchors are rejected", () => {
  const original = read(decidePath);
  const invented = `${original}\n<!-- do-it-contract:invented.foo -->\n`;
  const errors = validateSkillContracts({
    repoRoot,
    overlays: { [decidePath]: invented }
  });
  assert.ok(
    errors.some((error) => error.includes("unknown contract do-it-contract:invented.foo")),
    errors.join("\n")
  );
});

test("main skills have no fixed agent count", () => {
  for (const name of CORE_SKILLS) {
    const source = read(`skills/do-it/${name}/SKILL.md`);
    assert.equal(hasFixedAgentCount(source), false, name);
  }
});

test("child write-boundary and zero-default contracts are anchored", () => {
  const kernel = read("skills/do-it/references/workflow-kernel.md");
  const anchors = collectAnchors(kernel);
  assert.ok(anchors.has("do-it-contract:delegation.zero-default"));
  assert.ok(anchors.has("do-it-contract:delegation.child-write-boundary"));
});

test("router restates default 0 / one second look and names bootstrap trees", () => {
  const router = read("skills/do-it/do-it-router/SKILL.md");
  assert.match(router, /Default 0 workers; at most one targeted second look/);
  assert.match(router, /§ Delegation Budget/);
  assert.doesNotMatch(router, /Delegation Boundary/);
  assert.match(router, /scaffolds CONTEXT,\s+handbook, worklog, and plans/);
  assert.doesNotMatch(router, /task-artifact directories/);
});

test("every bundled agent carries the child contract; expensive ones are not default", () => {
  const files = fs
    .readdirSync(path.join(repoRoot, "agents"))
    .filter((name) => name.endsWith(".toml"))
    .sort();
  assert.equal(files.length, EXPECTED_AGENT_INVENTORY);
  for (const file of files) {
    const source = read(`agents/${file}`);
    const anchors = collectAnchors(source);
    assert.ok(anchors.has(AGENT_CHILD_CONTRACT_ID), file);
    const name = file.replace(/\.toml$/, "");
    if (NOT_DEFAULT_AGENTS.includes(name)) {
      assert.ok(anchors.has(AGENT_NOT_DEFAULT_CONTRACT_ID), file);
    }
  }
});

test("skill-contract and budget CLIs, and the boundaries shim, exit 0", () => {
  const contracts = spawnSync(process.execPath, [contractsCli], { encoding: "utf8" });
  assert.equal(contracts.status, 0, contracts.stderr);
  assert.match(contracts.stdout, /contracts OK/);

  const budgets = spawnSync(process.execPath, [budgetsCli], { encoding: "utf8" });
  assert.equal(budgets.status, 0, budgets.stderr);

  const boundaries = spawnSync(process.execPath, [boundariesCli], { encoding: "utf8" });
  assert.equal(boundaries.status, 0, boundaries.stderr);
  assert.match(boundaries.stdout, /validate-core-skill-boundaries: .*contracts OK/);
});

test("skill budget validator is advisory and does not fail the process", () => {
  assert.equal(runValidateSkillBudgets({ repoRoot }), 0);
});
