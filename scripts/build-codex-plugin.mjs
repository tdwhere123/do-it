#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { rewritePluginReferenceLinks } from "./lib/rewrite-plugin-ref-links.mjs";
import { readJson, writeJsonAtomic, assertVersionParity } from "./lib/plugin-build.mjs";
import { CODEX_HOOK_FILES, codexHooksJson } from "./lib/hook-manifest.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const manifest = readJson(path.join(repoRoot, "manifest.json"));
const pkg = readJson(path.join(repoRoot, "package.json"));

const pluginRoot = path.join(repoRoot, "plugins", "do-it");
const pluginManifestDir = path.join(pluginRoot, ".codex-plugin");
const marketplacePath = path.join(repoRoot, ".agents", "plugins", "marketplace.json");

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

function copySkills(entries) {
  const targetDir = path.join(pluginRoot, "skills");
  fs.rmSync(targetDir, { recursive: true, force: true });
  fs.mkdirSync(targetDir, { recursive: true });

  for (const entry of entries) {
    const sourcePath = path.join(repoRoot, entry.source);
    if (!fs.existsSync(sourcePath)) {
      throw new Error(`Manifest source missing for ${entry.name}: ${entry.source}`);
    }

    const targetName = basenameFromTarget(entry.target, "skills");
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
    hooks: "./hooks/hooks.json",
    interface: {
      displayName: "do-it",
      shortDescription: "Professional judgment and independent specialists for Codex.",
      longDescription:
        "The plugin delivers task-fit skills, compact context, and source-edit checks. Install named specialists separately with do-it setup --target=codex --only=agents. Trust plugin hooks in /hooks after install.",
      developerName: "tdwhere123",
      category: "Coding",
      capabilities: ["Skills", "Hooks"],
      websiteURL: "https://github.com/tdwhere123/do-it",
      defaultPrompt: [
        "Work autonomously: choose do-it skills when task-fit helps; honor direct user intent and existing authorization, and report task-relevant evidence."
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
  assertVersionParity(manifest, pkg);

  const skills = manifest.skills ?? [];
  const optionalSkills = skills.filter((entry) => entry.optional).map((entry) => entry.name);

  fs.mkdirSync(pluginManifestDir, { recursive: true });
  copySkills(skills);
  // Codex 0.162.0 skips hooks for root plugin.json and does not discover plugin agents.
  // Native roles are installed separately from the canonical package agents/ source.
  fs.rmSync(path.join(pluginRoot, "plugin.json"), { force: true });
  fs.rmSync(path.join(pluginRoot, "agents"), { recursive: true, force: true });

  const refsSource = path.join(repoRoot, "skills", "do-it", "references");
  if (!fs.existsSync(refsSource)) {
    throw new Error(`references missing: ${path.relative(repoRoot, refsSource)}`);
  }
  fs.cpSync(refsSource, path.join(pluginRoot, "skills", "references"), { recursive: true });
  rewritePluginReferenceLinks(path.join(pluginRoot, "skills", "references"));

  // Plugin-bundled hooks (official Codex plugin hooks path).
  const hooksSource = path.join(repoRoot, "hooks");
  const hooksTarget = path.join(pluginRoot, "hooks");
  fs.rmSync(hooksTarget, { recursive: true, force: true });
  fs.mkdirSync(hooksTarget, { recursive: true });
  for (const name of CODEX_HOOK_FILES) {
    const src = path.join(hooksSource, name);
    if (fs.existsSync(src)) fs.cpSync(src, path.join(hooksTarget, name));
  }
  fs.cpSync(path.join(hooksSource, "lib"), path.join(hooksTarget, "lib"), { recursive: true });
  fs.cpSync(path.join(hooksSource, "data"), path.join(hooksTarget, "data"), { recursive: true });

  // Codex wiring lives in scripts/lib/hook-manifest.mjs (single source).
  writeJsonAtomic(path.join(hooksTarget, "hooks.json"), codexHooksJson());

  writeJsonAtomic(path.join(pluginManifestDir, "plugin.json"), buildPluginManifest());
  writeJsonAtomic(marketplacePath, buildMarketplace());

  console.log(
    `built Codex plugin -> ${path.relative(repoRoot, pluginRoot)} ` +
      `(${skills.length} skills, hooks: yes, optional: ${optionalSkills.join(", ") || "none"})`
  );
}

main();
