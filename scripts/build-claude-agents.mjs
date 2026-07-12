#!/usr/bin/env node

import fs from "node:fs";
import crypto from "node:crypto";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const agentsDir = path.join(repoRoot, "agents");
const outDir = path.join(repoRoot, "dist", "claude", "agents");

const CODEX_AGENT_KEYS = new Set([
  "name",
  "description",
  "sandbox_mode",
  "developer_instructions"
]);

function parseSimpleToml(source) {
  const result = {};
  let i = 0;
  while (i < source.length) {
    while (i < source.length && /\s/.test(source[i])) i += 1;
    if (i >= source.length) break;
    if (source[i] === "#") {
      while (i < source.length && source[i] !== "\n") i += 1;
      continue;
    }
    const keyMatch = source.slice(i).match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*/);
    if (!keyMatch) {
      throw new Error(
        `cannot parse key at offset ${i}: ${source.slice(i, Math.min(i + 60, source.length))}`
      );
    }
    const key = keyMatch[1];
    i += keyMatch[0].length;

    let value;
    if (source.startsWith('"""', i)) {
      i += 3;
      const end = source.indexOf('"""', i);
      if (end < 0) {
        throw new Error(`unterminated triple-quoted string for key ${key}`);
      }
      value = source.slice(i, end);
      if (value.startsWith("\n")) value = value.slice(1);
      i = end + 3;
    } else if (source[i] === '"') {
      i += 1;
      let buf = "";
      while (i < source.length && source[i] !== '"') {
        if (source[i] === "\\" && i + 1 < source.length) {
          const next = source[i + 1];
          if (next === "n") buf += "\n";
          else if (next === "t") buf += "\t";
          else if (next === "\\") buf += "\\";
          else if (next === '"') buf += '"';
          else buf += next;
          i += 2;
        } else {
          buf += source[i];
          i += 1;
        }
      }
      i += 1;
      value = buf;
    } else {
      const restMatch = source.slice(i).match(/^([^\n]*)/);
      value = restMatch[1].trim();
      i += restMatch[0].length;
    }

    result[key] = value;
  }
  return result;
}

function escapeYamlDoubleQuoted(str) {
  return JSON.stringify(str);
}

function buildClaudeAgent(toml) {
  const data = parseSimpleToml(toml);
  if (!data.name) throw new Error("agent missing name");
  for (const key of Object.keys(data)) {
    if (!CODEX_AGENT_KEYS.has(key)) {
      throw new Error(
        `agent contains unsupported Codex TOML key ${key}; keep host-private policy out of agents/*.toml`
      );
    }
  }
  const description = data.description ?? "";
  const body = (data.developer_instructions ?? "").replace(/\s+$/g, "");
  return [
    "---",
    `name: ${data.name}`,
    `description: ${escapeYamlDoubleQuoted(description)}`,
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
