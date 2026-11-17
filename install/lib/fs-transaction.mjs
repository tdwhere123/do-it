import fs from "node:fs";
import crypto from "node:crypto";
import path from "node:path";
import process from "node:process";

export function assertWithinInstallRoot(installRoot, targetPath) {
  const relativePath = path.relative(installRoot, targetPath);
  const isWithin =
    relativePath === "" ||
    (!relativePath.startsWith("..") && !path.isAbsolute(relativePath));

  if (!isWithin) {
    throw new Error(`Refusing to operate outside install root: ${targetPath}`);
  }
}

export function pathState(targetPath) {
  try {
    return fs.lstatSync(targetPath);
  } catch {
    return null;
  }
}

export function tempSiblingPath(installRoot, targetPath, purpose) {
  const parentPath = path.dirname(targetPath);
  const baseName = path.basename(targetPath);
  const tempPath = path.join(
    parentPath,
    `.do-it-${purpose}-${baseName}-${process.pid}-${crypto.randomUUID()}`
  );

  assertWithinInstallRoot(installRoot, tempPath);
  return tempPath;
}

export function copyEntry(sourcePath, targetPath) {
  const sourceStat = fs.lstatSync(sourcePath);
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });

  if (sourceStat.isDirectory()) {
    fs.cpSync(sourcePath, targetPath, { recursive: true });
    return;
  }

  fs.copyFileSync(sourcePath, targetPath);
}

export function createStagingRoot(installRoot) {
  const stagingRoot = path.join(
    installRoot,
    `.do-it-install-staging-${process.pid}-${crypto.randomUUID()}`
  );

  assertWithinInstallRoot(installRoot, stagingRoot);
  fs.mkdirSync(stagingRoot, { recursive: true });
  return stagingRoot;
}

export function stagedEntryPath(installRoot, stagingRoot, entry) {
  const stagedPath = path.join(stagingRoot, entry.target);
  assertWithinInstallRoot(installRoot, stagedPath);
  return stagedPath;
}

export function backupTargetForTransaction(installRoot, targetPath, transaction) {
  assertWithinInstallRoot(installRoot, targetPath);
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });

  const targetState = pathState(targetPath);
  const record = {
    targetPath,
    backupPath: targetState ? tempSiblingPath(installRoot, targetPath, "backup") : null,
    hadTarget: Boolean(targetState),
    installed: false
  };

  if (targetState) {
    fs.renameSync(targetPath, record.backupPath);
  }

  transaction.push(record);
  return record;
}

export function replaceManagedTarget(installRoot, stagedPath, targetPath, transaction) {
  assertWithinInstallRoot(installRoot, stagedPath);
  assertWithinInstallRoot(installRoot, targetPath);

  const record = backupTargetForTransaction(installRoot, targetPath, transaction);
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

export function removeDeprecatedTarget(installRoot, targetPath, transaction) {
  backupTargetForTransaction(installRoot, targetPath, transaction);
}

export function rollbackTransaction(transaction) {
  const failures = [];
  for (const record of [...transaction].reverse()) {
    try {
      fs.rmSync(record.targetPath, { recursive: true, force: true });
      if (record.hadTarget && record.backupPath && pathState(record.backupPath)) {
        fs.renameSync(record.backupPath, record.targetPath);
      }
    } catch (error) {
      failures.push({ path: record.backupPath ?? record.targetPath, error });
    }
  }
  return failures;
}

export function cleanupTransaction(transaction) {
  const failures = [];
  for (const record of transaction) {
    if (record.backupPath) {
      try {
        fs.rmSync(record.backupPath, { recursive: true, force: true });
      } catch (error) {
        failures.push({ path: record.backupPath, error });
      }
    }
  }
  return failures;
}

export function walkDirectory(rootPath) {
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

export function filesMatch(sourcePath, targetPath) {
  const sourceBuffer = fs.readFileSync(sourcePath);
  const targetBuffer = fs.readFileSync(targetPath);
  return sourceBuffer.equals(targetBuffer);
}

export function hashBuffer(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

export function hashPath(targetPath) {
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

export function readInstallState(statePath) {
  try {
    return JSON.parse(fs.readFileSync(statePath, "utf8"));
  } catch {
    return { entries: {} };
  }
}

export function writeFileAtomic(installRoot, targetPath, content) {
  assertWithinInstallRoot(installRoot, targetPath);
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });

  const tempPath = tempSiblingPath(installRoot, targetPath, "state");

  try {
    fs.writeFileSync(tempPath, content);
    fs.renameSync(tempPath, targetPath);
  } finally {
    fs.rmSync(tempPath, { recursive: true, force: true });
  }
}

export function writeInstallState({
  installRoot,
  statePath,
  previousState,
  onlyAgents,
  manifestVersion,
  entries,
  deprecatedEntries,
  resolveRepoPath
}) {
  const state = {
    // A partial update must not suppress future migrations for skills/hooks.
    version:
      onlyAgents &&
      previousState.version &&
      Object.values(previousState.entries ?? {}).some((entry) => entry.kind !== "agent")
        ? previousState.version
        : manifestVersion,
    installedAt: new Date().toISOString(),
    entries: {
      ...(onlyAgents ? previousState.entries : {}),
      ...Object.fromEntries(
        entries.map((entry) => [
          entry.target,
          { kind: entry.kind, name: entry.name, hash: hashPath(resolveRepoPath(entry.source)) }
        ])
      )
    }
  };
  for (const entry of deprecatedEntries) delete state.entries[entry.target];

  writeFileAtomic(installRoot, statePath, `${JSON.stringify(state, null, 2)}\n`);
}

export function treesMatch(sourcePath, targetPath) {
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
