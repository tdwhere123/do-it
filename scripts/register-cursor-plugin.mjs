#!/usr/bin/env node
/**
 * Post-install helper for the Cursor target.
 *
 * Official local discovery path is ~/.cursor/plugins/local/<name>/ with a real
 * directory (Cursor rejects external symlinks). This script mirrors the built
 * bundle there and does **not** write Claude Code registries.
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
  // Replace symlink or stale tree with a real copy (Cursor rejects external symlinks).
  fs.rmSync(to, { recursive: true, force: true });
  const rsync = spawnSync("rsync", ["-a", "--delete", `${from}/`, `${to}/`], { encoding: "utf8" });
  if (rsync.status !== 0) {
    fs.cpSync(from, to, { recursive: true });
  }
}

function ensureLocalPluginCopy() {
  const source =
    fs.existsSync(path.join(installRoot, ".cursor-plugin", "plugin.json")) && installRoot !== localPlugin
      ? installRoot
      : builtBundle;

  if (!fs.existsSync(path.join(source, ".cursor-plugin", "plugin.json"))) {
    console.error(
      `register-cursor-plugin: missing plugin.json under ${source}; run npm run build:cursor-plugin / do-it install --target=cursor first`
    );
    process.exit(1);
  }

  if (path.resolve(source) === path.resolve(localPlugin)) {
    console.error(`register-cursor-plugin: local plugin already at ${localPlugin}`);
    return localPlugin;
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
