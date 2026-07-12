#!/usr/bin/env node
/**
 * Post-install helper for the Cursor target.
 *
 * Official local discovery path is ~/.cursor/plugins/local/<name>/ with a real
 * directory (Cursor rejects external symlinks). When CLI setup already writes
 * there, keep that managed tree. Otherwise mirror the built bundle into local/.
 * Does **not** write Claude Code registries.
 */

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const manifest = JSON.parse(fs.readFileSync(path.join(repoRoot, "manifest.json"), "utf8"));

const home = process.env.HOME;
if (!home) {
  console.error("register-cursor-plugin: HOME is not set");
  process.exit(1);
}

const installRoot =
  process.env.DO_IT_INSTALL_ROOT ??
  process.env.CURSOR_PLUGIN_ROOT_OVERRIDE ??
  path.join(home, ".cursor", "plugins", "local", "do-it-cursor");

const version = process.env.DO_IT_MANIFEST_VERSION ?? manifest.version;
const localPlugin = path.join(home, ".cursor", "plugins", "local", "do-it-cursor");
const cursorMarkerPath = path.join(home, ".cursor", "plugins", "do-it-cursor-install.json");
const builtBundle = path.join(repoRoot, "plugins", "do-it-cursor");

function copyTree(from, to) {
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.rmSync(to, { recursive: true, force: true });
  const rsync = spawnSync("rsync", ["-a", "--delete", `${from}/`, `${to}/`], { encoding: "utf8" });
  if (rsync.status !== 0) {
    fs.cpSync(from, to, { recursive: true });
  }
}

function hasPluginManifest(dir) {
  return fs.existsSync(path.join(dir, ".cursor-plugin", "plugin.json"));
}

function isSymlink(dir) {
  try {
    return fs.lstatSync(dir).isSymbolicLink();
  } catch {
    return false;
  }
}

function ensureLocalPluginCopy() {
  const sameAsLocal = path.resolve(installRoot) === path.resolve(localPlugin);

  // CLI setup already installed into the official local path — do not clobber
  // managed state / rewritten references with a second copy pass.
  if (sameAsLocal) {
    if (!hasPluginManifest(localPlugin)) {
      console.error(
        `register-cursor-plugin: missing plugin.json under ${localPlugin}; run do-it install --target=cursor first`
      );
      process.exit(1);
    }
    if (isSymlink(localPlugin)) {
      if (!hasPluginManifest(builtBundle)) {
        console.error(
          `register-cursor-plugin: local path is a symlink and built bundle is missing at ${builtBundle}`
        );
        process.exit(1);
      }
      copyTree(builtBundle, localPlugin);
      console.error(`register-cursor-plugin: replaced external symlink with real copy -> ${localPlugin}`);
    } else {
      console.error(`register-cursor-plugin: local plugin already at ${localPlugin}`);
    }
    return localPlugin;
  }

  const source = hasPluginManifest(installRoot) ? installRoot : builtBundle;
  if (!hasPluginManifest(source)) {
    console.error(
      `register-cursor-plugin: missing plugin.json under ${source}; run npm run build:cursor-plugin / do-it install --target=cursor first`
    );
    process.exit(1);
  }

  copyTree(source, localPlugin);
  console.error(`register-cursor-plugin: copied plugin -> ${localPlugin}`);
  return localPlugin;
}

function writeCursorInstallMarker(installPath) {
  fs.mkdirSync(path.dirname(cursorMarkerPath), { recursive: true });
  const payload = {
    id: "do-it-cursor",
    installPath,
    version,
    registeredAt: new Date().toISOString(),
    note: "Local copy under ~/.cursor/plugins/local (Cursor rejects external symlinks)."
  };
  fs.writeFileSync(cursorMarkerPath, `${JSON.stringify(payload, null, 2)}\n`);
  console.error(`register-cursor-plugin: wrote ${cursorMarkerPath}`);
}

function main() {
  const installed = ensureLocalPluginCopy();
  writeCursorInstallMarker(installed);
  console.error(
    "register-cursor-plugin: ready. Reload Cursor (Developer: Reload Window). On Windows+WSL, also run: node scripts/install-cursor-local.mjs"
  );
}

main();
