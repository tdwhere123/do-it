#!/usr/bin/env node
/**
 * Post-install helper for the Cursor target.
 *
 * Prefers the Cursor plugin install root under ~/.cursor. Does **not** write
 * Claude Code registries (~/.claude/plugins, ~/.claude/settings.json) — that
 * dual-host pollution caused wrong-skill discovery when Cursor scanned Claude
 * paths. Marketplace install remains the primary path; this script only cleans
 * a legacy local symlink and confirms the plugin bundle is present.
 */

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

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
  path.join(home, ".cursor", "plugins", "do-it-cursor");

const version = process.env.DO_IT_MANIFEST_VERSION ?? manifest.version;
const localSymlink = path.join(home, ".cursor", "plugins", "local", "do-it-cursor");
const cursorMarkerPath = path.join(home, ".cursor", "plugins", "do-it-cursor-install.json");

function removeLocalDevSymlink() {
  try {
    const stat = fs.lstatSync(localSymlink);
    if (stat.isSymbolicLink()) {
      fs.unlinkSync(localSymlink);
      console.error(`register-cursor-plugin: removed dev symlink ${localSymlink}`);
    }
  } catch {
    // absent or not a symlink — ok
  }
}

function writeCursorInstallMarker() {
  fs.mkdirSync(path.dirname(cursorMarkerPath), { recursive: true });
  const payload = {
    id: "do-it-cursor",
    installPath: installRoot,
    version,
    registeredAt: new Date().toISOString(),
    note: "CLI setup marker only. Prefer Cursor marketplace plugin install."
  };
  fs.writeFileSync(cursorMarkerPath, `${JSON.stringify(payload, null, 2)}\n`);
  console.error(`register-cursor-plugin: wrote ${cursorMarkerPath}`);
}

function main() {
  if (!fs.existsSync(path.join(installRoot, ".cursor-plugin", "plugin.json"))) {
    console.error(
      `register-cursor-plugin: missing ${path.join(installRoot, ".cursor-plugin", "plugin.json")}; ` +
        "run do-it install --target=cursor first"
    );
    process.exit(1);
  }

  removeLocalDevSymlink();
  writeCursorInstallMarker();
  console.error(
    "register-cursor-plugin: Cursor target ready (no ~/.claude writes). Prefer marketplace install when available."
  );
}

main();
