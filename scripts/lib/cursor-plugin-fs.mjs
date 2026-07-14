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
  } catch {
    return null;
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
    requireRealFile(path.join("skills", "do-it-router", "SKILL.md"));
    requireRealFile(path.join("agents", "reviewer.md"));
  }

  assertNoSymlinksInTree(pluginPath);
}

export function prepareDirectoryReplacement(sourcePath, targetPath, options = {}) {
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  const stagedPath = siblingPath(targetPath, "stage");
  try {
    fs.cpSync(sourcePath, stagedPath, {
      recursive: true,
      errorOnExist: true,
      force: false
    });
    options.validate?.(stagedPath);
    return { targetPath, stagedPath, kind: options.kind, home: options.home };
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
  return Boolean(current?.isFile()) && fs.readFileSync(targetPath, "utf8") === expectedState.content;
}

function rollbackCommitted(committed) {
  let rollbackError;
  for (const record of [...committed].reverse()) {
    try {
      fs.rmSync(record.targetPath, { recursive: true, force: true });
      if (record.backupPath && pathState(record.backupPath)) {
        fs.renameSync(record.backupPath, record.targetPath);
      }
    } catch (error) {
      rollbackError ??= error;
    }
  }
  if (rollbackError) throw rollbackError;
}

export function commitPreparedReplacements(replacements, { afterReplace, removeBackup = fs.rmSync } = {}) {
  const committed = [];
  try {
    for (const replacement of replacements) {
      if (!fileStateMatches(replacement.targetPath, replacement.expectedState)) {
        throw new Error(`target changed while Cursor install was staged: ${replacement.targetPath}`);
      }
      const priorState = pathState(replacement.targetPath);
      const record = {
        ...replacement,
        backupPath: priorState ? siblingPath(replacement.targetPath, "backup") : null,
        hadTarget: Boolean(priorState)
      };
      if (record.backupPath) {
        fs.renameSync(record.targetPath, record.backupPath);
      }
      committed.push(record);
      fs.renameSync(record.stagedPath, record.targetPath);
      afterReplace?.(record, committed.length - 1);
    }
  } catch (error) {
    try {
      rollbackCommitted(committed);
    } catch (rollbackError) {
      error.cause = rollbackError;
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
  return { cleanupFailures };
}

