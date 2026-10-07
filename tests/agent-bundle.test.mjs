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
import { parseFrontmatter } from "../scripts/build-index-json.mjs";

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
const auditBundles = ["plugins/do-it", "plugins/do-it-cursor", "plugins/do-it-opencode", "plugins/do-it-pi"];

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

  // Claude and Kimi use canonical skills; the other hosts receive directory copies.
  const source = readRepoFile(`${auditSourceDir}/SKILL.md`);
  const frontmatter = parseFrontmatter(source);
  assert.equal(frontmatter.name, auditSkillName);
  assert.ok(frontmatter.description?.trim(), "native skill discovery needs a description");
  const index = JSON.parse(readRepoFile("index.json"));
  assert.ok(index.entries.some((entry) =>
    entry.kind === "skill" && entry.name === auditSkillName && entry.group === "on-demand"
  ));
  // Pi loads SKILL.md natively; a Claude-style _index.md is not a Pi skill.
  const indexedBundles = auditBundles.filter((root) => root !== "plugins/do-it-pi");
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
