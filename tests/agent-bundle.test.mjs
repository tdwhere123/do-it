import assert from "node:assert/strict";
import test from "node:test";

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  validateAgentCapabilityPolicy,
  validateAgentInstructionLinks,
  validatePortableAgentPolicy
} from "../scripts/validate-agent-bundle.mjs";
import {
  AGENT_CHILD_CONTRACT_ID,
  AGENT_NOT_DEFAULT_CONTRACT_ID,
  EXPECTED_AGENT_INVENTORY,
  NOT_DEFAULT_AGENTS
} from "../scripts/validate-skill-contracts.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const capabilityAgent = `
name = "example"
description = "Use when a focused read-only review can resolve a bounded question."
sandbox_mode = "read-only"
developer_instructions = """Return evidence and NOT_CHECKED.
<!-- do-it-contract:agent.child-contract -->
Stay on the assigned narrow slice. The parent owns integration.
"""
`;

test("portable agent policy remains model-agnostic", () => {
  const errors = [];
  validatePortableAgentPolicy("agents/example.toml", `${capabilityAgent}\nmodel_reasoning_effort`, errors);
  assert.deepEqual(errors, [
    "agents/example.toml: must not contain host-private model or budget fields"
  ]);
});

test("capability agents stay concise, safe, and free of process gates", () => {
  const errors = [];
  validateAgentCapabilityPolicy("agents/example.toml", capabilityAgent, errors);
  assert.deepEqual(errors, []);

  validateAgentCapabilityPolicy("agents/incomplete.toml", capabilityAgent
    .replace("Use when", "Maps when")
    .replace('sandbox_mode = "read-only"', 'sandbox_mode = "unrestricted"')
    .replace("NOT_CHECKED", "not checked")
    .concat("\nDelegation Contract: required in the parent prompt; self-escalate."), errors);
  assert.ok(
    errors.includes("agents/incomplete.toml: description must start with Use when")
  );
  assert.ok(errors.includes("agents/incomplete.toml: sandbox_mode must be read-only or workspace-write"));
  assert.ok(errors.includes("agents/incomplete.toml: must name NOT_CHECKED in its return guidance"));
  assert.ok(errors.includes("agents/incomplete.toml: must not retain process gate phrase Delegation Contract"));
});

test("capability agents must carry the child-contract anchor", () => {
  const errors = [];
  validateAgentCapabilityPolicy(
    "agents/no-contract.toml",
    capabilityAgent.replace("<!-- do-it-contract:agent.child-contract -->", ""),
    errors
  );
  assert.ok(errors.includes(`agents/no-contract.toml: must include ${AGENT_CHILD_CONTRACT_ID}`));
});

test("expensive agents must carry the not-default anchor", () => {
  const errors = [];
  validateAgentCapabilityPolicy("agents/plan-challenger.toml", capabilityAgent, errors);
  assert.ok(
    errors.includes(`agents/plan-challenger.toml: must include ${AGENT_NOT_DEFAULT_CONTRACT_ID}`)
  );
});

test("plugin-owned agent inventory stays at 10", () => {
  const files = fs
    .readdirSync(path.join(repoRoot, "agents"))
    .filter((name) => name.endsWith(".toml"))
    .sort();
  assert.equal(files.length, EXPECTED_AGENT_INVENTORY);
  for (const name of NOT_DEFAULT_AGENTS) {
    assert.ok(files.includes(`${name}.toml`), name);
  }
});

test("agent instruction links reject broken local paths in link, code, or bare forms", () => {
  for (const source of [
    "See [the contract](references/workflow-kernel.md).",
    "See `references/workflow-kernel.md` for the contract.",
    "See references/workflow-kernel.md for the contract."
  ]) {
    const errors = [];
    validateAgentInstructionLinks("agents/example.toml", source, errors);
    assert.deepEqual(errors, [
      "agents/example.toml: broken agent instruction link references/workflow-kernel.md"
    ]);
  }
});

test("agent instruction links accept existing and external Markdown targets", () => {
  const errors = [];
  validateAgentInstructionLinks(
    "agents/example.toml",
    "See [`routing`](../docs/routing-matrix.md) and https://example.com/guide.md.",
    errors
  );
  assert.deepEqual(errors, []);
});
