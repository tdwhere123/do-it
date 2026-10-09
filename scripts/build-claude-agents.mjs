#!/usr/bin/env node

import fs from "node:fs";
import crypto from "node:crypto";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { parseAgentToml } from "./lib/agent-source.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const agentsDir = path.join(repoRoot, "agents");
const outDir = path.join(repoRoot, "dist", "claude", "agents");

function escapeYamlDoubleQuoted(str) {
  return JSON.stringify(str);
}

function buildClaudeAgent(toml) {
  const data = parseAgentToml(toml);
  const description = data.description ?? "";
  const body = (data.developer_instructions ?? "").replace(/\s+$/g, "");
  return [
    "---",
    `name: ${data.name}`,
    `description: ${escapeYamlDoubleQuoted(description)}`,
    ...(data.sandbox_mode === "read-only" ? ["disallowedTools: Edit, Write, NotebookEdit"] : []),
    "---",
    "",
    body,
    ""
  ].join("\n");
}

function writeFileAtomic(targetPath, content) {
  const targetDir = path.dirname(targetPath);
  fs.mkdirSync(targetDir, { recursive: true });

  const tempPath = path.join(
    targetDir,
    `.tmp-${path.basename(targetPath)}.${process.pid}.${crypto.randomUUID()}`
  );

  try {
    fs.writeFileSync(tempPath, content);
    fs.renameSync(tempPath, targetPath);
  } finally {
    fs.rmSync(tempPath, { force: true });
  }
}

function main() {
  if (!fs.existsSync(agentsDir)) {
    throw new Error(`agents directory missing: ${agentsDir}`);
  }
  // Prune: outDir must match agents/*.toml exactly (no leftover .md).
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });

  const tomlFiles = fs
    .readdirSync(agentsDir)
    .filter((f) => f.endsWith(".toml"))
    .sort();

  let count = 0;
  const errors = [];
  for (const file of tomlFiles) {
    const sourcePath = path.join(agentsDir, file);
    const targetPath = path.join(outDir, file.replace(/\.toml$/, ".md"));
    try {
      const toml = fs.readFileSync(sourcePath, "utf8");
      const md = buildClaudeAgent(toml);
      writeFileAtomic(targetPath, md);
      count += 1;
    } catch (error) {
      errors.push(`${file}: ${error.message}`);
    }
  }

  if (errors.length > 0) {
    console.error(`build-claude-agents: ${errors.length} failures`);
    for (const message of errors) console.error(`- ${message}`);
    process.exit(1);
  }

  console.log(`built ${count} Claude agents → ${path.relative(repoRoot, outDir)}`);
}

main();
