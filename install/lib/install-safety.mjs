import fs from "node:fs";
import path from "node:path";
import {
  assertWithinInstallRoot,
  hashPath,
  pathState,
  treesMatch
} from "./fs-transaction.mjs";

export function assertManagedTargetShape(entry, targetConfig) {
  if (entry.kind === "extra" || entry.kind === "retired") {
    const targetSegments = typeof entry.target === "string" ? entry.target.split("/") : [];
    const targetSafe =
      targetSegments.length > 0 &&
      !path.isAbsolute(entry.target) &&
      !entry.target.includes("\\") &&
      targetSegments.every(
        (segment) =>
          segment.length > 0 &&
          segment !== "." &&
          segment !== ".." &&
          /^[A-Za-z0-9_.-]+$/.test(segment)
      );
    if (!targetSafe) {
      throw new Error(
        `Unsafe extra target for ${entry.name}: ${entry.target}. Expected a safe relative path.`
      );
    }
    return;
  }

  const skillPattern = /^skills\/[^/]+$/;
  const agentExt = targetConfig.agentTargetExt ?? ".toml";
  const hasSafeAgentExt =
    typeof agentExt === "string" &&
    agentExt.startsWith(".") &&
    !agentExt.includes("/") &&
    !agentExt.includes("\\") &&
    !agentExt.includes("..");
  const agentPrefix = "agents/";
  const agentFileName = entry.target.startsWith(agentPrefix)
    ? entry.target.slice(agentPrefix.length)
    : "";
  const agentBaseName =
    hasSafeAgentExt && agentFileName.endsWith(agentExt)
      ? agentFileName.slice(0, -agentExt.length)
      : "";
  const agentTargetSafe =
    hasSafeAgentExt &&
    entry.target.startsWith(agentPrefix) &&
    agentFileName.length > agentExt.length &&
    !agentFileName.includes("/") &&
    /^[A-Za-z0-9_-]+$/.test(agentBaseName);
  const targetSafe = entry.kind === "agent" ? agentTargetSafe : skillPattern.test(entry.target);

  if (!targetSafe) {
    throw new Error(
      `Unsafe ${entry.kind} target for ${entry.name}: ${entry.target}. ` +
        `Expected skills/<name> or agents/<name>${agentExt}.`
    );
  }
}

export function assertNativePathsSafe({ targetName, installRoot, statePath }) {
  if (targetName !== "codex") return;
  for (let current = installRoot; ; current = path.dirname(current)) {
    let stat = pathState(current);
    // Ancestors may be platform directory aliases (such as macOS /var).
    // Follow those aliases, but keep the managed root itself strictly unlinked.
    if (current !== installRoot && stat?.isSymbolicLink()) stat = fs.statSync(current);
    if (stat && (stat.isSymbolicLink() || !stat.isDirectory())) {
      throw new Error(`Refusing non-directory or symlink install root component: ${current}`);
    }
    if (path.dirname(current) === current) break;
  }
  for (const relative of ["agents", path.relative(installRoot, statePath)]) {
    const stat = pathState(path.join(installRoot, relative));
    if (stat && (stat.isSymbolicLink() || (relative === "agents" ? !stat.isDirectory() : !stat.isFile()))) {
      throw new Error(`Refusing unsafe native agent path: ${relative}`);
    }
  }
}

export function assertInstallSafe({
  entry,
  state,
  targetName,
  targetConfig,
  installRoot,
  forceInstall,
  resolveRepoPath,
  resolveHomePath
}) {
  assertManagedTargetShape(entry, targetConfig);

  const sourcePath = resolveRepoPath(entry.source);
  const targetPath = resolveHomePath(entry.target);

  if (!pathState(sourcePath)) {
    throw new Error(`Manifest source is missing: ${entry.source}`);
  }

  assertWithinInstallRoot(installRoot, targetPath);

  const targetState = pathState(targetPath);
  if (targetName === "codex" && entry.kind === "agent") {
    if (!targetState) return;
    if (targetState.isSymbolicLink() || !targetState.isFile()) {
      throw new Error(`Refusing non-regular native agent target: ${entry.target}`);
    }
    const owned = state.entries?.[entry.target];
    if (owned?.kind === entry.kind && owned?.name === entry.name && owned?.hash === hashPath(targetPath)) {
      return;
    }
    throw new Error(`Refusing native agent target without unchanged ownership proof: ${entry.target}`);
  }
  if (!targetState || treesMatch(sourcePath, targetPath)) {
    return;
  }

  const stateEntry = state.entries?.[entry.target];
  const targetHash = hashPath(targetPath);
  if (stateEntry?.hash === targetHash) {
    return;
  }

  if ((entry.legacyHashes ?? []).includes(targetHash)) {
    return;
  }

  if (!forceInstall) {
    throw new Error(
      `Refusing to overwrite existing ${entry.kind} target that is not marked as do-it managed: ${entry.target}. ` +
        "Set DO_IT_FORCE=1 to replace it intentionally."
    );
  }
}

export function assertDeprecatedRemovalSafe({
  entry,
  state,
  targetName,
  targetConfig,
  installRoot,
  forceInstall,
  resolveHomePath
}) {
  assertManagedTargetShape(entry, targetConfig);

  const targetPath = resolveHomePath(entry.target);
  const targetState = pathState(targetPath);
  if (!targetState) {
    return false;
  }

  if (
    targetName === "codex" &&
    entry.kind === "agent" &&
    (targetState.isSymbolicLink() || !targetState.isFile())
  ) {
    throw new Error(`Refusing non-regular retired native agent: ${entry.target}`);
  }
  assertWithinInstallRoot(installRoot, targetPath);

  const stateEntry = state.entries?.[entry.target];
  const targetHash = hashPath(targetPath);
  if (
    stateEntry?.hash === targetHash &&
    (!(targetName === "codex" && entry.kind === "agent") ||
      (stateEntry.kind === entry.kind && stateEntry.name === entry.name))
  ) {
    return true;
  }

  if ((entry.legacyHashes ?? []).includes(targetHash)) {
    return true;
  }

  if (forceInstall && !(targetName === "codex" && entry.kind === "agent")) {
    return true;
  }

  throw new Error(
    `Refusing to remove existing deprecated ${entry.kind} target that is not marked as do-it managed: ${entry.target}. ` +
      (targetName === "codex" && entry.kind === "agent"
        ? "Native agent installs never force removal."
        : "Set DO_IT_FORCE=1 to remove it intentionally.")
  );
}

export function collectInstallStateDrift({
  statePath,
  onlyAgents,
  manifestVersion,
  entries,
  resolveRepoPath
}) {
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
  if (!onlyAgents && state.version !== manifestVersion) {
    issues.push(
      `install state version ${state.version ?? "<missing>"} does not match manifest ${manifestVersion}`
    );
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
