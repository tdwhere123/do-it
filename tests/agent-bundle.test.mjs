import assert from "node:assert/strict";
import test from "node:test";

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  validateAgentCapabilityPolicy,
  validateAgentInstructionLinks,
  validateCodexEntry,
  validatePortableAgentPolicy
} from "../scripts/validate-agent-bundle.mjs";
import { parseFrontmatter } from "../scripts/build-index-json.mjs";
import { parseAgentToml } from "../scripts/lib/agent-source.mjs";

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

const auditSkillName = "do-it-audit";
const auditSourceDir = `skills/do-it/${auditSkillName}`;
const auditBundles = ["plugins/do-it", "plugins/do-it-cursor", "plugins/do-it-pi", "plugins/do-it-grok"];

function readRepoFile(relativePath) {
  assert.ok(fs.existsSync(path.join(repoRoot, relativePath)), `missing ${relativePath}`);
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function localMarkdownLinks(text) {
  return [...text.matchAll(/\[[^\]]*\]\(([^\s)#]+\.md)(?:#[^\s)]*)?\)|`((?:\.{1,2}\/|references\/)[^\s`#]+\.md)(?:#[^\s`]*)?`/g)]
    .map((match) => match[1] ?? match[2])
    .filter((target) => !/^(?:[a-z][a-z0-9+.-]*:|\/)/i.test(target));
}

test("do-it-audit is an extended skill registered in canonical and host discovery", () => {
  const manifest = JSON.parse(readRepoFile("manifest.json"));
  const entries = manifest.skills.filter((entry) => entry.name === auditSkillName);
  assert.equal(entries.length, 1, "manifest must register do-it-audit exactly once");
  assert.equal(entries[0].source, auditSourceDir);
  assert.equal(entries[0].target, `skills/${auditSkillName}`);
  assert.ok(manifest.skillTiers.extended.includes(auditSkillName));
  assert.ok(!manifest.skillTiers.core.includes(auditSkillName), "deep audit is not daily Core");

  // Claude uses canonical skills; the other hosts receive directory copies.
  const source = readRepoFile(`${auditSourceDir}/SKILL.md`);
  const frontmatter = parseFrontmatter(source);
  assert.equal(frontmatter.name, auditSkillName);
  assert.ok(frontmatter.description?.trim(), "native skill discovery needs a description");
  const index = JSON.parse(readRepoFile("index.json"));
  assert.ok(index.entries.some((entry) =>
    entry.kind === "skill" && entry.name === auditSkillName && entry.group === "on-demand"
  ));
  // Pi and Grok discover native SKILL.md files without a separate index.
  const indexedBundles = ["plugins/do-it", "plugins/do-it-cursor"];
  for (const root of ["dist/claude", ...indexedBundles]) {
    assert.match(readRepoFile(`${root}/skills/_index.md`), /\*\*do-it-audit\*\*/);
  }
  const piPackage = JSON.parse(readRepoFile("plugins/do-it-pi/package.json"));
  assert.ok(piPackage.pi.skills.includes("./skills"), "Pi must discover its bundled skills directory");
  for (const root of auditBundles) {
    assert.equal(readRepoFile(`${root}/skills/${auditSkillName}/SKILL.md`), source);
  }
});

test("do-it-audit local reference links survive each host bundle", () => {
  const skill = readRepoFile(`${auditSourceDir}/SKILL.md`);
  const localLinks = localMarkdownLinks(skill).filter((target) => /^(?:\.\/)?references\//.test(target));
  assert.ok(localLinks.length > 0, "audit skill must link its own supporting references");

  const pending = ["SKILL.md", ...localLinks];
  const seen = new Set();
  while (pending.length) {
    const relativePath = path.normalize(pending.pop());
    if (seen.has(relativePath)) continue;
    seen.add(relativePath);
    const source = readRepoFile(`${auditSourceDir}/${relativePath}`);
    for (const root of auditBundles) {
      assert.equal(readRepoFile(`${root}/skills/${auditSkillName}/${relativePath}`), source);
    }
    // Resolve relative links from the file that contains them, not by basename.
    for (const link of localMarkdownLinks(source)) {
      const target = path.join(path.dirname(relativePath), link);
      for (const root of ["skills/do-it", ...auditBundles.map((bundle) => `${bundle}/skills`)]) {
        readRepoFile(`${root}/${auditSkillName}/${target}`);
      }
      if (!target.startsWith("..")) pending.push(target);
    }
  }
});

test("Codex entry preserves native hook discovery without claiming plugin agent registration", () => {
  const plugin = JSON.parse(readRepoFile("plugins/do-it/.codex-plugin/plugin.json"));
  const hasRootManifest = fs.existsSync(path.join(repoRoot, "plugins/do-it/plugin.json"));
  const errors = [];
  validateCodexEntry(plugin, hasRootManifest, errors);
  assert.deepEqual(errors, []);
  assert.ok(fs.existsSync(path.join(repoRoot, "plugins/do-it", plugin.hooks)));
  assert.equal(fs.existsSync(path.join(repoRoot, "plugins/do-it/agents")), false);
  for (const [candidate, rootManifest] of [
    [plugin, true],
    [{ ...plugin, hooks: undefined }, false],
    [{ ...plugin, agents: "./agents/" }, false],
    [{ ...plugin, interface: { capabilities: ["Agents"] } }, false]
  ]) {
    const failures = [];
    validateCodexEntry(candidate, rootManifest, failures);
    assert.ok(failures.length > 0, "disabled hooks or unsupported agent registration must fail validation");
  }
});

test("shared canonical agent parser preserves multiline policy and rejects ambiguous source", () => {
  const parsed = parseAgentToml(capabilityAgent);
  assert.equal(parsed.name, "example");
  assert.equal(parsed.sandbox_mode, "read-only");
  assert.match(parsed.developer_instructions, /Return evidence and NOT_CHECKED\.\n<!-- do-it-contract:agent.child-contract -->/);
  assert.throws(() => parseAgentToml(`${capabilityAgent}\nmodel = "host-private"`), /unsupported Codex TOML key model/);
  assert.throws(() => parseAgentToml(`${capabilityAgent}\nname = "duplicate"`), /duplicate agent key name/);
  assert.throws(() => parseAgentToml('name = "unterminated'), /unterminated string/);
});

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
