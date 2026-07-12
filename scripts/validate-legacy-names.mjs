#!/usr/bin/env node

// Hard-delete guard for the 0.14 meaning-centric product. Historical migration
// references stay in CHANGELOG/manifest retirement metadata; every installed or
// generated surface must use canonical skill names.

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const retired = [
  "do-it-planning", "do-it-slicing", "do-it-grill", "do-it-brainstorm",
  "do-it-architecture-scan", "do-it-codebase-design", "do-it-interface-drill",
  "do-it-tdd", "do-it-debugging", "do-it-subagent-orchestration",
  "do-it-review-loop", "do-it-fix-loop", "do-it-verification-gate",
  "do-it-worktree-isolation", "do-it-branch-closeout", "do-it-comments-discipline"
];
const pattern = new RegExp(`\\b(?:${retired.join("|")})\\b`, "g");
const roots = [
  "agents", "commands", "hooks", "skills/do-it", "scripts",
  "plugins/do-it", "plugins/do-it-cursor", "plugins/do-it-opencode",
  "dist/claude", ".claude-plugin", ".cursor-plugin"
];
const ignored = new Set([
  "plugins/do-it-opencode/node_modules",
  "plugins/do-it-opencode/dist"
]);
const allowed = new Set([
  "hooks/verification-gate.sh"
]);
const errors = [];

function walk(relative) {
  if (ignored.has(relative) || relative === "scripts/validate-legacy-names.mjs") return;
  const full = path.join(repoRoot, relative);
  if (!fs.existsSync(full)) return;
  const stat = fs.statSync(full);
  if (stat.isDirectory()) {
    for (const child of fs.readdirSync(full)) walk(path.join(relative, child));
    return;
  }
  if (!/\.(md|json|toml|sh|mjs|ts|js)$/.test(relative)) return;
  if (allowed.has(relative)) return;
  const text = fs.readFileSync(full, "utf8");
  const matches = [...text.matchAll(pattern)].map((match) => match[0]);
  if (matches.length) errors.push(`${relative}: ${[...new Set(matches)].join(", ")}`);
}

for (const root of roots) {
  if (!ignored.has(root)) walk(root);
}

if (errors.length) {
  console.error(`validate-legacy-names: ${errors.length} live reference(s)`);
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}
console.log("validate-legacy-names: no retired skill names on live surfaces");
