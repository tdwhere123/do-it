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
 * - WSL / Linux with /mnt/c/Users: mirror the caller's Windows USERPROFILE
 *   when set. Never scan other /mnt/c/Users profiles (shared-host safety).
 *   Use CURSOR_LOCAL_HOME for an explicit extra install root.
 *
 * After the plugin copy, merge do-it hooks into ~/.cursor/hooks.json so the
 * Hooks service registers them (plugin-local hooks/hooks.json is not loaded
 * by current Cursor Hooks UI / service).
 */

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { syncUserHooksForPlugin } from "./lib/cursor-user-hooks.mjs";
import {
  looksLikeWindowsPath,
  looksLikeMsysUnixHome,
  resolveUserHome,
  toWslMountPath
} from "./lib/user-home.mjs";

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
  const rsync = spawnSync(
    "rsync",
    ["-a", "--delete", `${from}/`, `${to}/`],
    { encoding: "utf8" }
  );
  if (rsync.status === 0) return;
  fs.cpSync(from, to, { recursive: true });
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
 * - win32: empty here (collectHomes uses resolveUserHome)
 * - WSL-like: USERPROFILE mount when set; otherwise none (no multi-user scan)
 * - plain Linux: none
 */
export function windowsHomeCandidates(env = process.env) {
  if (process.platform === "win32") {
    return [];
  }

  if (!isWslLike()) {
    return [];
  }

  if (env.USERPROFILE && looksLikeWindowsPath(env.USERPROFILE)) {
    return [toWslMountPath(env.USERPROFILE)];
  }

  return [];
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

export function collectHomes(env = process.env) {
  const homes = [];
  const push = (value) => {
    if (!value) return;
    // Reject WSL mount strings on win32 (not a prefix match — require /mnt/<drive>/).
    if (process.platform === "win32" && /(?:^|\/)mnt\/[a-z]\//i.test(value.replace(/\\/g, "/"))) {
      return;
    }
    if (process.platform === "win32" && looksLikeMsysUnixHome(value)) {
      return;
    }
    const resolved = path.resolve(value);
    if (!homes.includes(resolved)) homes.push(resolved);
  };

  if (process.platform === "win32") {
    push(resolveUserHome(env));
    if (env.HOME && looksLikeWindowsPath(env.HOME)) push(env.HOME);
  } else if (env.HOME) {
    push(env.HOME);
  }

  if (env.CURSOR_LOCAL_HOME) push(env.CURSOR_LOCAL_HOME);
  for (const winHome of windowsHomeCandidates(env)) push(winHome);
  return homes;
}

function main() {
  ensureBuilt();

  const homes = collectHomes();
  if (homes.length === 0) fail("no HOME / Windows profile found");

  const installed = [];
  const failures = [];
  for (const home of homes) {
    try {
      installed.push(installIntoHome(home));
    } catch (err) {
      const message = err?.message || String(err);
      console.error(`install-cursor-local: failed ${home}: ${message}`);
      failures.push(`${home}: ${message}`);
    }
  }

  if (installed.length === 0) fail("no install targets succeeded");
  if (failures.length > 0) {
    fail(
      `partial install failure (${failures.length} of ${homes.length} homes): ${failures.join("; ")}`
    );
  }

  console.log(
    "install-cursor-local: done. Reload Cursor (Developer: Reload Window).\n" +
      "Note: external symlinks into plugins/local are rejected by Cursor — this install uses a real copy.\n" +
      "Note: user-level ~/.cursor/hooks.json was merged so Hooks UI / service can see do-it entries\n" +
      "(plugin-local hooks/hooks.json alone is not registered by current Cursor)."
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
