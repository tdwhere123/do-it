#!/usr/bin/env node

import fs from "node:fs";
import crypto from "node:crypto";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const manifest = readJson(path.join(repoRoot, "manifest.json"));
const pkg = readJson(path.join(repoRoot, "package.json"));

const pluginRoot = path.join(repoRoot, "plugins", "do-it-opencode");
const skillsSource = path.join(repoRoot, "skills", "do-it");
const agentsSource = path.join(repoRoot, "dist", "claude", "agents");
const hooksSource = path.join(repoRoot, "hooks");
const hookScripts = ["grill-pretool.sh", "write-quality-lint.sh", "verification-gate.sh"];

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function assertVersionParity() {
  if (manifest.version !== pkg.version) {
    throw new Error(`manifest version ${manifest.version} does not match package version ${pkg.version}`);
  }

  const pluginPkgPath = path.join(pluginRoot, "package.json");
  const pluginPkg = readJson(pluginPkgPath);
  if (pluginPkg.version !== pkg.version) {
    throw new Error(
      `plugins/do-it-opencode version ${pluginPkg.version} does not match root package version ${pkg.version}`
    );
  }
}

function copySkills() {
  if (!fs.existsSync(skillsSource)) {
    throw new Error(`skills source missing: ${path.relative(repoRoot, skillsSource)}`);
  }

  const targetDir = path.join(pluginRoot, "skills");
  fs.rmSync(targetDir, { recursive: true, force: true });
  fs.cpSync(skillsSource, targetDir, { recursive: true });

  const indexScript = path.join(repoRoot, "scripts", "build-skills-index.mjs");
  if (fs.existsSync(indexScript)) {
    const result = spawnSync(process.execPath, [indexScript], {
      cwd: repoRoot,
      encoding: "utf8"
    });
    if (result.status !== 0) {
      throw new Error(`build-skills-index failed: ${result.stderr || result.stdout}`);
    }
    const generatedIndex = path.join(repoRoot, "plugins", "do-it", "skills", "_index.md");
    if (fs.existsSync(generatedIndex)) {
      fs.copyFileSync(generatedIndex, path.join(targetDir, "_index.md"));
    }
  }
}

function copyAgents() {
  if (!fs.existsSync(agentsSource)) {
    throw new Error(
      "dist/claude/agents missing — run `npm run build:generated` first " +
        "(build-claude-agents.mjs emits agent markdown from agents/*.toml)"
    );
  }

  const targetDir = path.join(pluginRoot, "agents");
  fs.rmSync(targetDir, { recursive: true, force: true });
  fs.cpSync(agentsSource, targetDir, { recursive: true });
}

function copyHooks() {
  const targetDir = path.join(pluginRoot, "hooks");
  fs.rmSync(targetDir, { recursive: true, force: true });
  fs.mkdirSync(targetDir, { recursive: true });

  for (const name of hookScripts) {
    const sourcePath = path.join(hooksSource, name);
    if (!fs.existsSync(sourcePath)) {
      throw new Error(`hook script missing: ${path.relative(repoRoot, sourcePath)}`);
    }
    fs.copyFileSync(sourcePath, path.join(targetDir, name));
    try {
      fs.chmodSync(path.join(targetDir, name), 0o755);
    } catch {
      // best-effort
    }
  }

  for (const dirName of ["lib", "data"]) {
    const sourcePath = path.join(hooksSource, dirName);
    if (!fs.existsSync(sourcePath)) {
      throw new Error(`hooks/${dirName} missing`);
    }
    fs.cpSync(sourcePath, path.join(targetDir, dirName), { recursive: true });
  }
}

function ensureOpencodeDeps() {
  const pluginPkgDir = pluginRoot;
  const localTsc = path.join(pluginPkgDir, "node_modules", ".bin", "tsc");
  if (fs.existsSync(localTsc)) {
    return;
  }

  const result = spawnSync("npm", ["install", "--no-audit", "--no-fund"], {
    cwd: pluginPkgDir,
    encoding: "utf8",
    stdio: "pipe"
  });

  if (result.status !== 0) {
    console.error("OpenCode plugin dependency install failed:");
    if (result.stdout) console.error(result.stdout.trim());
    if (result.stderr) console.error(result.stderr.trim());
    throw new Error("npm install is required to compile the OpenCode plugin.");
  }
}

function compileTypeScript() {
  const pluginPkgDir = pluginRoot;
  ensureOpencodeDeps();
  const localTsc = path.join(pluginPkgDir, "node_modules", ".bin", "tsc");
  const result = spawnSync(localTsc, ["-p", "tsconfig.json"], {
    cwd: pluginPkgDir,
    encoding: "utf8",
    stdio: "pipe"
  });

  if (result.status !== 0) {
    console.error("TypeScript compilation failed:");
    if (result.stdout) console.error(result.stdout.trim());
    if (result.stderr) console.error(result.stderr.trim());
    throw new Error("TypeScript compilation is required to build the OpenCode plugin.");
  }
}

function main() {
  assertVersionParity();
  copySkills();
  copyAgents();
  copyHooks();
  compileTypeScript();

  const skillCount = fs.readdirSync(path.join(pluginRoot, "skills")).length;
  const agentCount = fs.readdirSync(path.join(pluginRoot, "agents")).filter((name) => name.endsWith(".md")).length;

  console.log(
    `built OpenCode plugin -> ${path.relative(repoRoot, pluginRoot)} ` +
      `(${skillCount} skills, ${agentCount} agents, ${hookScripts.length} hook scripts)`
  );
}

main();
