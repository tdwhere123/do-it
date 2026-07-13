#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { ALL_SKILLS, CORE_SKILLS, EXTENDED_MAINTENANCE } from "./skill-tiers.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const allSkills = [...ALL_SKILLS];

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
  const serialized = JSON.stringify(data);
  if (serialized.includes("preToolUse") || serialized.includes("grill-pretool")) {
    throw new Error(`${relativePath}: must not register a pre-edit plan gate`);
  }
  // Windows Cursor opens bare .sh paths as documents — all Cursor commands
  // must go through the polyglot run-hook.cmd entrypoint.
  if (!serialized.includes("run-hook.cmd")) {
    throw new Error(`${relativePath}: Cursor hooks must use run-hook.cmd (not bare .sh)`);
  }
  for (const match of serialized.matchAll(/"command"\s*:\s*"([^"]+)"/g)) {
    const command = match[1];
    if (/\.sh(?:\s|$)/.test(command) && !command.includes("run-hook.cmd")) {
      throw new Error(`${relativePath}: bare .sh command is unsafe on Windows: ${command}`);
    }
  }
}

function assertBundledHookScripts(relativePath) {
  const data = readJson(relativePath);
  const hooksDir = path.join(repoRoot, relativePath.replace(/\/hooks\.json$/, ""));
  if (!fs.existsSync(path.join(hooksDir, "run-hook.cmd"))) {
    throw new Error(`${relativePath}: missing bundled run-hook.cmd`);
  }
  const names = ["session-start", "router", "grill-prompt", "subagent-stance", "write-quality-lint", "verification-gate"];
  const serialized = JSON.stringify(data);
  for (const name of names) {
    if (!serialized.includes(name)) continue;
    const script = `${name}.sh`;
    if (!fs.existsSync(path.join(hooksDir, script))) {
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
  assertEqualSets("Cursor skill bundle", listSkillDirs("plugins/do-it-cursor/skills"), allSkills);
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
