#!/usr/bin/env node

import fs from "node:fs";
import crypto from "node:crypto";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { ALL_SKILLS } from "./skill-tiers.mjs";
import { rewritePluginReferenceLinks } from "./lib/rewrite-plugin-ref-links.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const manifest = readJson(path.join(repoRoot, "manifest.json"));
const pkg = readJson(path.join(repoRoot, "package.json"));

const pluginRoot = path.join(repoRoot, "plugins", "do-it-cursor");
const pluginManifestDir = path.join(pluginRoot, ".cursor-plugin");
const skillsSource = path.join(repoRoot, "skills", "do-it");
const agentsSource = path.join(repoRoot, "dist", "claude", "agents");
const hooksSource = path.join(repoRoot, "hooks");
const cursorHooksSource = path.join(repoRoot, "install", "cursor-hooks.json");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJsonAtomic(filePath, value) {
  const content = `${JSON.stringify(value, null, 2)}\n`;
  const current = fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf8") : null;
  if (current === content) return false;

  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tempPath = path.join(
    path.dirname(filePath),
    `.do-it-${path.basename(filePath)}.${process.pid}.${crypto.randomUUID()}.tmp`
  );

  try {
    fs.writeFileSync(tempPath, content);
    fs.renameSync(tempPath, filePath);
  } finally {
    fs.rmSync(tempPath, { force: true });
  }

  return true;
}

function assertVersionParity() {
  if (manifest.version !== pkg.version) {
    throw new Error(`manifest version ${manifest.version} does not match package version ${pkg.version}`);
  }
}

function copySkills() {
  if (!fs.existsSync(skillsSource)) {
    throw new Error(`skills source missing: ${path.relative(repoRoot, skillsSource)}`);
  }

  const targetDir = path.join(pluginRoot, "skills");
  const refsSource = path.join(skillsSource, "references");
  fs.rmSync(targetDir, { recursive: true, force: true });
  fs.mkdirSync(targetDir, { recursive: true });

  for (const name of ALL_SKILLS) {
    const sourcePath = path.join(skillsSource, name);
    if (!fs.existsSync(sourcePath)) {
      throw new Error(`skill missing: ${path.relative(repoRoot, sourcePath)}`);
    }
    fs.cpSync(sourcePath, path.join(targetDir, name), { recursive: true });
  }

  if (!fs.existsSync(refsSource)) {
    throw new Error(`references missing: ${path.relative(repoRoot, refsSource)}`);
  }
  fs.cpSync(refsSource, path.join(targetDir, "references"), { recursive: true });
  rewritePluginReferenceLinks(path.join(targetDir, "references"));

  const indexSource = path.join(repoRoot, "dist", "claude", "skills", "_index.md");
  if (!fs.existsSync(indexSource)) {
    throw new Error(
      "dist/claude/skills/_index.md missing — run `node scripts/build-skills-index.mjs`"
    );
  }
  fs.copyFileSync(indexSource, path.join(targetDir, "_index.md"));
}

function copyAgents() {
  if (!fs.existsSync(agentsSource)) {
    throw new Error(
      "dist/claude/agents missing — run `npm run build:generated` first " +
        "(build-claude-agents.mjs emits Claude/Cursor agent markdown from agents/*.toml)"
    );
  }

  const targetDir = path.join(pluginRoot, "agents");
  fs.rmSync(targetDir, { recursive: true, force: true });
  fs.cpSync(agentsSource, targetDir, { recursive: true });
}

function copyHooks() {
  if (!fs.existsSync(cursorHooksSource)) {
    throw new Error(`cursor hooks source missing: ${path.relative(repoRoot, cursorHooksSource)}`);
  }

  const targetDir = path.join(pluginRoot, "hooks");
  fs.rmSync(targetDir, { recursive: true, force: true });
  fs.mkdirSync(targetDir, { recursive: true });

  for (const name of fs.readdirSync(hooksSource)) {
    if (!name.endsWith(".sh") && !name.endsWith(".cmd")) continue;
    fs.copyFileSync(path.join(hooksSource, name), path.join(targetDir, name));
    try {
      fs.chmodSync(path.join(targetDir, name), 0o755);
    } catch {
      // best-effort on platforms that ignore chmod
    }
  }

  for (const dirName of ["lib", "data"]) {
    const sourcePath = path.join(hooksSource, dirName);
    if (!fs.existsSync(sourcePath)) {
      throw new Error(`hooks/${dirName} missing`);
    }
    fs.cpSync(sourcePath, path.join(targetDir, dirName), { recursive: true });
  }

  fs.copyFileSync(cursorHooksSource, path.join(targetDir, "hooks.json"));
}

function buildPluginManifest() {
  // Match https://cursor.com/schemas/cursor-plugin/plugin.json (additionalProperties: false).
  // Do not emit Codex-only fields such as `interface`.
  return {
    name: "do-it-cursor",
    displayName: "do-it",
    version: pkg.version,
    description: pkg.description,
    author: {
      name: pkg.author
    },
    homepage: pkg.homepage,
    repository: pkg.repository?.url?.replace(/^git\+/, "").replace(/\.git$/, "") ?? "https://github.com/tdwhere123/do-it",
    license: pkg.license,
    keywords: [
      "cursor",
      "workflow",
      "skills",
      "agents",
      "subagents",
      "verification",
      "do-it"
    ],
    category: "Coding",
    logo: "assets/logo.svg",
    skills: "./skills/",
    agents: "./agents/",
    hooks: "./hooks/hooks.json"
  };
}

function main() {
  assertVersionParity();

  fs.mkdirSync(pluginManifestDir, { recursive: true });
  copySkills();
  copyAgents();
  copyHooks();

  writeJsonAtomic(path.join(pluginManifestDir, "plugin.json"), buildPluginManifest());

  const skillCount = fs
    .readdirSync(path.join(pluginRoot, "skills"))
    .filter((name) => name !== "references" && fs.statSync(path.join(pluginRoot, "skills", name)).isDirectory())
    .length;
  const agentCount = fs.readdirSync(path.join(pluginRoot, "agents")).filter((name) => name.endsWith(".md")).length;

  console.log(
    `built Cursor plugin -> ${path.relative(repoRoot, pluginRoot)} ` +
      `(${skillCount} skills, ${agentCount} agents; agents require npm run build:generated)`
  );
}

main();
