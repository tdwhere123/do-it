#!/usr/bin/env node
/**
 * Install the Cursor plugin for local testing per official docs:
 *   https://cursor.com/docs/plugins
 *
 * Cursor rejects symlinks whose target is outside ~/.cursor/plugins/local/
 * (security validation). This script always copies a real directory.
 *
 * Platforms:
 * - Native Windows (win32): install into %USERPROFILE%\.cursor\... only.
 *   Never rewrite USERPROFILE into /mnt/c/... (that path is meaningless on
 *   win32 and resolves under the current drive, e.g. D:\mnt\c\Users\...).
 * - WSL / Linux with /mnt/c/Users: also mirror into detected Windows profiles
 *   because a Windows-hosted Cursor reads %USERPROFILE%\.cursor, not Linux
 *   $HOME/.cursor.
 *
 * After the plugin copy, merge do-it hooks into ~/.cursor/hooks.json so the
 * Hooks service registers them (plugin-local hooks/hooks.json is not loaded
 * by current Cursor Hooks UI / service).
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { syncUserHooksForPlugin } from "./lib/cursor-user-hooks.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const source = path.join(repoRoot, "plugins", "do-it-cursor");
const pluginName = "do-it-cursor";

function fail(msg) {
  console.error(`install-cursor-local: ${msg}`);
  process.exit(1);
}

function ensureBuilt() {
  if (!fs.existsSync(path.join(source, ".cursor-plugin", "plugin.json"))) {
    fail(`missing ${path.relative(repoRoot, source)} — run npm run build:cursor-plugin first`);
  }
}

function copyTree(from, to) {
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.rmSync(to, { recursive: true, force: true });
  // Prefer rsync when available (preserves modes); fall back to fs.cpSync.
  const rsync = spawnSync(
    "rsync",
    ["-a", "--delete", `${from}/`, `${to}/`],
    { encoding: "utf8" }
  );
  if (rsync.status === 0) return;
  fs.cpSync(from, to, { recursive: true });
}

function looksLikeWindowsPath(value) {
  return typeof value === "string" && /^[A-Za-z]:[\\/]/.test(value);
}

function toWslMountPath(winPath) {
  return winPath
    .replace(/^([A-Za-z]):[\\/]/, (_, d) => `/mnt/${d.toLowerCase()}/`)
    .replace(/\\/g, "/");
}

function isWslLike() {
  if (process.env.WSL_DISTRO_NAME) return true;
  if (process.platform !== "linux") return false;
  try {
    return fs.existsSync("/mnt/c/Users");
  } catch {
    return false;
  }
}

/**
 * Homes that a Windows-hosted Cursor would read.
 * - win32: USERPROFILE / os.homedir() only (never /mnt/...)
 * - WSL-like Linux: convert USERPROFILE + scan /mnt/c/Users for .cursor dirs
 * - plain Linux: none (caller still uses $HOME)
 */
function windowsHomeCandidates() {
  const out = [];

  if (process.platform === "win32") {
    const home = process.env.USERPROFILE || os.homedir();
    if (home) out.push(path.resolve(home));
    return [...new Set(out)];
  }

  if (!isWslLike()) {
    return out;
  }

  if (process.env.USERPROFILE && looksLikeWindowsPath(process.env.USERPROFILE)) {
    out.push(toWslMountPath(process.env.USERPROFILE));
  }

  try {
    const usersRoot = "/mnt/c/Users";
    if (fs.existsSync(usersRoot)) {
      for (const name of fs.readdirSync(usersRoot)) {
        if (name === "Public" || name === "Default" || name === "Default User" || name === "All Users") {
          continue;
        }
        const cursor = path.join(usersRoot, name, ".cursor");
        if (fs.existsSync(cursor)) out.push(path.join(usersRoot, name));
      }
    }
  } catch {
    // ignore
  }

  return [...new Set(out)];
}

function verifyPluginInstall(dest) {
  const manifest = path.join(dest, ".cursor-plugin", "plugin.json");
  if (!fs.existsSync(manifest)) {
    fail(`post-install check failed — missing ${path.resolve(manifest)}`);
  }
  const hooksJson = path.join(dest, "hooks", "hooks.json");
  if (!fs.existsSync(hooksJson)) {
    fail(`post-install check failed — missing ${path.resolve(hooksJson)}`);
  }
  return path.resolve(dest);
}

function installIntoHome(home) {
  const dest = path.join(home, ".cursor", "plugins", "local", pluginName);
  copyTree(source, dest);
  const absoluteDest = verifyPluginInstall(dest);
  console.log(`install-cursor-local: installed -> ${absoluteDest}`);

  try {
    const hooksPath = syncUserHooksForPlugin(home, absoluteDest);
    console.log(`install-cursor-local: user hooks wired -> ${path.resolve(hooksPath)}`);
  } catch (err) {
    fail(`failed to merge user hooks for ${home}: ${err.message}`);
  }

  return absoluteDest;
}

function collectHomes() {
  const homes = [];
  const push = (value) => {
    if (!value) return;
    // On win32 never accept a bogus /mnt/... candidate from a stale env.
    if (process.platform === "win32" && value.replace(/\\/g, "/").includes("/mnt/")) {
      return;
    }
    const resolved = path.resolve(value);
    if (!homes.includes(resolved)) homes.push(resolved);
  };

  if (process.platform === "win32") {
    push(process.env.USERPROFILE || os.homedir());
    // Git Bash often sets HOME to /c/Users/... which Node can resolve; keep it
    // only when it is a real directory distinct from USERPROFILE mapping.
    if (process.env.HOME) push(process.env.HOME);
  } else {
    if (process.env.HOME) push(process.env.HOME);
  }

  if (process.env.CURSOR_LOCAL_HOME) push(process.env.CURSOR_LOCAL_HOME);
  for (const winHome of windowsHomeCandidates()) push(winHome);
  return homes;
}

function main() {
  ensureBuilt();

  const homes = collectHomes();
  if (homes.length === 0) fail("no HOME / Windows profile found");

  const installed = [];
  for (const home of homes) {
    try {
      installed.push(installIntoHome(home));
    } catch (err) {
      console.error(`install-cursor-local: skip ${home}: ${err.message}`);
    }
  }

  if (installed.length === 0) fail("no install targets succeeded");

  console.log(
    "install-cursor-local: done. Reload Cursor (Developer: Reload Window).\n" +
      "Note: external symlinks into plugins/local are rejected by Cursor — this install uses a real copy.\n" +
      "Note: user-level ~/.cursor/hooks.json was merged so Hooks UI / service can see do-it entries\n" +
      "(plugin-local hooks/hooks.json alone is not registered by current Cursor)."
  );
}

main();
