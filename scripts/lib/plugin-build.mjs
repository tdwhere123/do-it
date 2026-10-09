/**
 * Shared file and version operations for host plugin builders.
 * Host-specific resource selection stays in the individual builders.
 */

import fs from "node:fs";
import crypto from "node:crypto";
import path from "node:path";
import process from "node:process";

export function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

/** Write JSON with a trailing newline, skipping the write when unchanged. */
export function writeJsonAtomic(filePath, value) {
  const content = `${JSON.stringify(value, null, 2)}\n`;
  const current = fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf8") : null;
  if (current === content) return false;

  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tempPath = path.join(
    path.dirname(filePath),
    `.do-it-${path.basename(filePath)}.${process.pid}.${crypto.randomUUID()}.tmp`
  );

  try {
    fs.writeFileSync(tempPath, content);
    fs.renameSync(tempPath, filePath);
  } finally {
    fs.rmSync(tempPath, { force: true });
  }

  return true;
}

export function assertVersionParity(manifest, pkg) {
  if (manifest.version !== pkg.version) {
    throw new Error(`manifest version ${manifest.version} does not match package version ${pkg.version}`);
  }
}

/**
 * Copy the given hook scripts plus hooks/lib and hooks/data into a plugin
 * bundle. Scripts are chmod 755 best-effort.
 */
export function copyHookScripts({ repoRoot, hooksSource, targetDir, scripts }) {
  fs.rmSync(targetDir, { recursive: true, force: true });
  fs.mkdirSync(targetDir, { recursive: true });

  for (const name of scripts) {
    const sourcePath = path.join(hooksSource, name);
    if (!fs.existsSync(sourcePath)) {
      throw new Error(`hook script missing: ${path.relative(repoRoot, sourcePath)}`);
    }
    fs.copyFileSync(sourcePath, path.join(targetDir, name));
    try {
      fs.chmodSync(path.join(targetDir, name), 0o755);
    } catch {
      // best-effort on platforms that ignore chmod
    }
  }

  for (const dirName of ["lib", "data"]) {
    const sourcePath = path.join(hooksSource, dirName);
    if (!fs.existsSync(sourcePath)) {
      throw new Error(`hooks/${dirName} missing`);
    }
    fs.cpSync(sourcePath, path.join(targetDir, dirName), { recursive: true });
  }
}
