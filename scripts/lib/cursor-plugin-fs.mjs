#!/usr/bin/env node
/**
 * Shared Cursor plugin filesystem helpers: validate trees, stage/commit
 * replacements, and acquire per-home install locks.
 */

import fs from "node:fs";
import crypto from "node:crypto";
import path from "node:path";
import process from "node:process";

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
  ["skills/do-it-router/SKILL.md", "a9d72de56e72577e576545871fa71aa1737216f98d691b319396f9772023cbf3"]
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
    fs.rmSync(stagedPath, { recursive: true, force: true });
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
    fs.rmSync(stagedPath, { force: true });
    throw error;
  }
}

export function discardPreparedReplacements(replacements) {
  for (const replacement of replacements) {
    fs.rmSync(replacement.stagedPath, { recursive: true, force: true });
  }
}

function processIsAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === "EPERM";
  }
}

function acquireCursorHomeLock(
  home,
  { closeLock = fs.closeSync, removeLock = fs.rmSync } = {}
) {
  const lockPath = path.join(home, ".cursor", ".do-it-install.lock");
  fs.mkdirSync(path.dirname(lockPath), { recursive: true });
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const fd = fs.openSync(lockPath, "wx", 0o600);
      const owner = {
        pid: process.pid,
        createdAt: Date.now(),
        id: crypto.randomUUID()
      };
      try {
        fs.writeFileSync(fd, `${JSON.stringify(owner)}\n`);
      } catch (error) {
        try { closeLock(fd); } catch {}
        try { removeLock(lockPath, { force: true }); } catch {}
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
          let current = null;
          try {
            current = JSON.parse(fs.readFileSync(lockPath, "utf8"));
          } catch (error) {
            if (error.code !== "ENOENT") throw error;
          }
          if (current && current.id !== owner.id) {
            throw new Error(`Cursor install lock ownership changed for ${home}`);
          }
          if (current) removeLock(lockPath, { force: true });
        } catch (error) {
          cleanupFailures.push({ path: lockPath, error });
        }
        return cleanupFailures;
      };
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
      let owner;
      try {
        owner = JSON.parse(fs.readFileSync(lockPath, "utf8"));
      } catch {
        owner = null;
      }
      const ageMs = Date.now() - (pathState(lockPath)?.mtimeMs ?? Date.now());
      // Live owner always blocks. Dead-PID locks are stealable immediately.
      // Unreadable/missing owner still gets a short grace window.
      if (processIsAlive(owner?.pid)) {
        throw new Error(`another Cursor install is active for ${home}`);
      }
      if (!Number.isInteger(owner?.pid) && ageMs <= 10 * 60 * 1000) {
        throw new Error(`another Cursor install is active for ${home}`);
      }
      fs.rmSync(lockPath, { force: true });
    }
  }
  throw new Error(`could not acquire Cursor install lock for ${home}`);
}

export function acquireCursorHomeLocks(homes, options = {}) {
  const releases = [];
  try {
    for (const home of [...new Set(homes.map((value) => path.resolve(value)))].sort()) {
      releases.push(acquireCursorHomeLock(home, options));
    }
  } catch (error) {
    const cleanupFailures = releases.reverse().flatMap((release) => release());
    if (cleanupFailures.length > 0) {
      error.cause = cleanupFailures[0].error;
    }
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
    discardPreparedReplacements(replacements);
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
      if (file.stagedPath || path.dirname(file.relative) !== path.join("skills", "do-it-router")) continue;
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
