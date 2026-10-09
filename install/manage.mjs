#!/usr/bin/env node

import fs from "node:fs";
import crypto from "node:crypto";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  needsMigration,
  applyMatchingMigrations
} from "./migrate.mjs";
import {
  userHooksWiredForPlugin,
  resolveGitBash
} from "../scripts/lib/cursor-user-hooks.mjs";
import {
  registerCursorPlugin,
  validateCursorPlugin
} from "../scripts/register-cursor-plugin.mjs";
import { resolveUserHome, looksLikeWindowsPath, toWslMountPath } from "../scripts/lib/user-home.mjs";
import { targetExtras } from "../scripts/lib/manifest-extras.mjs";

const VALID_COMMANDS = new Set(["install", "doctor", "setup", "migrate-legacy"]);
const HELP_FLAGS = new Set(["-h", "--help", "help"]);
const FORCE_INSTALL = process.env.DO_IT_FORCE === "1";
const DEFAULT_TARGET = process.env.DO_IT_TARGET || "codex";

function usage(stream = console.error) {
  const commandName =
    process.env.DO_IT_CLI_NAME ||
    path.basename(process.argv[1] || "manage.mjs");

  stream(`Usage: ${commandName} <install|doctor|setup|migrate-legacy> [--target=<name>]`);
  stream("");
  stream("Commands:");
  stream("  install  Copy managed do-it entries into the install root");
  stream("  doctor   Verify managed entries in the install root");
  stream("  setup    Run install, then doctor");
  stream("  migrate-legacy  Inspect retired Codex do-it targets; use --apply for proven retired targets");
  stream("");
  stream("Options:");
  stream("  --target=<name>   Pick install target (default: codex). Available: codex, claude, cursor.");
  stream("  --only=agents     Codex only: install or verify native agents without plugin skills/hooks.");
  stream("  --with-optional   Include any skills marked optional in the manifest.");
  stream("  --session=<id>    With doctor: pretty-print session state (hook invocations, tier history) for the given session id.");
  stream("  --no-migrate      With install: refuse to silently migrate from an older install-state version (exit code 2).");
  stream("  --apply           With migrate-legacy: remove only preflight-proven legacy targets after persistent backups.");
  stream("");
  stream("Environment:");
  stream("  CODEX_HOME                    Override codex install root (default: $HOME/.codex)");
  stream("  CLAUDE_PLUGIN_ROOT_OVERRIDE   Override claude install root (default: $HOME/.claude)");
  stream("  CURSOR_PLUGIN_ROOT_OVERRIDE   Override cursor plugin install root (default: $HOME/.cursor/plugins/local/do-it-cursor)");
  stream("  DO_IT_TARGET                  Set default target if --target is omitted");
  stream("  DO_IT_FORCE=1                 Replace existing files not marked as do-it managed");
}

function parseArgs(argv) {
  const positional = [];
  let targetName = DEFAULT_TARGET;
  let withOptional = false;
  let sessionId = null;
  let noMigrate = false;
  let apply = false;
  let onlyAgents = false;
  for (const arg of argv) {
    if (arg === "--only=agents") {
      onlyAgents = true;
    } else if (arg === "--with-optional") {
      withOptional = true;
    } else if (arg === "--no-migrate") {
      noMigrate = true;
    } else if (arg === "--apply") {
      apply = true;
    } else if (arg.startsWith("--target=")) {
      targetName = arg.slice("--target=".length);
    } else if (arg.startsWith("--session=")) {
      sessionId = arg.slice("--session=".length);
    } else {
      positional.push(arg);
    }
  }
  return { positional, targetName, withOptional, sessionId, noMigrate, apply, onlyAgents };
}

const { positional, targetName, withOptional, sessionId, noMigrate, apply, onlyAgents } = parseArgs(process.argv.slice(2));
const command = positional[0];

if (HELP_FLAGS.has(command)) {
  usage(console.log);
  process.exit(0);
}

if (!VALID_COMMANDS.has(command)) {
  usage();
  process.exit(2);
}

if (positional.length > 1) {
  usage();
  process.exit(2);
}

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const manifestPath = path.join(repoRoot, "manifest.json");

const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const targetsConfig = manifest.targets ?? {};
const targetConfig = targetsConfig[targetName];
if (!targetConfig) {
  console.error(
    `Unknown target: ${targetName}. Available: ${Object.keys(targetsConfig).join(", ") || "(none)"}.`
  );
  process.exit(2);
}

if (onlyAgents && (targetName !== "codex" || command === "migrate-legacy")) {
  console.error("--only=agents requires Codex install, setup, or doctor.");
  process.exit(2);
}

if (apply && command !== "migrate-legacy") {
  console.error("--apply is only valid with migrate-legacy.");
  process.exit(2);
}

if (command === "migrate-legacy" && targetName !== "codex") {
  console.error("migrate-legacy supports only the Codex target (--target=codex).");
  process.exit(2);
}

function expandRootDefault(template) {
  return template.replace(/\$HOME/g, resolveUserHome());
}

const rootEnvName = targetConfig.rootEnv;
const installRoot = process.env[rootEnvName]
  ? path.resolve(process.env[rootEnvName])
  : expandRootDefault(targetConfig.rootDefault);

if (!process.env[rootEnvName] && !resolveUserHome()) {
  throw new Error(`HOME is not set. Set ${rootEnvName} explicitly.`);
}

const deprecatedTargets = manifest.deprecatedTargets ?? [];

function adaptDeprecatedTarget(entry) {
  const kind = entry.kind ?? "skill";
  if (Array.isArray(entry.targets) && !entry.targets.includes(targetName)) return null;

  if (kind === "skill") return { kind, ...entry };
  if (kind === "agent") {
    return {
      kind,
      ...entry,
      target: entry.target ?? `agents/${entry.name}${targetConfig.agentTargetExt}`
    };
  }
  if (kind === "extra") return { kind, ...entry };

  throw new Error(`Unknown deprecated target kind for ${entry.name}: ${kind}`);
}

const deprecatedEntries = deprecatedTargets.map(adaptDeprecatedTarget).filter(Boolean)
  .filter((entry) => !onlyAgents || entry.kind === "agent");

function adaptEntry(entry, kind) {
  if (kind === "skill") {
    return { kind, ...entry };
  }
  // Agents: derive source/target from target config + agent name so a single
  // manifest definition can be installed to multiple hosts.
  const source = `${targetConfig.agentSourceFrom}/${entry.name}${targetConfig.agentSourceExt}`;
  const target = `agents/${entry.name}${targetConfig.agentTargetExt}`;
  return { kind, ...entry, source, target };
}

function skillAllowedForTarget(entry) {
  if (!(withOptional || !entry.optional)) return false;
  // Cursor ships the full skill set (same as Codex/Claude).
  return true;
}

const skillEntries = manifest.skills
  .filter(skillAllowedForTarget)
  .map((entry) => adaptEntry(entry, "skill"));
// Native Codex roles are discovered from CODEX_HOME/agents, not plugin caches.
const canonicalAgentEntries = manifest.agents.map((entry) => adaptEntry(entry, "agent"));
const agentEntries = onlyAgents || targetName === "codex" || targetConfig.installAgents !== false
  ? canonicalAgentEntries : [];
// Effective extras: top-level commonExtras merged with this target's deltas.
const extraEntries = targetExtras(manifest, targetName).map((extra) => ({
  ...extra,
  kind: "extra",
  shape: extra.kind === "directory" ? "directory" : "file"
}));
const entries = onlyAgents ? agentEntries : [...skillEntries, ...agentEntries, ...extraEntries];

function resolveRepoPath(relativePath) {
  return path.join(repoRoot, relativePath);
}

function resolveHomePath(relativePath) {
  return path.join(installRoot, relativePath);
}

const statePath = resolveHomePath(targetConfig.stateFile ?? ".do-it-install-state.json");

function assertWithinInstallRoot(targetPath) {
  const relativePath = path.relative(installRoot, targetPath);
  const isWithin =
    relativePath === "" ||
    (!relativePath.startsWith("..") && !path.isAbsolute(relativePath));

  if (!isWithin) {
    throw new Error(`Refusing to operate outside install root: ${targetPath}`);
  }
}

function assertManagedTargetShape(entry) {
  if (entry.kind === "extra" || entry.kind === "retired") {
    // Extras are files/dirs added by target config. They may be top-level
    // entries (e.g. hooks.json) or scoped nested entries (e.g. hooks/router.sh).
    const targetSegments =
      typeof entry.target === "string" ? entry.target.split("/") : [];
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
        `Unsafe extra target for ${entry.name}: ${entry.target}. ` +
          "Expected a safe relative path."
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
  const agentBaseName = hasSafeAgentExt && agentFileName.endsWith(agentExt)
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

  assertWithinInstallRoot(tempPath);
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
    installRoot,
    `.do-it-install-staging-${process.pid}-${crypto.randomUUID()}`
  );

  assertWithinInstallRoot(stagingRoot);
  fs.mkdirSync(stagingRoot, { recursive: true });
  return stagingRoot;
}

function stagedEntryPath(stagingRoot, entry) {
  const stagedPath = path.join(stagingRoot, entry.target);
  assertWithinInstallRoot(stagedPath);
  return stagedPath;
}

function backupTargetForTransaction(targetPath, transaction) {
  assertWithinInstallRoot(targetPath);
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
  assertWithinInstallRoot(stagedPath);
  assertWithinInstallRoot(targetPath);

  const record = backupTargetForTransaction(targetPath, transaction);
  try {
    fs.renameSync(stagedPath, targetPath);
  } catch (error) {
    if (error?.code !== "EXDEV") {
      throw error;
    }

    copyEntry(stagedPath, targetPath);
    fs.rmSync(stagedPath, { recursive: true, force: true });
  }
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

function readLegacyMigrationState() {
  const stateFile = pathState(statePath);
  if (!stateFile) {
    return { exists: false, state: null, hash: null, error: null };
  }
  if (stateFile.isSymbolicLink()) {
    return {
      exists: true,
      state: null,
      hash: null,
      error: "install state is a symlink"
    };
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

function inspectLegacyMigrationTarget(entry, category, state) {
  assertManagedTargetShape(entry);

  const targetPath = resolveHomePath(entry.target);
  const targetState = pathState(targetPath);
  const label = `${category}:${entry.name}`;
  if (!targetState) {
    return { entry, category, label, targetPath, status: "ABSENT", reason: "not present" };
  }

  if (targetState.isSymbolicLink()) {
    return {
      entry,
      category,
      label,
      targetPath,
      status: "REFUSED",
      reason: "target is a symlink; ownership cannot be proven safely"
    };
  }

  if (entry.kind === "agent" && !targetState.isFile()) {
    return {
      entry,
      category,
      label,
      targetPath,
      status: "REFUSED",
      reason: "agent target is not a regular file"
    };
  }

  const targetHash = hashPath(targetPath);
  if (stateProvesLegacyOwnership(state, entry, targetHash)) {
      return {
        entry,
        category,
        label,
        targetPath,
        status: "REMOVABLE",
        targetHash,
        reason: "matching do-it install-state hash"
    };
  }

  if ((entry.legacyHashes ?? []).includes(targetHash)) {
    return {
      entry,
      category,
      label,
      targetPath,
      status: "REMOVABLE",
      targetHash,
      reason: "matching manifest legacy hash"
    };
  }

  if (entry.kind === "agent" && hasHighConfidenceLegacyAgentSignature(targetPath, targetState)) {
    return {
      entry,
      category,
      label,
      targetPath,
      status: "REFUSED",
      reason: "matches a retired do-it dispatch signature but lacks state/hash/source proof; manual review required"
    };
  }

  return {
    entry,
    category,
    label,
    targetPath,
    status: "REFUSED",
    reason: "content is not proven do-it-owned; preserving it as user-owned or ambiguous"
  };
}

function collectLegacyMigrationTargets(state) {
  return deprecatedEntries.map((entry) =>
    inspectLegacyMigrationTarget(entry, `deprecated-${entry.kind}`, state)
  );
}

function createLegacyMigrationBackupRoot() {
  const timestamp = new Date().toISOString().replace(/[.:]/g, "-");
  const backupRoot = path.join(
    installRoot,
    ".do-it-legacy-migration-backups",
    `${timestamp}-${crypto.randomUUID()}`
  );
  assertWithinInstallRoot(backupRoot);
  fs.mkdirSync(backupRoot, { recursive: true });
  return backupRoot;
}

function legacyMigrationBackupPath(backupRoot, relativePath) {
  const backupPath = path.join(backupRoot, relativePath);
  assertWithinInstallRoot(backupPath);
  return backupPath;
}

function removeLegacyMigrationTarget(candidate, backupRoot) {
  const targetState = pathState(candidate.targetPath);
  if (!targetState || targetState.isSymbolicLink()) {
    throw new Error(`legacy migration target changed during apply: ${candidate.targetPath}`);
  }
  if (hashPath(candidate.targetPath) !== candidate.targetHash) {
    throw new Error(`legacy migration target content changed during apply: ${candidate.targetPath}`);
  }

  const backupPath = legacyMigrationBackupPath(backupRoot, candidate.entry.target);
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

function writeLegacyMigrationState(stateInfo, removed, backupRoot) {
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
  copyEntry(statePath, legacyMigrationBackupPath(backupRoot, path.basename(statePath)));
  writeFileAtomic(statePath, `${JSON.stringify(updated, null, 2)}\n`);
  return true;
}

function migrateLegacy() {
  assertNativePathsSafe();
  const stateInfo = readLegacyMigrationState();
  const candidates = collectLegacyMigrationTargets(stateInfo.state);
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

  const backupRoot = createLegacyMigrationBackupRoot();
  const removed = [];
  let stateChanged = false;
  try {
    for (const candidate of removable) {
      removed.push(removeLegacyMigrationTarget(candidate, backupRoot));
    }
    stateChanged = writeLegacyMigrationState(stateInfo, removed, backupRoot);
  } catch (error) {
    try {
      const stateBackup = legacyMigrationBackupPath(backupRoot, path.basename(statePath));
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

function readInstallState() {
  try {
    return JSON.parse(fs.readFileSync(statePath, "utf8"));
  } catch {
    return { entries: {} };
  }
}

function writeFileAtomic(targetPath, content) {
  assertWithinInstallRoot(targetPath);
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });

  const tempPath = tempSiblingPath(targetPath, "state");

  try {
    fs.writeFileSync(tempPath, content);
    fs.renameSync(tempPath, targetPath);
  } finally {
    fs.rmSync(tempPath, { recursive: true, force: true });
  }
}

function writeInstallState(previousState) {
  const state = {
    // A partial update must not suppress future migrations for skills/hooks.
    version: onlyAgents && previousState.version &&
      Object.values(previousState.entries ?? {}).some((entry) => entry.kind !== "agent")
      ? previousState.version : manifest.version,
    installedAt: new Date().toISOString(),
    entries: {
      ...(onlyAgents ? previousState.entries : {}),
      ...Object.fromEntries(
        entries.map((entry) => [entry.target, { kind: entry.kind, name: entry.name, hash: hashPath(resolveRepoPath(entry.source)) }])
      )
    }
  };
  for (const entry of deprecatedEntries) delete state.entries[entry.target];

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

function assertNativePathsSafe() {
  if (targetName !== "codex") return;
  for (let current = installRoot; ; current = path.dirname(current)) {
    const stat = pathState(current);
    if (stat && (stat.isSymbolicLink() || !stat.isDirectory())) {
      throw new Error(`Refusing non-directory or symlink install root component: ${current}`);
    }
    if (path.dirname(current) === current) break;
  }
  for (const relative of ["agents", path.relative(installRoot, statePath)]) {
    const stat = pathState(resolveHomePath(relative));
    if (stat && (stat.isSymbolicLink() || (relative === "agents" ? !stat.isDirectory() : !stat.isFile()))) {
      throw new Error(`Refusing unsafe native agent path: ${relative}`);
    }
  }
}

// Resolve aliases even before installation creates the final file. lstat keeps
// dangling symlinks visible so realpath rejects them rather than assuming safety.
function resolveCodexAliasPath(alias) {
  let ancestor = alias;
  const missing = [];
  while (true) {
    try {
      fs.lstatSync(ancestor);
      break;
    } catch (error) {
      if (error.code !== "ENOENT" || path.dirname(ancestor) === ancestor) throw error;
      missing.unshift(path.basename(ancestor));
      ancestor = path.dirname(ancestor);
    }
  }
  return path.join(fs.realpathSync(ancestor), ...missing);
}

// Extract key paths without treating comments or string contents as TOML syntax.
// This is a collision scanner, not a TOML validator: scalar values are opaque,
// while unsupported/ambiguous role structures fail closed. No config is edited.
// With config role names supplied, check configured roles and file aliases;
// otherwise collect the native file's top-level string name declarations.
function inspectCodexRoleToml(text, names = null) {
  const fail = () => { throw new Error("ambiguous or conflicting role configuration"); };
  const tokens = [];
  for (let i = 0; i < text.length;) {
    const char = text[i];
    if (char === " " || char === "\t" || char === "\r") { i++; continue; }
    if (char === "#") {
      while (i < text.length && text[i] !== "\n") i++;
      continue;
    }
    if (char === '"' || char === "'") {
      const multiline = text.slice(i, i + 3) === char.repeat(3);
      i += multiline ? 3 : 1;
      if (multiline && text[i] === "\r" && text[i + 1] === "\n") i += 2;
      else if (multiline && text[i] === "\n") i++;
      let value = "";
      let closed = false;
      while (i < text.length) {
        if (text[i] === char) {
          let end = i;
          while (text[end] === char) end++;
          const count = end - i;
          if (!multiline || count >= 3) {
            if (multiline && count > 5) fail();
            value += multiline ? char.repeat(count - 3) : "";
            i += multiline ? count : 1;
            closed = true;
            break;
          }
        }
        if (!multiline && /[\r\n]/.test(text[i])) fail();
        if (char === '"' && text[i] === "\\") {
          i++;
          if (multiline && /^[ \t\r]*\n/.test(text.slice(i))) {
            while (/[ \t\r\n]/.test(text[i] ?? "")) i++;
            continue;
          }
          const escape = text[i++];
          const escapes = { b: "\b", t: "\t", n: "\n", f: "\f", r: "\r", '"': '"', "\\": "\\" };
          if (Object.hasOwn(escapes, escape)) value += escapes[escape];
          else if (escape === "u" || escape === "U") {
            const digits = text.slice(i, i + (escape === "u" ? 4 : 8));
            if (!new RegExp(`^[0-9a-fA-F]{${escape === "u" ? 4 : 8}}$`).test(digits)) fail();
            const code = parseInt(digits, 16);
            if (code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff)) fail();
            value += String.fromCodePoint(code);
            i += digits.length;
          } else fail();
        } else value += text[i++];
      }
      if (!closed) fail();
      tokens.push({ kind: "string", value, multiline });
    } else if ("\n[]=.,{}".includes(char)) {
      tokens.push({ kind: char });
      i++;
    } else {
      const start = i;
      while (i < text.length && !/[\s#\[\]=.,{}'"\\]/.test(text[i])) i++;
      if (i === start) fail();
      tokens.push({ kind: "bare", value: text.slice(start, i) });
    }
  }
  let cursor = 0;
  const at = (kind) => tokens[cursor]?.kind === kind;
  const take = (kind) => { if (!at(kind)) fail(); return tokens[cursor++]; };
  const key = () => {
    const parts = [];
    do {
      if (parts.length) take(".");
      const token = tokens[cursor++];
      if (!token || token.multiline || !(token.kind === "string" ||
          (token.kind === "bare" && /^[A-Za-z0-9_-]+$/.test(token.value)))) fail();
      parts.push(token.value);
    } while (at("."));
    return parts;
  };
  const isConfigRole = (parts) => names !== null && parts[0] === "agents";
  const topLevelNames = [];
  const check = (parts) => {
    if (isConfigRole(parts) && names.includes(parts[1])) fail();
  };
  const assigned = new Set();
  const tables = new Set();
  const value = (parts) => {
    check(parts);
    const nativeName = names === null && parts[0] === "name";
    if (nativeName && (parts.length !== 1 || !at("string") || !tokens[cursor].value)) fail();
    if (isConfigRole(parts)) {
      const identity = JSON.stringify(parts);
      if (assigned.has(identity) || (parts[2] === "config_file" && parts.length !== 3)) fail();
      assigned.add(identity);
    }
    if (at("{")) {
      if (isConfigRole(parts) && parts.at(-1) === "config_file") fail();
      take("{");
      while (!at("}")) {
        const child = [...parts, ...key()];
        take("=");
        value(child);
        if (!at("}")) take(",");
      }
      take("}");
      return;
    }
    if (isConfigRole(parts) && (parts.length === 1 ||
        (parts.length === 2 && !["max_threads", "max_depth", "job_max_runtime_seconds"].includes(parts[1])))) fail();
    if (isConfigRole(parts) && parts.length === 3 && parts[2] === "config_file") {
      const token = tokens[cursor];
      if (token?.kind !== "string") fail();
      const alias = path.resolve(installRoot, token.value);
      const resolved = resolveCodexAliasPath(alias);
      if (canonicalAgentEntries.some((entry) => {
        const managed = resolveHomePath(entry.target);
        return alias === managed || resolved === managed;
      })) fail();
    }
    const start = cursor;
    const stack = [];
    while (cursor < tokens.length) {
      const kind = tokens[cursor].kind;
      if (!stack.length && ["\n", ",", "}", "]"].includes(kind)) break;
      if (kind === "[" || kind === "{") stack.push(kind === "[" ? "]" : "}");
      else if (kind === "]" || kind === "}") { if (stack.pop() !== kind) fail(); }
      cursor++;
    }
    if (cursor === start || stack.length) fail();
    if ((nativeName || (isConfigRole(parts) && parts.at(-1) === "config_file")) && cursor !== start + 1) fail();
    if (nativeName) topLevelNames.push(tokens[start].value);
  };
  let table = [];
  while (cursor < tokens.length) {
    if (at("\n")) { cursor++; continue; }
    if (at("[")) {
      take("[");
      const array = at("[");
      if (array) take("[");
      table = key();
      check(table);
      if (names === null && table[0] === "name") fail();
      if (isConfigRole(table)) {
        const identity = JSON.stringify(table);
        if (array || tables.has(identity) || assigned.has(identity) || table[2] === "config_file") fail();
        tables.add(identity);
      }
      take("]");
      if (array) take("]");
    } else {
      const parts = [...table, ...key()];
      take("=");
      value(parts);
    }
    if (cursor < tokens.length) take("\n");
  }
  return { topLevelNames };
}

function assertCodexRoleConflictsAbsent() {
  if (targetName !== "codex") return;
  const names = canonicalAgentEntries.map((entry) => entry.name);
  const configPath = resolveHomePath("config.toml");
  if (pathState(configPath)) {
    const stat = fs.lstatSync(configPath);
    if (stat.isSymbolicLink() || !stat.isFile()) throw new Error(`Cannot safely inspect ${configPath}`);
    try {
      inspectCodexRoleToml(fs.readFileSync(configPath, "utf8"), names);
    } catch (error) {
      throw new Error(`Potential native role conflict in ${configPath}; review existing configuration before installing: ${error.message}`);
    }
  }
  const agentsPath = resolveHomePath("agents");
  if (!pathState(agentsPath)) return;
  const managedFiles = new Set(canonicalAgentEntries.map((entry) => resolveHomePath(entry.target)));
  const directories = [agentsPath];
  while (directories.length) {
    const directory = directories.pop();
    for (const file of fs.readdirSync(directory)) {
      const filePath = path.join(directory, file);
      if (managedFiles.has(filePath)) continue;
      const stat = fs.lstatSync(filePath);
      if (stat.isSymbolicLink()) throw new Error(`Cannot safely inspect native role path: ${filePath}`);
      if (stat.isDirectory()) {
        directories.push(filePath);
        continue;
      }
      if (!file.endsWith(".toml")) continue;
      if (!stat.isFile()) throw new Error(`Cannot safely inspect native role file: ${filePath}`);
      let declared;
      try {
        ({ topLevelNames: declared } = inspectCodexRoleToml(fs.readFileSync(filePath, "utf8")));
      } catch (error) {
        throw new Error(`Cannot establish a unique native role name in ${filePath}: ${error.message}`);
      }
      if (declared.length !== 1) throw new Error(`Cannot establish a unique native role name in ${filePath}`);
      if (names.includes(declared[0])) throw new Error(`Native role conflict for ${declared[0]} in ${filePath}`);
    }
  }
}

function assertInstallSafe(entry, state) {
  assertManagedTargetShape(entry);

  const sourcePath = resolveRepoPath(entry.source);
  const targetPath = resolveHomePath(entry.target);

  if (!pathState(sourcePath)) {
    throw new Error(`Manifest source is missing: ${entry.source}`);
  }

  assertWithinInstallRoot(targetPath);

  const targetState = pathState(targetPath);
  if (targetName === "codex" && entry.kind === "agent") {
    if (!targetState) return;
    if (targetState.isSymbolicLink() || !targetState.isFile()) {
      throw new Error(`Refusing non-regular native agent target: ${entry.target}`);
    }
    const owned = state.entries?.[entry.target];
    if (owned?.kind === entry.kind && owned?.name === entry.name && owned?.hash === hashPath(targetPath)) return;
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

  if (targetName === "codex" && entry.kind === "agent" &&
      (targetState.isSymbolicLink() || !targetState.isFile())) {
    throw new Error(`Refusing non-regular retired native agent: ${entry.target}`);
  }
  assertWithinInstallRoot(targetPath);

  const stateEntry = state.entries?.[entry.target];
  const targetHash = hashPath(targetPath);
  if (stateEntry?.hash === targetHash &&
      (!(targetName === "codex" && entry.kind === "agent") ||
        (stateEntry.kind === entry.kind && stateEntry.name === entry.name))) {
    return true;
  }

  if ((entry.legacyHashes ?? []).includes(targetHash)) {
    return true;
  }

  if (FORCE_INSTALL && !(targetName === "codex" && entry.kind === "agent")) {
    return true;
  }

  throw new Error(
    `Refusing to remove existing deprecated ${entry.kind} target that is not marked as do-it managed: ${entry.target}. ` +
        (targetName === "codex" && entry.kind === "agent"
          ? "Native agent installs never force removal."
          : "Set DO_IT_FORCE=1 to remove it intentionally.")
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
  if (!onlyAgents && state.version !== manifest.version) {
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

function runPreInstall() {
  for (const script of targetConfig.preInstall ?? []) {
    const scriptPath = resolveRepoPath(script);
    if (!fs.existsSync(scriptPath)) {
      throw new Error(`Pre-install script missing: ${script}`);
    }
    const result = spawnSync(process.execPath, [scriptPath], {
      stdio: "inherit",
      env: process.env
    });
    if (result.error) throw result.error;
    if (result.status !== 0) {
      throw new Error(`Pre-install script failed: ${script} (exit ${result.status})`);
    }
  }
}

function runPostInstall() {
  for (const script of targetConfig.postInstall ?? []) {
    if (targetName === "cursor" && script === "scripts/register-cursor-plugin.mjs") {
      registerCursorPlugin({ installRoot, version: manifest.version });
      continue;
    }

    const scriptPath = resolveRepoPath(script);
    if (!fs.existsSync(scriptPath)) {
      throw new Error(`Post-install script missing: ${script}`);
    }
    const result = spawnSync(process.execPath, [scriptPath], {
      stdio: "inherit",
      env: {
        ...process.env,
        DO_IT_INSTALL_ROOT: installRoot,
        DO_IT_MANIFEST_VERSION: manifest.version,
        DO_IT_TARGET: targetName
      }
    });
    if (result.error) throw result.error;
    if (result.status !== 0) {
      throw new Error(`Post-install script failed: ${script} (exit ${result.status})`);
    }
  }
}

function runMigration(state) {
  if (noMigrate) {
    console.error(
      `do-it: install state at ${statePath} is ${state.version}, but the bundled manifest is ${manifest.version}. ` +
        "Re-run without --no-migrate (silent migrate is the default) or run \`do-it install\` once interactively to migrate."
    );
    process.exit(2);
  }

  console.error(`[do-it] migrating ${state.version} → ${manifest.version} (state at ${statePath})`);

  const backupPath = `${statePath}.pre-migrate.json`;
  try {
    fs.copyFileSync(statePath, backupPath);
    console.error(`[do-it] state backup → ${backupPath}`);
  } catch (err) {
    console.error(`[do-it] could not back up install state: ${err.message}`);
    throw err;
  }

  // invariant: migrated state is in-memory only; writeInstallState() rewrites
  // it fresh from the manifest, so the migration never reaches disk.
  applyMatchingMigrations(state, manifest.migrations, state.version);
}

function install() {
  if (!onlyAgents) runPreInstall();
  assertNativePathsSafe();
  assertCodexRoleConflictsAbsent();

  const stateInfo = targetName === "codex" ? readLegacyMigrationState() : null;
  if (stateInfo?.error) throw new Error(`Refusing unreadable install state: ${stateInfo.error}`);
  const state = stateInfo?.state ?? readInstallState();
  if (onlyAgents && noMigrate && needsMigration(state, manifest.version)) {
    throw new Error("Install state version differs; re-run without --no-migrate to update native agents.");
  }
  if (!onlyAgents && needsMigration(state, manifest.version)) {
    runMigration(state);
  }

  for (const entry of entries) {
    assertInstallSafe(entry, state);
  }

  for (const deprecated of deprecatedEntries) {
    assertDeprecatedRemovalSafe(deprecated, state);
  }

  if (!onlyAgents) fs.mkdirSync(resolveHomePath("skills"), { recursive: true });
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

    for (const entry of deprecatedEntries) {
      const targetPath = resolveHomePath(entry.target);
      if (assertDeprecatedRemovalSafe(entry, state)) {
        removeDeprecatedTarget(targetPath, transaction);
        summary.push(`removed:${entry.kind}:${entry.name}`);
      }
    }

    backupTargetForTransaction(statePath, transaction);
    writeInstallState(state);
    if (!onlyAgents) runPostInstall();
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

  console.log(`install completed into ${installRoot} (target=${targetName})`);
  console.log(`managed entries: ${summary.length}`);
  for (const item of summary) {
    console.log(`- ${item}`);
  }

  if (!onlyAgents) reportCrossHostVersions();
}

function doctor() {
  const missing = [];
  const drift = [];
  const ok = [];

  try {
    assertNativePathsSafe();
    assertCodexRoleConflictsAbsent();
  } catch (error) {
    console.error(`Native agent availability unconfirmed: ${error.message}`);
    process.exitCode = 1;
    return;
  }
  if (targetName === "codex") {
    console.log("Native role files: CODEX_HOME/agents (plugin cache files do not establish role availability).");
  }

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

  for (const entry of deprecatedEntries) {
    assertManagedTargetShape(entry);

    const targetPath = resolveHomePath(entry.target);
    if (pathState(targetPath)) {
      drift.push(`deprecated:${entry.kind}:${entry.name} remains at ${targetPath}`);
    }
  }

  if (targetName === "cursor") {
    doctorCursorExtras(ok, missing, drift);
  }

  console.log(`doctor checked ${entries.length} managed entries in ${installRoot} (target=${targetName})`);
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

  // Friendly nudge when the *only* problem is a minor-version drift — `do-it
  // install` will silently migrate.
  const stateOnDisk = readInstallState();
  if (!onlyAgents && needsMigration(stateOnDisk, manifest.version)) {
    console.log("");
    console.log(
      `hint: install state at ${statePath} is ${stateOnDisk.version}, manifest is ${manifest.version}. ` +
        `Run \`do-it install --target=${targetName}${onlyAgents ? " --only=agents" : ""}\` to migrate (silent by default).`
    );
  }

  if (!onlyAgents) reportCrossHostVersions();

  if (sessionId) {
    printSessionSummary(sessionId);
  }
}

/**
 * Cursor-specific doctor checks beyond managed entry copies:
 * - plugin.json present at install root (absolute path)
 * - user-level ~/.cursor/hooks.json wired to plugin scripts via run-hook.cmd
 * - no bare .sh commands (Windows opens those as editor documents)
 * - Git Bash resolvable on win32
 * - sample hook script is executable / runnable
 */
function doctorCursorExtras(ok, missing, drift) {
  const pluginJson = path.join(installRoot, ".cursor-plugin", "plugin.json");
  if (fs.existsSync(pluginJson)) {
    ok.push(`cursor:plugin.json at ${path.resolve(pluginJson)}`);
  } else {
    missing.push(`cursor:plugin.json missing at ${path.resolve(pluginJson)}`);
  }

  const home = resolveUserHome();
  if (!home) {
    drift.push("cursor:HOME/USERPROFILE unset — cannot verify user-level ~/.cursor/hooks.json wiring");
    return;
  }

  // Prefer the official local path Cursor actually loads when present, but
  // validate that discovery copy before trusting it over the managed root.
  const localPlugin = path.join(home, ".cursor", "plugins", "local", "do-it-cursor");
  const localState = pathState(localPlugin);
  let pluginForHooks = installRoot;
  if (localState) {
    try {
      validateCursorPlugin(localPlugin, {
        requireRuntime: true,
        expectedVersion: manifest.version
      });
      pluginForHooks = localPlugin;
      ok.push(`cursor:discovery-copy valid at ${path.resolve(localPlugin)}`);
    } catch (error) {
      drift.push(`cursor:discovery-copy invalid: ${error.message}`);
    }
  } else {
    missing.push(`cursor:discovery-copy missing at ${path.resolve(localPlugin)}`);
  }

  const runner = path.join(pluginForHooks, "hooks", "run-hook.cmd");
  if (fs.existsSync(runner)) {
    ok.push(`cursor:run-hook.cmd at ${path.resolve(runner)}`);
  } else {
    missing.push(`cursor:run-hook.cmd missing at ${path.resolve(runner)}`);
  }

  const wired = userHooksWiredForPlugin(home, path.resolve(pluginForHooks));
  if (wired.ok) {
    ok.push(`cursor:user-hooks wired at ${path.resolve(wired.hooksPath)}`);
  } else {
    missing.push(`cursor:user-hooks ${wired.reason}`);
  }

  // On WSL, Windows-hosted Cursor reads the mirrored USERPROFILE tree — also
  // verify that home when the mirror plugin is present so doctor matches
  // install-cursor-local. (Partial install failures fail closed in the installer.)
  if (process.platform !== "win32") {
    const up = process.env.USERPROFILE;
    if (up && looksLikeWindowsPath(up)) {
      const winHome = toWslMountPath(up);
      const winPlugin = path.join(winHome, ".cursor", "plugins", "local", "do-it-cursor");
      if (pathState(winPlugin)) {
        try {
          validateCursorPlugin(winPlugin, {
            requireRuntime: true,
            expectedVersion: manifest.version
          });
          const winWired = userHooksWiredForPlugin(winHome, path.resolve(winPlugin));
          if (winWired.ok) {
            ok.push(`cursor:windows-mirror-hooks wired at ${path.resolve(winWired.hooksPath)}`);
          } else {
            missing.push(`cursor:windows-mirror-hooks ${winWired.reason}`);
          }
        } catch (error) {
          drift.push(`cursor:windows-mirror invalid: ${error.message}`);
        }
      }
    }
  }

  if (process.platform === "win32") {
    const bash = resolveGitBash();
    if (bash) {
      ok.push(`cursor:git-bash at ${bash}`);
    } else {
      missing.push(
        "cursor:git-bash not found (install Git for Windows; System32\\bash.exe / WSL stub is not enough)"
      );
    }
  }

  const sample = path.join(pluginForHooks, "hooks", "session-start.sh");
  if (!fs.existsSync(sample)) {
    missing.push(`cursor:sample-hook missing at ${path.resolve(sample)}`);
    return;
  }

  const pluginRootResolved = path.resolve(pluginForHooks);
  const underPluginRoot = (candidate) => {
    const resolved = path.resolve(candidate);
    if (process.platform === "win32") {
      const root = pluginRootResolved.toLowerCase();
      const value = resolved.toLowerCase();
      return value === root || value.startsWith(`${root}${path.sep}`);
    }
    return resolved === pluginRootResolved || resolved.startsWith(`${pluginRootResolved}${path.sep}`);
  };
  const sameDir = (left, right) =>
    process.platform === "win32"
      ? path.resolve(left).toLowerCase() === path.resolve(right).toLowerCase()
      : path.resolve(left) === path.resolve(right);

  let smoke;
  let smokeLabel;
  if (process.platform === "win32" && fs.existsSync(runner)) {
    const runnerPath = path.resolve(runner);
    const hooksDir = path.join(pluginRootResolved, "hooks");
    if (
      path.basename(runnerPath).toLowerCase() !== "run-hook.cmd" ||
      !underPluginRoot(runnerPath) ||
      !sameDir(path.dirname(runnerPath), hooksDir)
    ) {
      missing.push(`cursor:run-hook.cmd rejected outside plugin root: ${runnerPath}`);
      return;
    }
    // Node cannot spawn .cmd without a shell (EINVAL). Run a fixed relative
    // command from the validated hooks directory so the shell line never
    // embeds an environment-derived absolute path.
    smokeLabel = `cmd.exe /d /s /c run-hook.cmd session-start (cwd=${hooksDir})`;
    smoke = spawnSync("cmd.exe", ["/d", "/s", "/c", "run-hook.cmd session-start"], {
      cwd: hooksDir,
      encoding: "utf8",
      windowsHide: true,
      shell: false,
      input: '{"session_id":"doctor-smoke","hook_event_name":"sessionStart"}\n',
      env: {
        ...process.env,
        CURSOR_PLUGIN_ROOT: pluginRootResolved,
        CURSOR_PLUGIN_DATA: path.join(pluginRootResolved, ".do-it-data"),
        CURSOR_VERSION: process.env.CURSOR_VERSION || "doctor"
      },
      timeout: 20_000
    });
  } else {
    const args = fs.existsSync(runner)
      ? [path.resolve(runner), "session-start"]
      : [path.resolve(sample)];
    const scriptPath = args[0];
    const scriptBase = path.basename(scriptPath).toLowerCase();
    if (
      (scriptBase !== "run-hook.cmd" && scriptBase !== "session-start.sh") ||
      !underPluginRoot(scriptPath)
    ) {
      missing.push(`cursor:hook-smoke rejected outside plugin root: ${scriptPath}`);
      return;
    }
    smokeLabel = `bash ${args.join(" ")}`;
    smoke = spawnSync("bash", args, {
      encoding: "utf8",
      shell: false,
      input: '{"session_id":"doctor-smoke","hook_event_name":"sessionStart"}\n',
      env: {
        ...process.env,
        CURSOR_PLUGIN_ROOT: pluginRootResolved,
        CURSOR_PLUGIN_DATA: path.join(pluginRootResolved, ".do-it-data"),
        CURSOR_VERSION: process.env.CURSOR_VERSION || "doctor"
      },
      timeout: 20_000
    });
  }
  if (smoke.error) {
    drift.push(`cursor:sample-hook could not run: ${smoke.error.message}`);
  } else if (smoke.status !== 0) {
    drift.push(
      `cursor:sample-hook exited ${smoke.status}: ${(smoke.stderr || smoke.stdout || "").trim().slice(0, 200)}`
    );
  } else if (!String(smoke.stdout || "").includes("additional_context")) {
    drift.push(`cursor:sample-hook produced no additional_context (${smokeLabel})`);
  } else {
    ok.push(`cursor:sample-hook runnable via ${smokeLabel}`);
  }
}

// Canonical order: hooks/lib/common.sh do_it_session_dir (keep in sync).
// Session bookkeeping uses host data or a temporary directory; doctor looks up state
// via env roots; managed plugin copies remain read-only.
function sessionsBaseDir() {
  if (process.env.CURSOR_PLUGIN_DATA) {
    return path.join(process.env.CURSOR_PLUGIN_DATA, "sessions");
  }
  if (process.env.CLAUDE_PLUGIN_DATA) {
    return path.join(process.env.CLAUDE_PLUGIN_DATA, "sessions");
  }
  if (process.env.PLUGIN_DATA) {
    return path.join(process.env.PLUGIN_DATA, "sessions");
  }
  if (process.env.DO_IT_HOOK_DATA) {
    return path.join(process.env.DO_IT_HOOK_DATA, "sessions");
  }
  if (process.env.CODEX_HOME) {
    return path.join(process.env.CODEX_HOME, "do-it-data", "sessions");
  }
  return path.join(process.env.TMPDIR || "/tmp", "do-it-sessions");
}

function printSessionSummary(id) {
  const sessionDir = path.join(sessionsBaseDir(), id);
  console.log("");
  console.log(`session: ${id}`);
  console.log(`  dir: ${sessionDir}`);

  const jsonPath = path.join(sessionDir, "state.json");
  const kvPath = path.join(sessionDir, "state.kv");

  if (fs.existsSync(jsonPath)) {
    try {
      const raw = fs.readFileSync(jsonPath, "utf8");
      const parsed = JSON.parse(raw);
      console.log(JSON.stringify(parsed, null, 2));
      return;
    } catch (err) {
      console.log(`  (state.json unreadable: ${err.message})`);
    }
  }

  if (fs.existsSync(kvPath)) {
    console.log("(jq unavailable; flat state.kv follows)");
    console.log(fs.readFileSync(kvPath, "utf8"));
    return;
  }

  console.log("  (no state recorded for this session)");
}

// Report the recorded install-state version of every manifest target, so
// cross-host drift is visible: each target keeps a separate state file, and
// installing one host never touches the other's state.
function reportCrossHostVersions() {
  const names = Object.keys(targetsConfig);
  if (names.length < 2) return;

  const lines = [];
  for (const name of names) {
    const tConfig = targetsConfig[name];
    const override = process.env[tConfig.rootEnv];
    let root = null;
    if (override) {
      root = path.resolve(override);
    } else if (process.env.HOME) {
      root = expandRootDefault(tConfig.rootDefault);
    }
    if (!root) {
      lines.push(`- ${name}: unknown (set ${tConfig.rootEnv} to check)`);
      continue;
    }

    const tStatePath = path.join(
      root,
      tConfig.stateFile ?? ".do-it-install-state.json"
    );
    let version = null;
    try {
      version = JSON.parse(fs.readFileSync(tStatePath, "utf8")).version ?? null;
    } catch {
      version = null;
    }

    if (!version) {
      lines.push(`- ${name}: not installed`);
    } else if (version === manifest.version) {
      lines.push(`- ${name}: ${version} (up to date)`);
    } else {
      lines.push(
        `- ${name}: ${version} ` +
          `(run \`do-it install --target=${name}\` to update to ${manifest.version})`
      );
    }
  }

  console.log("");
  console.log(`install state by target (manifest ${manifest.version}):`);
  for (const line of lines) {
    console.log(line);
  }
}

if (command === "install") {
  install();
} else if (command === "doctor") {
  doctor();
} else if (command === "migrate-legacy") {
  migrateLegacy();
} else {
  install();
  doctor();
}
