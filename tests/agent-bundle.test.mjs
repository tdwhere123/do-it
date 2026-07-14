import assert from "node:assert/strict";
import test from "node:test";

import {
  validateAgentInstructionLinks,
  validateDelegationContract,
  validatePortableAgentPolicy
} from "../scripts/validate-agent-bundle.mjs";

const completeContract = `
Delegation Contract:
- tier and lens
- scope and non-goals
- write ownership and restricted paths
- facts to verify
- proof target
- stop condition
- return schema
Return NEEDS_CONTEXT when fields are missing.
`;

test("portable agent policy remains model-agnostic", () => {
  const errors = [];
  validatePortableAgentPolicy("agents/example.toml", `${completeContract}\nmodel_reasoning_effort`, errors);
  assert.deepEqual(errors, [
    "agents/example.toml: must not contain host-private model or budget fields"
  ]);
});

test("delegation contract requires every portable field", () => {
  const errors = [];
  validateDelegationContract("agents/example.toml", completeContract, errors);
  assert.deepEqual(errors, []);

  validateDelegationContract(
    "agents/incomplete.toml",
    completeContract.replace("proof target", "proof evidence"),
    errors
  );
  assert.ok(
    errors.includes("agents/incomplete.toml: Delegation Contract must include proof target")
  );
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
