#!/usr/bin/env node
/**
 * Shared Cursor plugin filesystem helpers: validate trees, stage/commit
 * replacements, and acquire per-home install locks.
 */

import fs from "node:fs";
import crypto from "node:crypto";
import path from "node:path";
import process from "node:process";
import os from "node:os";

function pathState(targetPath) {
  try {
    return fs.lstatSync(targetPath);
  } catch (error) {
    if (error.code === "ENOENT" || error.code === "ENOTDIR") return null;
    throw error;
  }
}

function siblingPath(targetPath, purpose) {
  return path.join(
    path.dirname(targetPath),
    `.do-it-${purpose}-${path.basename(targetPath)}-${process.pid}-${crypto.randomUUID()}`
  );
}

function assertNoSymlinksInTree(rootPath) {
  const stack = [rootPath];
  while (stack.length > 0) {
    const current = stack.pop();
    const state = pathState(current);
    if (!state) continue;
    if (state.isSymbolicLink()) {
      throw new Error(`Cursor plugin must not contain symlinks: ${current}`);
    }
    if (!state.isDirectory()) continue;
    for (const entry of fs.readdirSync(current)) {
      stack.push(path.join(current, entry));
    }
  }
}

export function validateCursorPlugin(
  pluginPath,
  { requireHooks = false, requireRuntime = requireHooks, expectedVersion } = {}
) {
  const pluginState = pathState(pluginPath);
  if (!pluginState?.isDirectory() || pluginState.isSymbolicLink()) {
    throw new Error(`Cursor plugin must be a real directory: ${pluginPath}`);
  }

  const requireRealFile = (relativePath) => {
    const filePath = path.join(pluginPath, relativePath);
    const state = pathState(filePath);
    if (!state?.isFile() || state.isSymbolicLink()) {
      throw new Error(`missing real ${relativePath} under ${pluginPath}`);
    }
    return filePath;
  };

  const pluginJson = requireRealFile(path.join(".cursor-plugin", "plugin.json"));
  const metadata = JSON.parse(fs.readFileSync(pluginJson, "utf8"));
  if (expectedVersion && metadata.version !== expectedVersion) {
    throw new Error(
      `Cursor plugin version ${metadata.version ?? "<missing>"} does not match ${expectedVersion}: ${pluginPath}`
    );
  }

  if (requireHooks || requireRuntime) {
    const hooksJson = requireRealFile(path.join("hooks", "hooks.json"));
    JSON.parse(fs.readFileSync(hooksJson, "utf8"));
    requireRealFile(path.join("hooks", "run-hook.cmd"));
    requireRealFile(path.join("hooks", "session-start.sh"));
  }

  if (requireRuntime) {
    requireRealFile(path.join("skills", "do-it-core", "SKILL.md"));
    requireRealFile(path.join("agents", "reviewer.md"));
  }

  assertNoSymlinksInTree(pluginPath);
}

// Exact generated 0.18.1 files at commit 2bb8fc23db59d9738ecfa999253f2906644d952a.
// Local-copy installs had no ownership state; never retire modified or unknown files.
const retiredCursorFiles = new Map([
  ["agents/plan-challenger.md", "c3278d6aef170a0cdff00ed3ef6df56d778be97ac02cdaeea09428dcefe97fe8"],
  ["agents/product-strategist.md", "23e2d35152d9386e38baeac30cff8782208c16195563a439a344b62e9235b272"],
  ["agents/spec-compliance-reviewer.md", "a92549898503caf5764f3269ef16eb796a0c5b095788fc4884dfcc0406c1baa8"],
  ["agents/tdd-red-writer.md", "3b7be439e404883a9785d80d44d59136b2b6f9bbc6e0a0dd2ca468fe5d4d171e"],
  ["skills/do-it-router/SKILL.md", "a9d72de56e72577e576545871fa71aa1737216f98d691b319396f9772023cbf3"],
  ["skills/do-it-handbook/SKILL.md", "877cc4b36b4ac28d2f7de2bbe56bb2bccee00eae2f9d8cdeccbbc5f81674ba00"]
]);

function fileHash(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function assetFileState(root, relativePath) {
  const parts = relativePath.split(path.sep);
  let current = root;
  for (const part of parts.slice(0, -1)) {
    current = path.join(current, part);
    const state = pathState(current);
    if (state && (state.isSymbolicLink() || !state.isDirectory())) {
      throw new Error(`Cursor asset path is not a real directory: ${current}`);
    }
  }
  const target = path.join(root, relativePath);
  const state = pathState(target);
  if (state && (state.isSymbolicLink() || !state.isFile())) {
    throw new Error(`Cursor asset target is not a real file: ${target}`);
  }
  return state ? { exists: true, hash: fileHash(target) } : { exists: false };
}

function stagedFiles(root, relativePath = "") {
  const files = [];
  for (const entry of fs.readdirSync(path.join(root, relativePath), { withFileTypes: true })) {
    const relative = path.join(relativePath, entry.name);
    if (entry.isDirectory()) files.push(...stagedFiles(root, relative));
    else if (entry.isFile()) files.push(relative);
    else throw new Error(`Cursor plugin asset is not a real file: ${path.join(root, relative)}`);
  }
  return files.sort();
}

export function prepareDirectoryReplacement(sourcePath, targetPath, options = {}) {
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  const stagedPath = siblingPath(targetPath, "stage");
  const sourceRoot = path.resolve(sourcePath);
  const assetRoots = new Set([".cursor-plugin", "agents", "assets", "hooks", "skills"]);
  try {
    fs.cpSync(sourceRoot, stagedPath, {
      recursive: true,
      errorOnExist: true,
      force: false,
      filter(source) {
        const relative = path.relative(sourceRoot, source);
        if (!relative) return true;
        if (!assetRoots.has(relative.split(path.sep)[0])) return false;
        return !options.referenceSource || fs.existsSync(path.join(options.referenceSource, relative));
      }
    });
    options.validate?.(stagedPath);
    const rootState = pathState(targetPath);
    if (rootState && (rootState.isSymbolicLink() || !rootState.isDirectory())) {
      throw new Error(`Cursor plugin must be a real directory: ${targetPath}`);
    }
    const files = stagedFiles(stagedPath).map((relative) => ({
      relative,
      stagedPath: path.join(stagedPath, relative),
      expectedState: assetFileState(targetPath, relative)
    }));
    const stagedNames = new Set(files.map((file) => file.relative.split(path.sep).join("/")));
    for (const [relative, hash] of retiredCursorFiles) {
      if (stagedNames.has(relative)) continue;
      const localPath = relative.split("/").join(path.sep);
      const expectedState = assetFileState(targetPath, localPath);
      if (expectedState.exists && expectedState.hash === hash) {
        files.push({ relative: localPath, stagedPath: null, expectedState });
      }
    }
    return {
      targetPath, stagedPath, kind: options.kind, home: options.home, files,
      rootState: rootState ? { exists: true, dev: rootState.dev, ino: rootState.ino } : { exists: false }
    };
  } catch (error) {
    retainRecoveryFailures(error, "stage cleanup", discardPreparedReplacements([{ stagedPath }]));
    throw error;
  }
}

export function prepareFileReplacement(targetPath, content, options = {}) {
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  const stagedPath = siblingPath(targetPath, "stage");
  try {
    fs.writeFileSync(stagedPath, content);
    return {
      targetPath,
      stagedPath,
      kind: options.kind,
      home: options.home,
      expectedState: options.expectedState
    };
  } catch (error) {
    retainRecoveryFailures(error, "stage cleanup", discardPreparedReplacements([{ stagedPath }]));
    throw error;
  }
}

export function retainRecoveryFailures(error, phase, failures) {
  for (const failure of failures) {
    const detail = `${phase} failed at ${failure.path}: ${failure.error.message}`;
    error.recoveryFailures ??= [];
    if (error.recoveryFailures.some((entry) => entry.detail === detail)) continue;
    error.recoveryFailures.push({ ...failure, detail });
    error.message += `; ${detail}`;
  }
}

export function discardPreparedReplacements(replacements) {
  const failures = [];
  for (const replacement of replacements) {
    try {
      fs.rmSync(replacement.stagedPath, { recursive: true, force: true });
    } catch (error) {
      failures.push({ path: replacement.stagedPath, error });
    }
  }
  return failures;
}

function lockNamespace() {
  const identity = { platform: process.platform, hostname: os.hostname() };
  if (process.platform === "linux") {
    try {
      identity.bootId = fs.readFileSync("/proc/sys/kernel/random/boot_id", "utf8").trim();
      identity.pidNamespace = fs.readlinkSync("/proc/self/ns/pid");
    } catch {
      // Diagnostic identity only: missing namespace data never permits takeover.
    }
  }
  return identity;
}

function acquireCursorHomeLock(
  home,
  { closeLock = fs.closeSync, removeLock = fs.rmSync } = {}
) {
  const lockPath = path.join(home, ".cursor", ".do-it-install.lock");
  fs.mkdirSync(path.dirname(lockPath), { recursive: true });
  let fd;
  try {
    fd = fs.openSync(lockPath, "wx", 0o600);
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
    // A PID belongs to its host/boot/PID namespace, not to this shared path.
    // Never reclaim automatically: read/check/unlink cannot safely claim a stale
    // lock while another installer may replace it. Recovery requires quiescence.
    throw new Error(`another Cursor install may be active; lock retained at ${lockPath}. ` +
      "Stop concurrent install attempts on every OS sharing this profile, inspect the recorded owner and recovery files, " +
      "then archive and remove the lock only after confirming no installer is active; retry once.");
  }
  const owner = { pid: process.pid, namespace: lockNamespace(), createdAt: Date.now(), id: crypto.randomUUID() };
  try {
    fs.writeFileSync(fd, `${JSON.stringify(owner)}\n`);
  } catch (error) {
    error.message += `; incomplete Cursor install lock retained at ${lockPath}`;
    try { closeLock(fd); } catch (closeError) {
      retainRecoveryFailures(error, "lock close", [{ path: lockPath, error: closeError }]);
    }
    throw error;
  }
  return () => {
    const cleanupFailures = [];
    try {
      closeLock(fd);
    } catch (error) {
      cleanupFailures.push({ path: lockPath, error });
    }
    try {
      const current = JSON.parse(fs.readFileSync(lockPath, "utf8"));
      if (current.id !== owner.id) throw new Error(`Cursor install lock ownership changed for ${home}`);
      removeLock(lockPath, { force: true });
    } catch (error) {
      cleanupFailures.push({ path: lockPath, error });
    }
    return cleanupFailures;
  };
}

export function acquireCursorHomeLocks(homes, options = {}) {
  const releases = [];
  try {
    for (const home of [...new Set(homes.map((value) => path.resolve(value)))].sort()) {
      releases.push(acquireCursorHomeLock(home, options));
    }
  } catch (error) {
    const cleanupFailures = releases.reverse().flatMap((release) => release());
    retainRecoveryFailures(error, "lock release", cleanupFailures);
    throw error;
  }
  return () => releases.reverse().flatMap((release) => release());
}

function fileStateMatches(targetPath, expectedState) {
  if (!expectedState) return true;
  const current = pathState(targetPath);
  if (!expectedState.exists) return current === null;
  if (!current?.isFile() || current.isSymbolicLink()) return false;
  if (expectedState.hash) return fileHash(targetPath) === expectedState.hash;
  return fs.readFileSync(targetPath, "utf8") === expectedState.content;
}

function ensureRealDirectory(directory, committed) {
  const state = pathState(directory);
  if (state) {
    if (state.isSymbolicLink() || !state.isDirectory()) {
      throw new Error(`Cursor asset path is not a real directory: ${directory}`);
    }
    return;
  }
  ensureRealDirectory(path.dirname(directory), committed);
  fs.mkdirSync(directory);
  committed.push({ createdDirectory: directory });
}

function commitFile(targetPath, stagedPath, expectedState, committed) {
  if (!fileStateMatches(targetPath, expectedState)) {
    throw new Error(`target changed while Cursor install was staged: ${targetPath}`);
  }
  const priorState = pathState(targetPath);
  const record = {
    targetPath,
    backupPath: priorState ? siblingPath(targetPath, "backup") : null,
    installedHash: null
  };
  if (record.backupPath) fs.renameSync(targetPath, record.backupPath);
  committed.push(record);
  if (stagedPath) {
    const hash = fileHash(stagedPath);
    fs.renameSync(stagedPath, targetPath);
    record.installedHash = hash;
  }
}

function commitAssetFiles(replacement, committed) {
  const root = pathState(replacement.targetPath);
  const expected = replacement.rootState;
  if (expected.exists
    ? !root?.isDirectory() || root.isSymbolicLink() || root.dev !== expected.dev || root.ino !== expected.ino
    : Boolean(root)) {
    throw new Error(`target changed while Cursor install was staged: ${replacement.targetPath}`);
  }
  ensureRealDirectory(replacement.targetPath, committed);
  for (const file of replacement.files) {
    // Recheck ancestors before every rename; never follow an asset-path symlink.
    assetFileState(replacement.targetPath, file.relative);
    const target = path.join(replacement.targetPath, file.relative);
    ensureRealDirectory(path.dirname(target), committed);
    commitFile(target, file.stagedPath, file.expectedState, committed);
  }
}

function rollbackCommitted(committed) {
  const rollbackErrors = [];
  for (const record of [...committed].reverse()) {
    try {
      if (record.createdDirectory) {
        try {
          fs.rmdirSync(record.createdDirectory);
        } catch (error) {
          if (error.code !== "ENOENT" && error.code !== "ENOTEMPTY" && error.code !== "EEXIST") throw error;
        }
        continue;
      }
      const current = pathState(record.targetPath);
      if (record.backupPath && !pathState(record.backupPath)) {
        throw new Error(`Cursor rollback backup missing for ${record.targetPath}: ${record.backupPath}`);
      }
      if (record.installedHash) {
        if (!current?.isFile() || current.isSymbolicLink() || fileHash(record.targetPath) !== record.installedHash) {
          throw new Error(`Cursor rollback preserved changed ${record.targetPath}; backup: ${record.backupPath ?? "none"}`);
        }
        fs.rmSync(record.targetPath);
      } else if (current) {
        throw new Error(`Cursor rollback preserved recreated ${record.targetPath}; backup: ${record.backupPath ?? "none"}`);
      }
      if (record.backupPath) fs.renameSync(record.backupPath, record.targetPath);
    } catch (error) {
      rollbackErrors.push(error.message);
    }
  }
  if (rollbackErrors.length) throw new Error(rollbackErrors.join("; "));
}

export function commitPreparedReplacements(replacements, { afterReplace, removeBackup = fs.rmSync } = {}) {
  const committed = [];
  try {
    for (const [index, replacement] of replacements.entries()) {
      if (replacement.files) commitAssetFiles(replacement, committed);
      else commitFile(replacement.targetPath, replacement.stagedPath, replacement.expectedState, committed);
      afterReplace?.(replacement, index);
    }
  } catch (error) {
    try {
      rollbackCommitted(committed);
    } catch (rollbackError) {
      error.cause = rollbackError;
      error.message = `${error.message}; rollback incomplete: ${rollbackError.message}`;
    }
    retainRecoveryFailures(error, "stage cleanup", discardPreparedReplacements(replacements));
    throw error;
  }

  const cleanupFailures = [];
  for (const record of committed) {
    if (!record.backupPath) continue;
    try {
      removeBackup(record.backupPath, { recursive: true, force: true });
    } catch (error) {
      cleanupFailures.push({ path: record.backupPath, error });
    }
  }
  for (const replacement of replacements) {
    try {
      fs.rmSync(replacement.stagedPath, { recursive: true, force: true });
    } catch (error) {
      cleanupFailures.push({ path: replacement.stagedPath, error });
    }
    // Removing a proven retired skill file must not remove any user files.
    for (const file of replacement.files ?? []) {
      if (file.stagedPath || !file.relative.startsWith(`skills${path.sep}`)) continue;
      try {
        fs.rmdirSync(path.join(replacement.targetPath, path.dirname(file.relative)));
      } catch (error) {
        if (error.code !== "ENOENT" && error.code !== "ENOTEMPTY" && error.code !== "EEXIST") {
          cleanupFailures.push({ path: path.join(replacement.targetPath, path.dirname(file.relative)), error });
        }
      }
    }
  }
  return { cleanupFailures };
}
