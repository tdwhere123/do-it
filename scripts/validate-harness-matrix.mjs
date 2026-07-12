#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { CORE_SKILLS, EXTENDED_MAINTENANCE } from "./skill-tiers.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const allSkills = [...CORE_SKILLS, ...EXTENDED_MAINTENANCE];

function readJson(relativePath) {
  const fullPath = path.join(repoRoot, relativePath);
  if (!fs.existsSync(fullPath)) throw new Error(`missing ${relativePath}`);
  return JSON.parse(fs.readFileSync(fullPath, "utf8"));
}

function listSkillDirs(relativePath) {
  const fullPath = path.join(repoRoot, relativePath);
  if (!fs.existsSync(fullPath)) throw new Error(`missing ${relativePath}`);
  return fs.readdirSync(fullPath)
    .filter((name) => name !== "references" && name !== "_index.md")
    .filter((name) => fs.statSync(path.join(fullPath, name)).isDirectory())
    .sort();
}

function assertEqualSets(label, actual, expected) {
  const a = [...actual].sort();
  const e = [...expected].sort();
  if (a.join("\n") !== e.join("\n")) {
    throw new Error(`${label}: expected [${e.join(", ")}], got [${a.join(", ")}]`);
  }
}

function assertCursorHooks(relativePath) {
  const data = readJson(relativePath);
  if (data.version !== 1 || !data.hooks || typeof data.hooks !== "object") {
    throw new Error(`${relativePath}: expected version 1 with hooks object`);
  }
  if (JSON.stringify(data).includes("preToolUse") || JSON.stringify(data).includes("grill-pretool")) {
    throw new Error(`${relativePath}: must not register a pre-edit plan gate`);
  }
}

function assertBundledHookScripts(relativePath) {
  const data = readJson(relativePath);
  const serialized = JSON.stringify(data);
  for (const script of ["router.sh", "grill-prompt.sh", "subagent-stance.sh", "write-quality-lint.sh", "verification-gate.sh"]) {
    if (!serialized.includes(script)) continue;
    if (!fs.existsSync(path.join(repoRoot, relativePath.replace(/\/hooks\.json$/, ""), script))) {
      throw new Error(`${relativePath}: references missing bundled hook ${script}`);
    }
  }
}

function main() {
  const manifest = readJson("manifest.json");
  const declared = manifest.skills
    .filter((entry) => entry.name !== "do-it-skills-index")
    .map((entry) => entry.name);
  assertEqualSets("manifest runnable skills", declared, allSkills);
  assertEqualSets("manifest core tier", manifest.skillTiers?.core ?? [], CORE_SKILLS);
  assertEqualSets("manifest extended tier", manifest.skillTiers?.extended ?? [], EXTENDED_MAINTENANCE);

  readJson(".cursor-plugin/marketplace.json");
  assertCursorHooks("install/cursor-hooks.json");
  assertCursorHooks("plugins/do-it-cursor/hooks/hooks.json");
  readJson("plugins/do-it-cursor/.cursor-plugin/plugin.json");
  assertEqualSets("Cursor core skill bundle", listSkillDirs("plugins/do-it-cursor/skills"), CORE_SKILLS);
  assertEqualSets("Codex skill bundle", listSkillDirs("plugins/do-it/skills"), allSkills);
  assertEqualSets("OpenCode skill bundle", listSkillDirs("plugins/do-it-opencode/skills"), allSkills);

  for (const hooksJson of ["hooks/hooks.json", "install/codex-hooks.json", "install/cursor-hooks.json", "plugins/do-it-cursor/hooks/hooks.json"]) {
    const raw = JSON.stringify(readJson(hooksJson));
    if (raw.includes("grill-pretool") || raw.includes("PreToolUse")) {
      throw new Error(`${hooksJson}: must not include pre-edit plan gate registration`);
    }
  }
  assertBundledHookScripts("plugins/do-it-cursor/hooks/hooks.json");

  const matrixPath = path.join(repoRoot, "docs", "harness-adapter-matrix.md");
  if (!fs.existsSync(matrixPath)) throw new Error("missing docs/harness-adapter-matrix.md");

  const opencodePkg = readJson("plugins/do-it-opencode/package.json");
  const rootPkg = readJson("package.json");
  if (opencodePkg.version !== rootPkg.version) {
    throw new Error(`OpenCode version ${opencodePkg.version} does not match root ${rootPkg.version}`);
  }
  if (!fs.existsSync(path.join(repoRoot, "plugins/do-it-opencode/dist/index.js"))) {
    throw new Error("OpenCode compiled dist/index.js missing");
  }

  console.log("validate-harness-matrix: inventories, hook maps, and OpenCode parity OK");
}

try {
  main();
} catch (error) {
  console.error(`validate-harness-matrix: ${error.message}`);
  process.exit(1);
}
