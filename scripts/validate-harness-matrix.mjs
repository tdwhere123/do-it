#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function readJson(relativePath) {
  const fullPath = path.join(repoRoot, relativePath);
  if (!fs.existsSync(fullPath)) {
    throw new Error(`missing ${relativePath}`);
  }
  return JSON.parse(fs.readFileSync(fullPath, "utf8"));
}

function assertCursorHooks(relativePath) {
  const data = readJson(relativePath);
  if (data.version !== 1) {
    throw new Error(`${relativePath}: expected version 1`);
  }
  if (!data.hooks || typeof data.hooks !== "object") {
    throw new Error(`${relativePath}: missing hooks object`);
  }
}

function main() {
  readJson(".cursor-plugin/marketplace.json");
  assertCursorHooks("install/cursor-hooks.json");
  readJson("plugins/do-it-cursor/.cursor-plugin/plugin.json");
  assertCursorHooks("plugins/do-it-cursor/hooks/hooks.json");

  const matrixPath = path.join(repoRoot, "docs", "harness-adapter-matrix.md");
  if (!fs.existsSync(matrixPath)) {
    throw new Error("missing docs/harness-adapter-matrix.md");
  }

  const opencodePkg = readJson("plugins/do-it-opencode/package.json");
  const rootPkg = readJson("package.json");
  if (opencodePkg.version !== rootPkg.version) {
    throw new Error(
      `plugins/do-it-opencode version ${opencodePkg.version} does not match root ${rootPkg.version}`
    );
  }

  console.log("validate-harness-matrix: cursor + opencode plugin OK");
}

try {
  main();
} catch (error) {
  console.error(`validate-harness-matrix: ${error.message}`);
  process.exit(1);
}
