import assert from "node:assert/strict";
import test from "node:test";

import {
  validateAgentCapabilityPolicy,
  validateAgentInstructionLinks,
  validatePortableAgentPolicy
} from "../scripts/validate-agent-bundle.mjs";

const capabilityAgent = `
name = "example"
description = "Use when a focused read-only review can resolve a bounded question."
sandbox_mode = "read-only"
developer_instructions = "Return evidence and NOT_CHECKED."
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
