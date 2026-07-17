#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ALL_SKILLS } from "./skill-tiers.mjs";
import { rewritePluginReferenceLinks } from "./lib/rewrite-plugin-ref-links.mjs";
import {
  readJson,
  writeJsonAtomic,
  assertVersionParity,
  copyAgentsDir,
  copyHookScripts
} from "./lib/plugin-build.mjs";
import { CURSOR_HOOK_FILES } from "./lib/hook-manifest.mjs";

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
  copyAgentsDir(agentsSource, path.join(pluginRoot, "agents"));
}

function copyHooks() {
  if (!fs.existsSync(cursorHooksSource)) {
    throw new Error(`cursor hooks source missing: ${path.relative(repoRoot, cursorHooksSource)}`);
  }

  const targetDir = path.join(pluginRoot, "hooks");
  copyHookScripts({ repoRoot, hooksSource, targetDir, scripts: CURSOR_HOOK_FILES });

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
  assertVersionParity(manifest, pkg);

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
