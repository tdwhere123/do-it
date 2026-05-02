#!/usr/bin/env node

import fs from "node:fs";
import crypto from "node:crypto";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const VALID_COMMANDS = new Set(["install", "doctor", "setup"]);
const HELP_FLAGS = new Set(["-h", "--help", "help"]);
const FORCE_INSTALL = process.env.DO_IT_FORCE === "1";
const DEFAULT_TARGET = process.env.DO_IT_TARGET || "codex";

function usage(stream = console.error) {
  const commandName =
    process.env.DO_IT_CLI_NAME ||
    path.basename(process.argv[1] || "manage.mjs");

  stream(`Usage: ${commandName} <install|doctor|setup> [--target=<name>]`);
  stream("");
  stream("Commands:");
  stream("  install  Copy managed skills and agents into the install root");
  stream("  doctor   Verify managed entries in the install root");
  stream("  setup    Run install, then doctor");
  stream("");
  stream("Options:");
  stream("  --target=<name>   Pick install target (default: codex). Available: codex, claude.");
  stream("  --with-optional   Include skills marked optional (e.g. visual-planning).");
  stream("  --session=<id>    With doctor: pretty-print session state (hook invocations, tier history) for the given session id.");
  stream("  --no-migrate      With install: refuse to silently migrate from an older install-state version (exit code 2).");
  stream("");
  stream("Environment:");
  stream("  CODEX_HOME                    Override codex install root (default: $HOME/.codex)");
  stream("  CLAUDE_PLUGIN_ROOT_OVERRIDE   Override claude install root (default: $HOME/.claude)");
  stream("  DO_IT_TARGET                  Set default target if --target is omitted");
  stream("  DO_IT_FORCE=1                 Replace existing files not marked as do-it managed");
}

function parseArgs(argv) {
  const positional = [];
  let targetName = DEFAULT_TARGET;
  let withOptional = false;
  let sessionId = null;
  let noMigrate = false;
  for (const arg of argv) {
    if (arg === "--with-optional") {
      withOptional = true;
    } else if (arg === "--no-migrate") {
      noMigrate = true;
    } else if (arg.startsWith("--target=")) {
      targetName = arg.slice("--target=".length);
    } else if (arg.startsWith("--session=")) {
      sessionId = arg.slice("--session=".length);
    } else {
      positional.push(arg);
    }
  }
  return { positional, targetName, withOptional, sessionId, noMigrate };
}

const { positional, targetName, withOptional, sessionId, noMigrate } = parseArgs(process.argv.slice(2));
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

function expandRootDefault(template) {
  return template.replace(/\$HOME/g, process.env.HOME ?? "");
}

const rootEnvName = targetConfig.rootEnv;
const installRoot = process.env[rootEnvName]
  ? path.resolve(process.env[rootEnvName])
  : expandRootDefault(targetConfig.rootDefault);

if (!process.env[rootEnvName] && !process.env.HOME) {
  throw new Error(`HOME is not set. Set ${rootEnvName} explicitly.`);
}

const deprecatedTargets = manifest.deprecatedTargets ?? [];

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

const skillEntries = manifest.skills
  .filter((entry) => withOptional || !entry.optional)
  .map((entry) => adaptEntry(entry, "skill"));
const agentEntries = manifest.agents.map((entry) => adaptEntry(entry, "agent"));
const extraEntries = (targetConfig.extras ?? []).map((extra) => ({
  kind: "extra",
  name: extra.name,
  source: extra.source,
  target: extra.target,
  shape: extra.kind === "directory" ? "directory" : "file"
}));
const entries = [...skillEntries, ...agentEntries, ...extraEntries];

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
  if (entry.kind === "extra") {
    // Extras are top-level dirs/files added by target config (e.g.
    // .claude-plugin, hooks, commands). Allow single-segment names.
    if (!/^[A-Za-z0-9_.-]+$/.test(entry.target)) {
      throw new Error(
        `Unsafe extra target for ${entry.name}: ${entry.target}. ` +
          "Expected a single-segment top-level name."
      );
    }
    return;
  }

  const skillPattern = /^skills\/[^/]+$/;
  const agentExtRaw = targetConfig.agentTargetExt ?? ".toml";
  const agentExtEscaped = agentExtRaw.replace(/\./g, "\\.");
  const agentPattern = new RegExp(`^agents/[^/]+${agentExtEscaped}$`);
  const pattern = entry.kind === "agent" ? agentPattern : skillPattern;

  if (!pattern.test(entry.target)) {
    throw new Error(
      `Unsafe ${entry.kind} target for ${entry.name}: ${entry.target}. ` +
        `Expected skills/<name> or agents/<name>${agentExtRaw}.`
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

  assertWithinInstallRoot(targetPath);

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

  assertWithinInstallRoot(targetPath);

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

function parseMinor(version) {
  if (typeof version !== "string") return null;
  const match = /^(\d+)\.(\d+)/.exec(version);
  if (!match) return null;
  return `${match[1]}.${match[2]}`;
}

function needsMigration(state) {
  if (!state || typeof state !== "object") return false;
  if (!state.version) return false;
  if (state.version === manifest.version) return false;
  const stateMinor = parseMinor(state.version);
  const manifestMinor = parseMinor(manifest.version);
  return stateMinor !== null && manifestMinor !== null && stateMinor !== manifestMinor;
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

  const migrations = Array.isArray(manifest.migrations) ? manifest.migrations : [];
  for (const m of migrations) {
    if (!matchesFromRange(m.from, state.version)) continue;
    for (const action of m.actions ?? []) {
      applyMigrationAction(action, state);
    }
  }
}

function matchesFromRange(spec, version) {
  if (!spec || !version) return false;
  if (spec === version) return true;
  // "0.4.x" matches any 0.4.* version.
  if (spec.endsWith(".x")) {
    const base = spec.slice(0, -2);
    return version.startsWith(`${base}.`);
  }
  return false;
}

function applyMigrationAction(action, state) {
  switch (action.type) {
    case "remove-state-entry": {
      if (state.entries && state.entries[action.target]) {
        delete state.entries[action.target];
        console.error(`[do-it]   removed state entry ${action.target}`);
      }
      break;
    }
    case "rename-state-key": {
      if (state.entries && state.entries[action.from] && !state.entries[action.to]) {
        state.entries[action.to] = state.entries[action.from];
        delete state.entries[action.from];
        console.error(`[do-it]   renamed state entry ${action.from} → ${action.to}`);
      }
      break;
    }
    default:
      console.error(`[do-it]   skipping unknown migration action: ${JSON.stringify(action)}`);
  }
}

function install() {
  runPreInstall();

  const state = readInstallState();
  if (needsMigration(state)) {
    runMigration(state);
  }

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

  console.log(`install completed into ${installRoot} (target=${targetName})`);
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
  if (needsMigration(stateOnDisk)) {
    console.log("");
    console.log(
      `hint: install state at ${statePath} is ${stateOnDisk.version}, manifest is ${manifest.version}. ` +
        `Run \`do-it install --target=${targetName}\` to migrate (silent by default).`
    );
  }

  if (sessionId) {
    printSessionSummary(sessionId);
  }
}

function sessionsBaseDir() {
  if (process.env.CLAUDE_PLUGIN_DATA) {
    return path.join(process.env.CLAUDE_PLUGIN_DATA, "sessions");
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

if (command === "install") {
  install();
} else if (command === "doctor") {
  doctor();
} else {
  install();
  doctor();
}
