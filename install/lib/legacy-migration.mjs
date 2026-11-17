import fs from "node:fs";
import crypto from "node:crypto";
import path from "node:path";
import process from "node:process";
import {
  assertWithinInstallRoot,
  copyEntry,
  hashPath,
  pathState,
  writeFileAtomic
} from "./fs-transaction.mjs";
import { assertManagedTargetShape, assertNativePathsSafe } from "./install-safety.mjs";

export function readLegacyMigrationState(statePath) {
  const stateFile = pathState(statePath);
  if (!stateFile) {
    return { exists: false, state: null, hash: null, error: null };
  }
  if (stateFile.isSymbolicLink()) {
    return { exists: true, state: null, hash: null, error: "install state is a symlink" };
  }

  try {
    const state = JSON.parse(fs.readFileSync(statePath, "utf8"));
    if (!state || typeof state !== "object" || Array.isArray(state)) {
      throw new Error("install state must be a JSON object");
    }
    if (
      state.entries !== undefined &&
      (!state.entries || typeof state.entries !== "object" || Array.isArray(state.entries))
    ) {
      throw new Error("install state entries must be an object when present");
    }
    return { exists: true, state, hash: hashPath(statePath), error: null };
  } catch (error) {
    return { exists: true, state: null, hash: null, error: error.message };
  }
}

function stateProvesLegacyOwnership(state, entry, targetHash) {
  const stateEntry = state?.entries?.[entry.target];
  return Boolean(
    stateEntry &&
      stateEntry.kind === entry.kind &&
      stateEntry.name === entry.name &&
      stateEntry.hash === targetHash
  );
}

function hasHighConfidenceLegacyAgentSignature(targetPath, targetState) {
  if (!targetState.isFile()) return false;

  let content;
  try {
    content = fs.readFileSync(targetPath, "utf8");
  } catch {
    return false;
  }

  const hasNeedsContext = content.includes("NEEDS_CONTEXT");
  const hasOldDispatchMarker =
    content.includes("do-it-subagent-orchestration") ||
    content.includes("Dispatch (required from parent prompt):") ||
    content.includes("Full dispatch contract:");

  return hasNeedsContext && hasOldDispatchMarker;
}

function inspectLegacyMigrationTarget(entry, category, state, targetConfig, resolveHomePath) {
  assertManagedTargetShape(entry, targetConfig);

  const targetPath = resolveHomePath(entry.target);
  const targetState = pathState(targetPath);
  const label = `${category}:${entry.name}`;
  if (!targetState) {
    return { entry, category, label, targetPath, status: "ABSENT", reason: "not present" };
  }

  if (targetState.isSymbolicLink()) {
    return {
      entry, category, label, targetPath,
      status: "REFUSED",
      reason: "target is a symlink; ownership cannot be proven safely"
    };
  }

  if (entry.kind === "agent" && !targetState.isFile()) {
    return {
      entry, category, label, targetPath,
      status: "REFUSED",
      reason: "agent target is not a regular file"
    };
  }

  const targetHash = hashPath(targetPath);
  if (stateProvesLegacyOwnership(state, entry, targetHash)) {
    return {
      entry, category, label, targetPath,
      status: "REMOVABLE",
      targetHash,
      reason: "matching do-it install-state hash"
    };
  }

  if ((entry.legacyHashes ?? []).includes(targetHash)) {
    return {
      entry, category, label, targetPath,
      status: "REMOVABLE",
      targetHash,
      reason: "matching manifest legacy hash"
    };
  }

  if (entry.kind === "agent" && hasHighConfidenceLegacyAgentSignature(targetPath, targetState)) {
    return {
      entry, category, label, targetPath,
      status: "REFUSED",
      reason: "matches a retired do-it dispatch signature but lacks state/hash/source proof; manual review required"
    };
  }

  return {
    entry, category, label, targetPath,
    status: "REFUSED",
    reason: "content is not proven do-it-owned; preserving it as user-owned or ambiguous"
  };
}

function createLegacyMigrationBackupRoot(installRoot) {
  const timestamp = new Date().toISOString().replace(/[.:]/g, "-");
  const backupRoot = path.join(
    installRoot,
    ".do-it-legacy-migration-backups",
    `${timestamp}-${crypto.randomUUID()}`
  );
  assertWithinInstallRoot(installRoot, backupRoot);
  fs.mkdirSync(backupRoot, { recursive: true });
  return backupRoot;
}

function legacyMigrationBackupPath(installRoot, backupRoot, relativePath) {
  const backupPath = path.join(backupRoot, relativePath);
  assertWithinInstallRoot(installRoot, backupPath);
  return backupPath;
}

function removeLegacyMigrationTarget(candidate, installRoot, backupRoot) {
  const targetState = pathState(candidate.targetPath);
  if (!targetState || targetState.isSymbolicLink()) {
    throw new Error(`legacy migration target changed during apply: ${candidate.targetPath}`);
  }
  if (hashPath(candidate.targetPath) !== candidate.targetHash) {
    throw new Error(`legacy migration target content changed during apply: ${candidate.targetPath}`);
  }

  const backupPath = legacyMigrationBackupPath(installRoot, backupRoot, candidate.entry.target);
  copyEntry(candidate.targetPath, backupPath);
  fs.rmSync(candidate.targetPath, {
    recursive: targetState.isDirectory(),
    force: false
  });
  return { ...candidate, backupPath };
}

function restoreLegacyMigrationTargets(removed) {
  for (const candidate of [...removed].reverse()) {
    if (!pathState(candidate.backupPath)) continue;
    if (pathState(candidate.targetPath)) {
      throw new Error(`cannot restore target recreated during rollback: ${candidate.targetPath}`);
    }
    copyEntry(candidate.backupPath, candidate.targetPath);
  }
}

function writeLegacyMigrationState({ installRoot, statePath, stateInfo, removed, backupRoot }) {
  if (!stateInfo.state) return false;
  if (!pathState(statePath) || hashPath(statePath) !== stateInfo.hash) {
    throw new Error(`install state changed during apply: ${statePath}`);
  }

  const updated = JSON.parse(JSON.stringify(stateInfo.state));
  const entries = updated.entries ?? {};
  let changed = false;
  for (const candidate of removed) {
    if (Object.hasOwn(entries, candidate.entry.target)) {
      delete entries[candidate.entry.target];
      changed = true;
    }
  }
  if (!changed) return false;

  updated.entries = entries;
  copyEntry(statePath, legacyMigrationBackupPath(installRoot, backupRoot, path.basename(statePath)));
  writeFileAtomic(installRoot, statePath, `${JSON.stringify(updated, null, 2)}\n`);
  return true;
}

export function migrateLegacy({
  targetName,
  targetConfig,
  installRoot,
  statePath,
  deprecatedEntries,
  apply,
  resolveHomePath
}) {
  assertNativePathsSafe({ targetName, installRoot, statePath });
  const stateInfo = readLegacyMigrationState(statePath);
  const candidates = deprecatedEntries.map((entry) =>
    inspectLegacyMigrationTarget(entry, `deprecated-${entry.kind}`, stateInfo.state, targetConfig, resolveHomePath)
  );
  const present = candidates.filter((candidate) => candidate.status !== "ABSENT");
  const removable = candidates.filter((candidate) => candidate.status === "REMOVABLE");
  const refused = candidates.filter((candidate) => candidate.status === "REFUSED");

  console.log("legacy Codex retired-target cleanup");
  console.log(`mode: ${apply ? "apply" : "dry-run"}`);
  console.log(`legacy root: ${installRoot}`);
  console.log("scope: retired manifest targets only; current canonical native agents are preserved");
  if (stateInfo.error) {
    console.log(`install state: unreadable (${stateInfo.error})`);
  } else if (stateInfo.exists) {
    console.log(`install state: ${statePath}`);
  } else {
    console.log("install state: absent");
  }

  for (const candidate of present) {
    console.log(`- ${candidate.status} ${candidate.label} at ${candidate.targetPath} (${candidate.reason})`);
  }
  console.log(
    `summary: ${removable.length} removable, ${refused.length} refused, ${candidates.length - present.length} absent`
  );

  if (!apply) {
    console.log("dry-run only: no files changed. Re-run with --apply after reviewing this inventory.");
    return;
  }

  if (removable.length === 0) {
    if (refused.length > 0) {
      console.error(
        `Legacy migration incomplete: ${refused.length} target(s) are ambiguous or user-owned; no proven targets were removed.`
      );
      process.exitCode = 1;
    } else {
      console.log("nothing to remove; no backup created.");
    }
    return;
  }

  if (stateInfo.error) {
    console.error(
      `Refusing to apply legacy migration while install state is unreadable at ${statePath}. No files changed.`
    );
    process.exitCode = 1;
    return;
  }

  const backupRoot = createLegacyMigrationBackupRoot(installRoot);
  const removed = [];
  let stateChanged = false;
  try {
    for (const candidate of removable) {
      removed.push(removeLegacyMigrationTarget(candidate, installRoot, backupRoot));
    }
    stateChanged = writeLegacyMigrationState({ installRoot, statePath, stateInfo, removed, backupRoot });
  } catch (error) {
    try {
      const stateBackup = legacyMigrationBackupPath(installRoot, backupRoot, path.basename(statePath));
      if (pathState(stateBackup)) copyEntry(stateBackup, statePath);
      restoreLegacyMigrationTargets(removed);
    } catch (rollbackError) {
      throw new Error(
        `legacy migration failed: ${error.message}; rollback also failed: ${rollbackError.message}; backups remain at ${backupRoot}`
      );
    }
    throw new Error(`legacy migration failed: ${error.message}; backups remain at ${backupRoot}`);
  }

  console.log(`migration applied: removed ${removed.length} proven legacy do-it target(s).`);
  console.log(`backup: ${backupRoot}`);
  console.log(stateChanged ? "install state: updated" : "install state: unchanged");
  if (refused.length > 0) {
    console.error(
      `Legacy migration incomplete: ${refused.length} ambiguous or user-owned target(s) were preserved. Review the dry-run inventory before any manual action.`
    );
    process.exitCode = 1;
  }
}
