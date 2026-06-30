#!/usr/bin/env node

import fs from "node:fs";
import crypto from "node:crypto";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const manifest = readJson(path.join(repoRoot, "manifest.json"));
const pkg = readJson(path.join(repoRoot, "package.json"));

const pluginRoot = path.join(repoRoot, "plugins", "do-it");
const pluginManifestDir = path.join(pluginRoot, ".codex-plugin");
const marketplacePath = path.join(repoRoot, ".agents", "plugins", "marketplace.json");

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

function basenameFromTarget(target, expectedPrefix) {
  const prefix = `${expectedPrefix}/`;
  if (!target.startsWith(prefix)) {
    throw new Error(`Expected ${target} to start with ${prefix}`);
  }
  const name = target.slice(prefix.length);
  if (!name || name.includes("/") || name.startsWith(".")) {
    throw new Error(`Unsafe generated plugin target: ${target}`);
  }
  return name;
}

function copyManagedDir(entries, kind) {
  const targetDir = path.join(pluginRoot, kind === "skill" ? "skills" : "agents");
  fs.rmSync(targetDir, { recursive: true, force: true });
  fs.mkdirSync(targetDir, { recursive: true });

  for (const entry of entries) {
    const sourcePath = path.join(repoRoot, entry.source);
    if (!fs.existsSync(sourcePath)) {
      throw new Error(`Manifest source missing for ${entry.name}: ${entry.source}`);
    }

    const targetName = kind === "skill"
      ? basenameFromTarget(entry.target, "skills")
      : basenameFromTarget(entry.target, "agents");
    const targetPath = path.join(targetDir, targetName);
    fs.cpSync(sourcePath, targetPath, { recursive: true });
  }
}

function buildPluginManifest() {
  return {
    name: "do-it",
    version: pkg.version,
    description: pkg.description,
    author: {
      name: pkg.author
    },
    homepage: pkg.homepage,
    repository: pkg.repository?.url?.replace(/^git\+/, "").replace(/\.git$/, "") ?? "https://github.com/tdwhere123/do-it",
    license: pkg.license,
    keywords: [
      "codex",
      "workflow",
      "skills",
      "agents",
      "subagents",
      "verification",
      "do-it"
    ],
    skills: "./skills/",
    interface: {
      displayName: "do-it",
      shortDescription: "Risk-routed workflow discipline for Codex.",
      longDescription:
        "Install do-it skills and agents for risk-based routing, scoped delegation, review loops, and evidence-backed completion. Run do-it setup for enforced global hooks.",
      developerName: "tdwhere123",
      category: "Coding",
      capabilities: ["Skills", "Agents"],
      websiteURL: "https://github.com/tdwhere123/do-it",
      defaultPrompt: [
        "Use do-it-router for this repository task.",
        "Review this change with do-it-review-loop.",
        "Close this branch with do-it-verification-gate."
      ],
      brandColor: "#2563EB"
    }
  };
}

function buildMarketplace() {
  return {
    name: "tdwhere-do-it",
    interface: {
      displayName: "do-it workflow"
    },
    plugins: [
      {
        name: "do-it",
        source: {
          source: "local",
          path: "./plugins/do-it"
        },
        policy: {
          installation: "AVAILABLE",
          authentication: "ON_INSTALL"
        },
        category: "Coding"
      }
    ]
  };
}

function main() {
  assertVersionParity();

  const skills = manifest.skills ?? [];
  const agents = manifest.agents ?? [];
  const optionalSkills = skills.filter((entry) => entry.optional).map((entry) => entry.name);

  fs.mkdirSync(pluginManifestDir, { recursive: true });
  copyManagedDir(skills, "skill");
  copyManagedDir(agents, "agent");

  const refsSource = path.join(repoRoot, "skills", "do-it", "references");
  if (!fs.existsSync(refsSource)) {
    throw new Error(`references missing: ${path.relative(repoRoot, refsSource)}`);
  }
  fs.cpSync(refsSource, path.join(pluginRoot, "skills", "references"), { recursive: true });

  writeJsonAtomic(path.join(pluginManifestDir, "plugin.json"), buildPluginManifest());
  writeJsonAtomic(marketplacePath, buildMarketplace());

  console.log(
    `built Codex plugin -> ${path.relative(repoRoot, pluginRoot)} ` +
      `(${skills.length} skills, ${agents.length} agents, optional: ${optionalSkills.join(", ") || "none"})`
  );
}

main();
