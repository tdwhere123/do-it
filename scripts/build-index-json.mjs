#!/usr/bin/env node

import fs from "node:fs";
import crypto from "node:crypto";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import {
  CORE_SKILLS,
  EXTENDED_MAINTENANCE,
  EXTENDED_ON_DEMAND,
  validateManifestSkillTiers
} from "./skill-tiers.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const manifestPath = path.join(repoRoot, "manifest.json");
const packagePath = path.join(repoRoot, "package.json");
const outFile = path.join(repoRoot, "index.json");

const SKILL_GROUPS = new Map([
  ["do-it-skills-index", "index"],
  ...CORE_SKILLS.map((name) => [name, "mainline"]),
  ...EXTENDED_ON_DEMAND.map((name) => [name, "on-demand"]),
  ...EXTENDED_MAINTENANCE.map((name) => [name, "maintenance"])
]);

function repoPath(relativePath) {
  return path.join(repoRoot, relativePath);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function normalizeRepoUrl(pkg) {
  return (
    pkg.repository?.url
      ?.replace(/^git\+/, "")
      .replace(/\.git$/, "") ?? pkg.homepage ?? "https://github.com/tdwhere123/do-it"
  );
}

function resolveGeneratedAt() {
  if (process.env.DO_IT_INDEX_GENERATED_AT) {
    return process.env.DO_IT_INDEX_GENERATED_AT;
  }

  return new Date().toISOString();
}

function parseFrontmatter(text) {
  // Normalize CRLF (common on native Windows checkouts with core.autocrlf)
  // before looking for YAML fences — otherwise `---\r\n` fails `---\n` checks
  // and every skill looks like name/description is missing.
  const normalized = text.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  if (!normalized.startsWith("---\n")) return {};
  const end = normalized.indexOf("\n---", 4);
  if (end < 0) return {};

  const block = normalized.slice(4, end).trim();
  const out = {};
  const lines = block.split("\n");
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const match = /^([A-Za-z_][A-Za-z0-9_-]*):\s*(.*)$/.exec(line);
    if (!match) continue;

    const key = match[1];
    let value = match[2].trim();
    if (value === ">-" || value === ">") {
      const folded = [];
      while (index + 1 < lines.length && /^\s+/.test(lines[index + 1])) {
        index += 1;
        folded.push(lines[index].trim());
      }
      value = folded.join(" ");
    }
    if (value.startsWith('"') && value.endsWith('"') && value.length >= 2) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

export { parseFrontmatter };

function readTomlStringValue(source, key) {
  const match = new RegExp(`^${key}\\s*=\\s*"([^"]*)"`, "m").exec(source);
  return match?.[1] ?? null;
}

function assertNonEmpty(value, message, errors) {
  if (typeof value !== "string" || value.trim() === "") {
    errors.push(message);
  }
}

function buildSkillEntry(entry, errors) {
  const sourcePath = repoPath(entry.source);
  const base = {
    kind: "skill",
    name: entry.name,
    description: "",
    origin: entry.origin ?? "do-it",
    optional: Boolean(entry.optional),
    group: SKILL_GROUPS.get(entry.name) ?? "other",
    source: entry.source,
    target: entry.target
  };

  if (!fs.existsSync(sourcePath)) {
    errors.push(`manifest skill ${entry.name}: source missing at ${entry.source}`);
    return base;
  }

  const skillFile = path.join(sourcePath, "SKILL.md");
  if (entry.source.startsWith("skills/do-it/")) {
    if (!fs.existsSync(skillFile)) {
      errors.push(`manifest skill ${entry.name}: missing ${entry.source}/SKILL.md`);
      return base;
    }

    const frontmatter = parseFrontmatter(fs.readFileSync(skillFile, "utf8"));
    if (frontmatter.name !== entry.name) {
      errors.push(
        `manifest skill ${entry.name}: SKILL.md name ${frontmatter.name ?? "<missing>"} does not match`
      );
    }
    assertNonEmpty(
      frontmatter.description,
      `manifest skill ${entry.name}: SKILL.md description is missing`,
      errors
    );
    base.description = frontmatter.description ?? "";
    return base;
  }

  if (entry.name === "do-it-skills-index") {
    base.description = "Generated compact index for lazy do-it skill discovery.";
    return base;
  }

  errors.push(`manifest skill ${entry.name}: unsupported generated index source ${entry.source}`);
  return base;
}

function buildAgentEntry(entry, errors) {
  const sourcePath = repoPath(entry.source);
  const base = {
    kind: "agent",
    name: entry.name,
    description: "",
    origin: entry.origin ?? "do-it",
    optional: Boolean(entry.optional),
    source: entry.source,
    target: entry.target
  };

  if (!fs.existsSync(sourcePath)) {
    errors.push(`manifest agent ${entry.name}: source missing at ${entry.source}`);
    return base;
  }

  const source = fs.readFileSync(sourcePath, "utf8");
  const tomlName = readTomlStringValue(source, "name");
  const description = readTomlStringValue(source, "description");

  if (tomlName !== entry.name) {
    errors.push(
      `manifest agent ${entry.name}: TOML name ${tomlName ?? "<missing>"} does not match`
    );
  }
  assertNonEmpty(description, `manifest agent ${entry.name}: description is missing`, errors);
  base.description = description ?? "";
  return base;
}

function countByGroup(entries) {
  const counts = {};
  for (const entry of entries) {
    counts[entry.group] = (counts[entry.group] ?? 0) + 1;
  }
  return Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)));
}

function writeFileAtomic(targetPath, content) {
  const tempPath = path.join(
    path.dirname(targetPath),
    `.do-it-${path.basename(targetPath)}.${process.pid}.${crypto.randomUUID()}.tmp`
  );

  try {
    fs.writeFileSync(tempPath, content);
    fs.renameSync(tempPath, targetPath);
  } finally {
    fs.rmSync(tempPath, { force: true });
  }
}

function main() {
  const manifest = readJson(manifestPath);
  const pkg = readJson(packagePath);
  const errors = [];

  if (manifest.version !== pkg.version) {
    errors.push(`manifest version ${manifest.version} does not match package version ${pkg.version}`);
  }

  for (const error of validateManifestSkillTiers(manifest)) {
    errors.push(error);
  }

  const skillEntries = (manifest.skills ?? []).map((entry) => buildSkillEntry(entry, errors));
  const agentEntries = (manifest.agents ?? []).map((entry) => buildAgentEntry(entry, errors));

  if (errors.length > 0) {
    console.error(`build-index-json: ${errors.length} failure(s)`);
    for (const error of errors) console.error(`- ${error}`);
    process.exit(1);
  }

  const index = {
    version: manifest.version,
    generated_at: resolveGeneratedAt(),
    package: pkg.name,
    repository: normalizeRepoUrl(pkg),
    domain: "agentic-workflow",
    total_skills: skillEntries.length,
    total_agents: agentEntries.length,
    coverage: {
      skill_groups: countByGroup(skillEntries),
      optional_skills: skillEntries
        .filter((entry) => entry.optional)
        .map((entry) => entry.name)
        .sort()
    },
    entries: [...skillEntries, ...agentEntries]
  };

  const content = `${JSON.stringify(index, null, 2)}\n`;
  if (!fs.existsSync(outFile) || fs.readFileSync(outFile, "utf8") !== content) {
    writeFileAtomic(outFile, content);
  }

  console.log(
    `built index.json (${skillEntries.length} skills, ${agentEntries.length} agents) -> ` +
      path.relative(repoRoot, outFile)
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
