#!/usr/bin/env node

import fs from "node:fs";
import crypto from "node:crypto";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const VALID_COMMANDS = new Set(["install", "doctor", "setup"]);
const HELP_FLAGS = new Set(["-h", "--help", "help"]);
const FORCE_INSTALL = process.env.DO_IT_FORCE === "1";

function usage(stream = console.error) {
  const commandName =
    process.env.DO_IT_CLI_NAME ||
    path.basename(process.argv[1] || "manage.mjs");

  stream(`Usage: ${commandName} <install|doctor|setup>`);
  stream("");
  stream("Commands:");
  stream("  install  Copy managed skills and agents into CODEX_HOME");
  stream("  doctor   Verify managed entries in CODEX_HOME");
  stream("  setup    Run install, then doctor");
  stream("");
  stream("Environment:");
  stream("  CODEX_HOME  Override the install target; defaults to $HOME/.codex");
  stream("  DO_IT_FORCE=1  Replace existing skill or agent files that are not marked as managed by do-it");
}

const command = process.argv[2];

if (HELP_FLAGS.has(command)) {
  usage(console.log);
  process.exit(0);
}

if (!VALID_COMMANDS.has(command)) {
  usage();
  process.exit(2);
}

if (process.argv.length > 3) {
  usage();
  process.exit(2);
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
const deprecatedTargets = manifest.deprecatedTargets ?? [];
const entries = [
  ...manifest.skills.map((entry) => ({ kind: "skill", ...entry })),
  ...manifest.agents.map((entry) => ({ kind: "agent", ...entry }))
];
const statePath = resolveHomePath(".do-it-install-state.json");

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

function assertManagedTargetShape(entry) {
  const skillPattern = /^skills\/[^/]+$/;
  const agentPattern = /^agents\/[^/]+\.toml$/;
  const pattern = entry.kind === "agent" ? agentPattern : skillPattern;

  if (!pattern.test(entry.target)) {
    throw new Error(
      `Unsafe ${entry.kind} target for ${entry.name}: ${entry.target}. ` +
        "Expected skills/<name> or agents/<name>.toml."
    );
  }
}

function pathState(targetPath) {
  try {
    return fs.lstatSync(targetPath);
  } catch {
    return null;
  }
}

function tempSiblingPath(targetPath, purpose) {
  const parentPath = path.dirname(targetPath);
  const baseName = path.basename(targetPath);
  const tempPath = path.join(
    parentPath,
    `.do-it-${purpose}-${baseName}-${process.pid}-${crypto.randomUUID()}`
  );

  assertWithinCodexHome(tempPath);
  return tempPath;
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

function createStagingRoot() {
  const stagingRoot = path.join(
    codexHome,
    `.do-it-install-staging-${process.pid}-${crypto.randomUUID()}`
  );

  assertWithinCodexHome(stagingRoot);
  fs.mkdirSync(stagingRoot, { recursive: true });
  return stagingRoot;
}

function stagedEntryPath(stagingRoot, entry) {
  const stagedPath = path.join(stagingRoot, entry.target);
  assertWithinCodexHome(stagedPath);
  return stagedPath;
}

function backupTargetForTransaction(targetPath, transaction) {
  assertWithinCodexHome(targetPath);
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });

  const targetState = pathState(targetPath);
  const record = {
    targetPath,
    backupPath: targetState ? tempSiblingPath(targetPath, "backup") : null,
    hadTarget: Boolean(targetState),
    installed: false
  };

  if (targetState) {
    fs.renameSync(targetPath, record.backupPath);
  }

  transaction.push(record);
  return record;
}

function replaceManagedTarget(stagedPath, targetPath, transaction) {
  assertWithinCodexHome(stagedPath);
  assertWithinCodexHome(targetPath);

  const record = backupTargetForTransaction(targetPath, transaction);
  fs.renameSync(stagedPath, targetPath);
  record.installed = true;
}

function removeDeprecatedTarget(targetPath, transaction) {
  backupTargetForTransaction(targetPath, transaction);
}

function rollbackTransaction(transaction) {
  for (const record of [...transaction].reverse()) {
    fs.rmSync(record.targetPath, { recursive: true, force: true });

    if (record.hadTarget && record.backupPath && pathState(record.backupPath)) {
      fs.renameSync(record.backupPath, record.targetPath);
    }
  }
}

function cleanupTransaction(transaction) {
  for (const record of transaction) {
    if (record.backupPath) {
      fs.rmSync(record.backupPath, { recursive: true, force: true });
    }
  }
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

function hashBuffer(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function hashPath(targetPath) {
  const stat = fs.lstatSync(targetPath);

  if (stat.isSymbolicLink()) {
    return `symlink:${hashBuffer(Buffer.from(fs.readlinkSync(targetPath)))}`;
  }

  if (!stat.isDirectory()) {
    return hashBuffer(fs.readFileSync(targetPath));
  }

  const files = walkDirectory(targetPath);
  const hash = crypto.createHash("sha256");

  for (const file of files) {
    hash.update(file);
    hash.update("\0");
    hash.update(fs.readFileSync(path.join(targetPath, file)));
    hash.update("\0");
  }

  return hash.digest("hex");
}

function readInstallState() {
  try {
    return JSON.parse(fs.readFileSync(statePath, "utf8"));
  } catch {
    return { entries: {} };
  }
}

function writeFileAtomic(targetPath, content) {
  assertWithinCodexHome(targetPath);
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });

  const tempPath = tempSiblingPath(targetPath, "state");

  try {
    fs.writeFileSync(tempPath, content);
    fs.renameSync(tempPath, targetPath);
  } finally {
    fs.rmSync(tempPath, { recursive: true, force: true });
  }
}

function writeInstallState() {
  const state = {
    version: manifest.version,
    installedAt: new Date().toISOString(),
    entries: Object.fromEntries(
      entries.map((entry) => [entry.target, { kind: entry.kind, name: entry.name, hash: hashPath(resolveRepoPath(entry.source)) }])
    )
  };

  writeFileAtomic(statePath, `${JSON.stringify(state, null, 2)}\n`);
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

function assertInstallSafe(entry, state) {
  assertManagedTargetShape(entry);

  const sourcePath = resolveRepoPath(entry.source);
  const targetPath = resolveHomePath(entry.target);

  if (!pathState(sourcePath)) {
    throw new Error(`Manifest source is missing: ${entry.source}`);
  }

  assertWithinCodexHome(targetPath);

  const targetState = pathState(targetPath);
  if (!targetState || treesMatch(sourcePath, targetPath)) {
    return;
  }

  const stateEntry = state.entries?.[entry.target];
  if (stateEntry?.hash === hashPath(targetPath)) {
    return;
  }

  if (!FORCE_INSTALL) {
    throw new Error(
      `Refusing to overwrite existing ${entry.kind} target that is not marked as do-it managed: ${entry.target}. ` +
        "Set DO_IT_FORCE=1 to replace it intentionally."
    );
  }
}

function assertDeprecatedRemovalSafe(entry, state) {
  assertManagedTargetShape(entry);

  const targetPath = resolveHomePath(entry.target);
  const targetState = pathState(targetPath);
  if (!targetState) {
    return false;
  }

  assertWithinCodexHome(targetPath);

  const stateEntry = state.entries?.[entry.target];
  const targetHash = hashPath(targetPath);
  if (stateEntry?.hash === targetHash) {
    return true;
  }

  if ((entry.legacyHashes ?? []).includes(targetHash)) {
    return true;
  }

  if (FORCE_INSTALL) {
    return true;
  }

  throw new Error(
    `Refusing to remove existing deprecated ${entry.kind} target that is not marked as do-it managed: ${entry.target}. ` +
      "Set DO_IT_FORCE=1 to remove it intentionally."
  );
}

function collectInstallStateDrift() {
  const stateFile = pathState(statePath);
  if (!stateFile) {
    return [`install state missing at ${statePath}`];
  }

  let state;
  try {
    state = JSON.parse(fs.readFileSync(statePath, "utf8"));
  } catch (error) {
    return [`install state is not readable JSON at ${statePath}: ${error.message}`];
  }

  const issues = [];
  if (state.version !== manifest.version) {
    issues.push(`install state version ${state.version ?? "<missing>"} does not match manifest ${manifest.version}`);
  }

  for (const entry of entries) {
    const sourcePath = resolveRepoPath(entry.source);
    const expectedHash = pathState(sourcePath) ? hashPath(sourcePath) : null;
    const stateEntry = state.entries?.[entry.target];

    if (!stateEntry) {
      issues.push(`install state missing ${entry.kind}:${entry.name} at ${entry.target}`);
      continue;
    }

    if (stateEntry.kind !== entry.kind || stateEntry.name !== entry.name) {
      issues.push(`install state metadata drift for ${entry.kind}:${entry.name} at ${entry.target}`);
    }

    if (expectedHash && stateEntry.hash !== expectedHash) {
      issues.push(`install state hash drift for ${entry.kind}:${entry.name} at ${entry.target}`);
    }
  }

  return issues;
}

function install() {
  const state = readInstallState();

  for (const entry of entries) {
    assertInstallSafe(entry, state);
  }

  for (const deprecated of deprecatedTargets) {
    assertDeprecatedRemovalSafe({ kind: "skill", ...deprecated }, state);
  }

  fs.mkdirSync(resolveHomePath("skills"), { recursive: true });
  fs.mkdirSync(resolveHomePath("agents"), { recursive: true });

  const stagingRoot = createStagingRoot();
  const transaction = [];
  const summary = [];
  let committed = false;

  try {
    for (const entry of entries) {
      const sourcePath = resolveRepoPath(entry.source);
      const stagedPath = stagedEntryPath(stagingRoot, entry);

      copyEntry(sourcePath, stagedPath);
    }

    for (const entry of entries) {
      const stagedPath = stagedEntryPath(stagingRoot, entry);
      const targetPath = resolveHomePath(entry.target);

      replaceManagedTarget(stagedPath, targetPath, transaction);

      summary.push(`${entry.kind}:${entry.name}`);
    }

    for (const deprecated of deprecatedTargets) {
      const entry = { kind: "skill", ...deprecated };

      const targetPath = resolveHomePath(entry.target);
      if (assertDeprecatedRemovalSafe(entry, state)) {
        removeDeprecatedTarget(targetPath, transaction);
        summary.push(`removed:${entry.name}`);
      }
    }

    writeInstallState();
    committed = true;
  } catch (error) {
    rollbackTransaction(transaction);
    throw error;
  } finally {
    if (committed) {
      cleanupTransaction(transaction);
    }
    fs.rmSync(stagingRoot, { recursive: true, force: true });
  }

  console.log(`install completed into ${codexHome}`);
  console.log(`managed entries: ${summary.length}`);
  for (const item of summary) {
    console.log(`- ${item}`);
  }

}

function doctor() {
  const missing = [];
  const drift = [];
  const ok = [];

  for (const issue of collectInstallStateDrift()) {
    drift.push(`state:${issue}`);
  }

  for (const entry of entries) {
    assertManagedTargetShape(entry);

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

  for (const deprecated of deprecatedTargets) {
    const entry = { kind: "skill", ...deprecated };
    assertManagedTargetShape(entry);

    const targetPath = resolveHomePath(entry.target);
    if (pathState(targetPath)) {
      drift.push(`deprecated:${entry.name} remains at ${targetPath}`);
    }
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

  if (missing.length > 0 || drift.length > 0) {
    process.exitCode = 1;
  }
}

if (command === "install") {
  install();
} else if (command === "doctor") {
  doctor();
} else {
  install();
  doctor();
}
