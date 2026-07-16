#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { ALL_SKILLS, CORE_SKILLS, EXTENDED_SKILLS } from "./skill-tiers.mjs";

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
  const serialized = JSON.stringify(data);
  const names = new Set();
  for (const match of serialized.matchAll(/run-hook\.cmd\s+([a-z0-9-]+)/g)) {
    names.add(match[1]);
  }
  if (names.size === 0) {
    throw new Error(`${relativePath}: no run-hook.cmd hook names found`);
  }
  for (const name of names) {
    const script = `${name}.sh`;
    if (!fs.existsSync(path.join(hooksDir, script))) {
      throw new Error(`${relativePath}: references missing bundled hook ${script}`);
    }
  }
}

function assertClaudeStrictProfile(relativePath) {
  const data = readJson(relativePath);
  const expected = [
    ["Bash(git push *)", "git-push"],
    ["Bash(gh pr merge *)", "gh-pr-merge"],
    ["Bash(npm publish *)", "npm-publish"],
    ["Bash(pnpm publish *)", "pnpm-publish"],
    ["Bash(yarn npm publish *)", "yarn-npm-publish"],
    ["Bash(kubectl apply *)", "kubectl-apply"],
    ["Bash(terraform apply *)", "terraform-apply"]
  ];
  const handlers = (data.hooks?.PreToolUse ?? []).flatMap((group) => group.hooks ?? []);
  const commandPrefix = '"${CLAUDE_PLUGIN_ROOT}/hooks/strict-external-actions.sh" ';
  const actual = handlers.map((handler) => {
    const action = typeof handler.command === "string" && handler.command.startsWith(commandPrefix)
      ? handler.command.slice(commandPrefix.length)
      : "";
    return `${handler.if ?? ""}|${action}`;
  });
  assertEqualSets(
    `${relativePath}: strict external-action handlers`,
    actual,
    expected.map(([condition, action]) => `${condition}|${action}`)
  );
  for (const handler of handlers) {
    const action = typeof handler.command === "string" && handler.command.startsWith(commandPrefix)
      ? handler.command.slice(commandPrefix.length)
      : "";
    if (
      handler.type !== "command" ||
      !expected.some(([condition, expectedAction]) => handler.if === condition && action === expectedAction) ||
      Object.hasOwn(handler, "args") ||
      handler.shell !== "bash" ||
      handler.timeout !== 10
    ) {
      throw new Error(`${relativePath}: strict external-action handler has an unsafe shape`);
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
  assertEqualSets("manifest extended tier", manifest.skillTiers?.extended ?? [], EXTENDED_SKILLS);
  for (const target of ["codex", "cursor"]) {
    const strictExtras = (manifest.targets?.[target]?.extras ?? [])
      .filter((entry) => entry.name === "hooks-strict-external-actions");
    if (strictExtras.length !== 0) {
      throw new Error(`${target}: strict external-action hook must remain Claude-only`);
    }
  }
  const claudeStrictExtras = (manifest.targets?.claude?.extras ?? [])
    .filter((entry) => entry.name === "hooks-strict-external-actions");
  if (
    claudeStrictExtras.length !== 1 ||
    claudeStrictExtras[0].source !== "hooks/strict-external-actions.sh" ||
    claudeStrictExtras[0].target !== "hooks/strict-external-actions.sh"
  ) {
    throw new Error("Claude strict external-action hook must be installed exactly once");
  }

  readJson(".cursor-plugin/marketplace.json");
  assertCursorHooks("install/cursor-hooks.json");
  assertCursorHooks("plugins/do-it-cursor/hooks/hooks.json");
  readJson("plugins/do-it-cursor/.cursor-plugin/plugin.json");
  assertEqualSets("Cursor skill bundle", listSkillDirs("plugins/do-it-cursor/skills"), allSkills);
  assertEqualSets("Codex skill bundle", listSkillDirs("plugins/do-it/skills"), allSkills);
  assertEqualSets("OpenCode skill bundle", listSkillDirs("plugins/do-it-opencode/skills"), allSkills);

  for (const hooksJson of ["hooks/hooks.json", "install/codex-hooks.json", "install/cursor-hooks.json", "plugins/do-it-cursor/hooks/hooks.json"]) {
    const raw = JSON.stringify(readJson(hooksJson));
    if (raw.includes("grill-pretool")) {
      throw new Error(`${hooksJson}: must not include pre-edit plan gate registration`);
    }
    if (hooksJson !== "hooks/hooks.json" && raw.includes("PreToolUse")) {
      throw new Error(`${hooksJson}: only the Claude source config may register strict PreToolUse`);
    }
  }
  const codexHooksExtra = (manifest.targets?.codex?.extras ?? [])
    .find((entry) => entry.name === "hooks-hooks-json");
  if (codexHooksExtra?.source !== "install/codex-hooks.json") {
    throw new Error("Codex must install its own PreToolUse-free hook configuration");
  }
  const expansionHandlers = dataHooks => dataHooks.hooks?.UserPromptExpansion ?? [];
  const claudeExpansion = expansionHandlers(readJson("hooks/hooks.json"));
  if (
    claudeExpansion.length !== 1 ||
    claudeExpansion[0]?.matcher !== "^do-it-retrospective$" ||
    claudeExpansion[0]?.hooks?.length !== 1 ||
    claudeExpansion[0].hooks[0]?.command !== "${CLAUDE_PLUGIN_ROOT}/hooks/behavior-feedback.sh"
  ) {
    throw new Error("Claude must receive the narrow retrospective slash-expansion recorder");
  }
  assertClaudeStrictProfile("hooks/hooks.json");
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
