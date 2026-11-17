#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { needsMigration, applyMatchingMigrations } from "./migrate.mjs";
import { registerCursorPlugin } from "../scripts/register-cursor-plugin.mjs";
import { acquireCursorHomeLocks, retainRecoveryFailures } from "../scripts/lib/cursor-plugin-fs.mjs";
import { resolveUserHome } from "../scripts/lib/user-home.mjs";
import { targetExtras } from "../scripts/lib/manifest-extras.mjs";
import {
  pathState, copyEntry, createStagingRoot, stagedEntryPath, backupTargetForTransaction,
  replaceManagedTarget, removeDeprecatedTarget, rollbackTransaction, cleanupTransaction,
  readInstallState, writeInstallState, treesMatch
} from "./lib/fs-transaction.mjs";
import {
  assertManagedTargetShape, assertNativePathsSafe, assertInstallSafe,
  assertDeprecatedRemovalSafe, collectInstallStateDrift
} from "./lib/install-safety.mjs";
import { assertCodexRoleConflictsAbsent } from "./lib/codex-roles.mjs";
import { readLegacyMigrationState, migrateLegacy } from "./lib/legacy-migration.mjs";
import { doctorCursorExtras, printSessionSummary, reportCrossHostVersions } from "./lib/doctor-extras.mjs";

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
    if (arg === "--only=agents") onlyAgents = true;
    else if (arg === "--with-optional") withOptional = true;
    else if (arg === "--no-migrate") noMigrate = true;
    else if (arg === "--apply") apply = true;
    else if (arg.startsWith("--target=")) targetName = arg.slice("--target=".length);
    else if (arg.startsWith("--session=")) sessionId = arg.slice("--session=".length);
    else positional.push(arg);
  }
  return { positional, targetName, withOptional, sessionId, noMigrate, apply, onlyAgents };
}

const { positional, targetName, withOptional, sessionId, noMigrate, apply, onlyAgents } =
  parseArgs(process.argv.slice(2));
const command = positional[0];

if (HELP_FLAGS.has(command)) {
  usage(console.log);
  process.exit(0);
}

if (!VALID_COMMANDS.has(command) || positional.length > 1) {
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

const deprecatedEntries = (manifest.deprecatedTargets ?? [])
  .map(adaptDeprecatedTarget)
  .filter(Boolean)
  .filter((entry) => !onlyAgents || entry.kind === "agent");

function adaptEntry(entry, kind) {
  if (kind === "skill") return { kind, ...entry };
  const source = `${targetConfig.agentSourceFrom}/${entry.name}${targetConfig.agentSourceExt}`;
  const target = `agents/${entry.name}${targetConfig.agentTargetExt}`;
  return { kind, ...entry, source, target };
}

function skillAllowedForTarget(entry) {
  return Boolean(withOptional || !entry.optional);
}

const skillEntries = manifest.skills.filter(skillAllowedForTarget).map((entry) => adaptEntry(entry, "skill"));
const canonicalAgentEntries = manifest.agents.map((entry) => adaptEntry(entry, "agent"));
const agentEntries =
  onlyAgents || targetName === "codex" || targetConfig.installAgents !== false
    ? canonicalAgentEntries
    : [];
const extraEntries = targetExtras(manifest, targetName).map((extra) => ({
  ...extra,
  kind: "extra",
  shape: extra.kind === "directory" ? "directory" : "file"
}));
const entries = onlyAgents ? agentEntries : [...skillEntries, ...agentEntries, ...extraEntries];

const resolveRepoPath = (relativePath) => path.join(repoRoot, relativePath);
const resolveHomePath = (relativePath) => path.join(installRoot, relativePath);
const statePath = resolveHomePath(targetConfig.stateFile ?? ".do-it-install-state.json");

function runPreInstall() {
  for (const script of targetConfig.preInstall ?? []) {
    const scriptPath = resolveRepoPath(script);
    if (!fs.existsSync(scriptPath)) {
      throw new Error(`Pre-install script missing: ${script}`);
    }
    const result = spawnSync(process.execPath, [scriptPath], { stdio: "inherit", env: process.env });
    if (result.error) throw result.error;
    if (result.status !== 0) {
      throw new Error(`Pre-install script failed: ${script} (exit ${result.status})`);
    }
  }
}

function runPostInstall(homeLock) {
  for (const script of targetConfig.postInstall ?? []) {
    if (targetName === "cursor" && script === "scripts/register-cursor-plugin.mjs") {
      registerCursorPlugin({ installRoot, version: manifest.version, homeLock });
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
    process.exitCode = 2;
    return false;
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

  // invariant: migrated state is in-memory only; writeInstallState() rewrites it fresh from manifest.
  applyMatchingMigrations(state, manifest.migrations, state.version);
}

function installEntries(homeLock) {
  if (!onlyAgents) runPreInstall();
  assertNativePathsSafe({ targetName, installRoot, statePath });
  assertCodexRoleConflictsAbsent({
    targetName,
    installRoot,
    canonicalAgentEntries,
    deprecatedEntries,
    resolveHomePath
  });

  const stateInfo = targetName === "codex" ? readLegacyMigrationState(statePath) : null;
  if (stateInfo?.error) throw new Error(`Refusing unreadable install state: ${stateInfo.error}`);
  const state = stateInfo?.state ?? readInstallState(statePath);
  if (onlyAgents && noMigrate && needsMigration(state, manifest.version)) {
    throw new Error("Install state version differs; re-run without --no-migrate to update native agents.");
  }
  if (!onlyAgents && needsMigration(state, manifest.version) && runMigration(state) === false) return;

  const safetyCtx = {
    state, targetName, targetConfig, installRoot,
    forceInstall: FORCE_INSTALL, resolveRepoPath, resolveHomePath
  };
  for (const entry of entries) assertInstallSafe({ entry, ...safetyCtx });
  for (const deprecated of deprecatedEntries) assertDeprecatedRemovalSafe({ entry: deprecated, ...safetyCtx });

  if (!onlyAgents) fs.mkdirSync(resolveHomePath("skills"), { recursive: true });
  fs.mkdirSync(resolveHomePath("agents"), { recursive: true });

  const stagingRoot = createStagingRoot(installRoot);
  const transaction = [];
  const summary = [];
  let committed = false;
  let installError;

  try {
    for (const entry of entries) {
      copyEntry(resolveRepoPath(entry.source), stagedEntryPath(installRoot, stagingRoot, entry));
    }
    for (const entry of entries) {
      replaceManagedTarget(installRoot, stagedEntryPath(installRoot, stagingRoot, entry), resolveHomePath(entry.target), transaction);
      summary.push(`${entry.kind}:${entry.name}`);
    }
    for (const entry of deprecatedEntries) {
      if (assertDeprecatedRemovalSafe({ entry, ...safetyCtx })) {
        removeDeprecatedTarget(installRoot, resolveHomePath(entry.target), transaction);
        summary.push(`removed:${entry.kind}:${entry.name}`);
      }
    }

    backupTargetForTransaction(installRoot, statePath, transaction);
    writeInstallState({
      installRoot, statePath, previousState: state, onlyAgents,
      manifestVersion: manifest.version, entries, deprecatedEntries, resolveRepoPath
    });
    if (!onlyAgents) runPostInstall(homeLock);
    committed = true;
  } catch (error) {
    installError = error;
    retainRecoveryFailures(error, "rollback", rollbackTransaction(transaction));
    throw error;
  } finally {
    let cleanupError = installError;
    const backupFailures = committed ? cleanupTransaction(transaction) : [];
    if (backupFailures.length) {
      cleanupError ??= new Error("Managed install committed; cleanup incomplete");
      retainRecoveryFailures(cleanupError, "backup cleanup", backupFailures);
    }
    try {
      fs.rmSync(stagingRoot, { recursive: true, force: true });
    } catch (error) {
      cleanupError ??= new Error("Managed install committed; cleanup incomplete");
      retainRecoveryFailures(cleanupError, "stage cleanup", [{ path: stagingRoot, error }]);
    }
    if (!installError && cleanupError) throw cleanupError;
  }

  console.log(`install completed into ${installRoot} (target=${targetName})`);
  console.log(`managed entries: ${summary.length}`);
  for (const item of summary) console.log(`- ${item}`);
  if (!onlyAgents) {
    reportCrossHostVersions({ targetsConfig, manifestVersion: manifest.version, expandRootDefault });
  }
}

function install() {
  if (targetName !== "cursor") return installEntries();
  const home = resolveUserHome();
  if (!home) throw new Error("HOME / USERPROFILE is not set");
  const homeLock = acquireCursorHomeLocks([home]);
  let installError;
  try {
    return installEntries(homeLock);
  } catch (error) {
    installError = error;
    throw error;
  } finally {
    const failures = homeLock();
    if (installError) retainRecoveryFailures(installError, "lock release", failures);
    else {
      for (const failure of failures) {
        console.error(
          `do-it: retained Cursor install lock after cleanup failed at ${failure.path}: ${failure.error.message}`
        );
      }
    }
  }
}

function doctor() {
  const missing = [];
  const drift = [];
  const ok = [];

  try {
    assertNativePathsSafe({ targetName, installRoot, statePath });
    assertCodexRoleConflictsAbsent({
      targetName,
      installRoot,
      canonicalAgentEntries,
      deprecatedEntries,
      resolveHomePath
    });
  } catch (error) {
    console.error(`Native agent availability unconfirmed: ${error.message}`);
    process.exitCode = 1;
    return;
  }
  if (targetName === "codex") {
    console.log("Native role files: CODEX_HOME/agents (plugin cache files do not establish role availability).");
  }

  for (const issue of collectInstallStateDrift({
    statePath,
    onlyAgents,
    manifestVersion: manifest.version,
    entries,
    resolveRepoPath
  })) {
    drift.push(`state:${issue}`);
  }

  for (const entry of entries) {
    assertManagedTargetShape(entry, targetConfig);
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
    assertManagedTargetShape(entry, targetConfig);
    const targetPath = resolveHomePath(entry.target);
    if (pathState(targetPath)) {
      drift.push(`deprecated:${entry.kind}:${entry.name} remains at ${targetPath}`);
    }
  }

  if (targetName === "cursor") {
    doctorCursorExtras({ installRoot, manifestVersion: manifest.version, ok, missing, drift });
  }

  console.log(`doctor checked ${entries.length} managed entries in ${installRoot} (target=${targetName})`);
  console.log(`ok: ${ok.length}`);
  console.log(`missing: ${missing.length}`);
  console.log(`drift: ${drift.length}`);
  for (const item of ok) console.log(`- OK ${item}`);
  for (const item of missing) console.log(`- MISSING ${item}`);
  for (const item of drift) console.log(`- DRIFT ${item}`);

  if (missing.length > 0 || drift.length > 0) process.exitCode = 1;

  const stateOnDisk = readInstallState(statePath);
  if (!onlyAgents && needsMigration(stateOnDisk, manifest.version)) {
    console.log("");
    console.log(
      `hint: install state at ${statePath} is ${stateOnDisk.version}, manifest is ${manifest.version}. ` +
        `Run \`do-it install --target=${targetName}${onlyAgents ? " --only=agents" : ""}\` to migrate (silent by default).`
    );
  }

  if (!onlyAgents) {
    reportCrossHostVersions({ targetsConfig, manifestVersion: manifest.version, expandRootDefault });
  }
  if (sessionId) printSessionSummary(sessionId);
}

if (command === "install") {
  install();
} else if (command === "doctor") {
  doctor();
} else if (command === "migrate-legacy") {
  migrateLegacy({
    targetName,
    targetConfig,
    installRoot,
    statePath,
    deprecatedEntries,
    apply,
    resolveHomePath
  });
} else {
  install();
  if (!process.exitCode) doctor();
}
