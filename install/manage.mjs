#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const VALID_COMMANDS = new Set(["install", "doctor"]);

function usage() {
  console.error("Usage: manage.mjs <install|doctor>");
  process.exit(2);
}

const command = process.argv[2];

if (!VALID_COMMANDS.has(command)) {
  usage();
}

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const manifestPath = path.join(repoRoot, "manifest.json");
const codexHome = process.env.CODEX_HOME
  ? path.resolve(process.env.CODEX_HOME)
  : path.join(process.env.HOME ?? "", ".codex");

if (!process.env.CODEX_HOME && !process.env.HOME) {
  throw new Error("HOME is not set. Set CODEX_HOME explicitly.");
}

const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const entries = [
  ...manifest.skills.map((entry) => ({ kind: "skill", ...entry })),
  ...manifest.agents.map((entry) => ({ kind: "agent", ...entry }))
];

function resolveRepoPath(relativePath) {
  return path.join(repoRoot, relativePath);
}

function resolveHomePath(relativePath) {
  return path.join(codexHome, relativePath);
}

function assertWithinCodexHome(targetPath) {
  const relativePath = path.relative(codexHome, targetPath);
  const isWithin =
    relativePath === "" ||
    (!relativePath.startsWith("..") && !path.isAbsolute(relativePath));

  if (!isWithin) {
    throw new Error(`Refusing to operate outside CODEX_HOME: ${targetPath}`);
  }
}

function pathState(targetPath) {
  try {
    return fs.lstatSync(targetPath);
  } catch {
    return null;
  }
}

function removeManagedTarget(targetPath) {
  assertWithinCodexHome(targetPath);
  fs.rmSync(targetPath, { recursive: true, force: true });
}

function copyEntry(sourcePath, targetPath) {
  const sourceStat = fs.lstatSync(sourcePath);
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });

  if (sourceStat.isDirectory()) {
    fs.cpSync(sourcePath, targetPath, { recursive: true });
    return;
  }

  fs.copyFileSync(sourcePath, targetPath);
}

function walkDirectory(rootPath) {
  const results = [];

  function visit(currentPath, relativePath) {
    const stat = fs.lstatSync(currentPath);

    if (stat.isDirectory()) {
      const children = fs.readdirSync(currentPath).sort();
      for (const child of children) {
        const childRelative = relativePath ? path.join(relativePath, child) : child;
        visit(path.join(currentPath, child), childRelative);
      }
      return;
    }

    results.push(relativePath);
  }

  visit(rootPath, "");
  return results;
}

function filesMatch(sourcePath, targetPath) {
  const sourceBuffer = fs.readFileSync(sourcePath);
  const targetBuffer = fs.readFileSync(targetPath);
  return sourceBuffer.equals(targetBuffer);
}

function treesMatch(sourcePath, targetPath) {
  const sourceStat = fs.lstatSync(sourcePath);
  const targetStat = fs.lstatSync(targetPath);

  if (sourceStat.isDirectory() !== targetStat.isDirectory()) {
    return false;
  }

  if (!sourceStat.isDirectory()) {
    return filesMatch(sourcePath, targetPath);
  }

  const sourceFiles = walkDirectory(sourcePath);
  const targetFiles = walkDirectory(targetPath);

  if (sourceFiles.length !== targetFiles.length) {
    return false;
  }

  for (let index = 0; index < sourceFiles.length; index += 1) {
    if (sourceFiles[index] !== targetFiles[index]) {
      return false;
    }

    const sourceFile = path.join(sourcePath, sourceFiles[index]);
    const targetFile = path.join(targetPath, targetFiles[index]);

    if (!filesMatch(sourceFile, targetFile)) {
      return false;
    }
  }

  return true;
}

function collectShadowWarnings() {
  const warnings = [];

  for (const skill of manifest.skills) {
    const shadowPath = path.join(codexHome, "superpowers", "skills", skill.name);
    if (pathState(shadowPath)) {
      warnings.push(
        `overlapping upstream skill remains at ${shadowPath}; installed target is ${resolveHomePath(skill.target)}`
      );
    }
  }

  return warnings;
}

function printWarnings(warnings) {
  for (const warning of warnings) {
    console.warn(`WARNING: ${warning}`);
  }
}

function install() {
  fs.mkdirSync(resolveHomePath("skills"), { recursive: true });
  fs.mkdirSync(resolveHomePath("agents"), { recursive: true });

  const summary = [];

  for (const entry of entries) {
    const sourcePath = resolveRepoPath(entry.source);
    const targetPath = resolveHomePath(entry.target);

    if (!pathState(sourcePath)) {
      throw new Error(`Manifest source is missing: ${entry.source}`);
    }

    removeManagedTarget(targetPath);

    copyEntry(sourcePath, targetPath);

    summary.push(`${entry.kind}:${entry.name}`);
  }

  console.log(`install completed into ${codexHome}`);
  console.log(`managed entries: ${summary.length}`);
  for (const item of summary) {
    console.log(`- ${item}`);
  }

  printWarnings(collectShadowWarnings());
}

function doctor() {
  const missing = [];
  const drift = [];
  const ok = [];

  for (const entry of entries) {
    const sourcePath = resolveRepoPath(entry.source);
    const targetPath = resolveHomePath(entry.target);

    if (!pathState(sourcePath)) {
      drift.push(`${entry.kind}:${entry.name} source missing at ${sourcePath}`);
      continue;
    }

    const targetState = pathState(targetPath);

    if (!targetState) {
      missing.push(`${entry.kind}:${entry.name} missing at ${targetPath}`);
      continue;
    }

    if (targetState.isSymbolicLink()) {
      drift.push(`${entry.kind}:${entry.name} is symlinked at ${targetPath}; copy-based install required`);
      continue;
    }

    if (!treesMatch(sourcePath, targetPath)) {
      drift.push(`${entry.kind}:${entry.name} content drift at ${targetPath}`);
      continue;
    }

    ok.push(`${entry.kind}:${entry.name} copy`);
  }

  console.log(`doctor checked ${entries.length} managed entries in ${codexHome}`);
  console.log(`ok: ${ok.length}`);
  console.log(`missing: ${missing.length}`);
  console.log(`drift: ${drift.length}`);

  for (const item of ok) {
    console.log(`- OK ${item}`);
  }

  for (const item of missing) {
    console.log(`- MISSING ${item}`);
  }

  for (const item of drift) {
    console.log(`- DRIFT ${item}`);
  }

  printWarnings(collectShadowWarnings());

  if (missing.length > 0 || drift.length > 0) {
    process.exitCode = 1;
  }
}

if (command === "install") {
  install();
} else {
  doctor();
}
