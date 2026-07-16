#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const defaultRepoRoot = path.resolve(scriptDir, "..");

function readJson(repoRoot, relativePath) {
  const filePath = path.join(repoRoot, relativePath);
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    throw new Error(`${relativePath} is not readable JSON: ${error.message}`);
  }
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isExpectedVersion(label, version, expectedVersion) {
  if (version === expectedVersion) return true;
  // Local Codex cachebusters are build metadata, not a release-version drift.
  // They let Codex reload the same source checkout without changing the
  // package/marketplace release version.
  return label === "Codex plugin metadata" &&
    new RegExp(`^${escapeRegex(expectedVersion)}\\+codex\\.[A-Za-z0-9._-]+$`).test(version ?? "");
}

export function validateRelease(tag, repoRoot = defaultRepoRoot) {
  const match = /^v(\d+\.\d+\.\d+)$/.exec(tag ?? "");
  if (!match) {
    throw new Error(`release tag must match vX.Y.Z; received ${tag || "<missing>"}`);
  }

  const expectedVersion = match[1];
  const openCodeLock = readJson(repoRoot, "plugins/do-it-opencode/package-lock.json");
  const versions = [
    ["package.json", readJson(repoRoot, "package.json").version],
    ["manifest.json", readJson(repoRoot, "manifest.json").version],
    ["index.json", readJson(repoRoot, "index.json").version],
    ["Claude plugin metadata", readJson(repoRoot, ".claude-plugin/plugin.json").version],
    ["Claude marketplace metadata", readJson(repoRoot, ".claude-plugin/marketplace.json").plugins?.[0]?.version],
    ["Codex plugin metadata", readJson(repoRoot, "plugins/do-it/.codex-plugin/plugin.json").version],
    ["Cursor plugin metadata", readJson(repoRoot, "plugins/do-it-cursor/.cursor-plugin/plugin.json").version],
    ["OpenCode package metadata", readJson(repoRoot, "plugins/do-it-opencode/package.json").version],
    ["OpenCode package lock", openCodeLock.version],
    ["OpenCode package lock root", openCodeLock.packages?.[""]?.version]
  ];

  const mismatches = versions
    .filter(([label, version]) => !isExpectedVersion(label, version, expectedVersion))
    .map(([label, version]) => `${label}: ${version ?? "<missing>"} (expected ${expectedVersion})`);

  const changelogPath = path.join(repoRoot, "CHANGELOG.md");
  const changelog = fs.readFileSync(changelogPath, "utf8");
  if (!new RegExp(`^##\\s+${escapeRegex(expectedVersion)}(?:\\s|$)`, "m").test(changelog)) {
    mismatches.push(`CHANGELOG.md: missing \"## ${expectedVersion}\" entry`);
  }

  if (mismatches.length > 0) {
    throw new Error(`release validation failed for ${tag}:\n- ${mismatches.join("\n- ")}`);
  }

  return { tag, version: expectedVersion, checkedVersions: versions.length };
}

function main() {
  const tag = process.argv[2];
  try {
    const result = validateRelease(tag);
    console.log(
      `release metadata valid for ${result.tag} (${result.checkedVersions} version locations + changelog)`
    );
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
