#!/usr/bin/env node
/**
 * Install the Cursor plugin for local testing per official docs:
 *   https://cursor.com/docs/plugins
 *
 * Cursor rejects symlinks whose target is outside ~/.cursor/plugins/local/
 * (security validation). This script always copies a real directory.
 *
 * On WSL: also mirrors into the Windows user profile when detectable, because
 * a Windows-hosted Cursor reads %USERPROFILE%\.cursor, not Linux $HOME/.cursor.
 */

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

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

function windowsHomeCandidates() {
  const out = [];
  if (process.env.USERPROFILE) {
    // Git Bash / some WSL setups export USERPROFILE as C:\Users\...
    const win = process.env.USERPROFILE.replace(/^([A-Za-z]):\\/, (_, d) => `/mnt/${d.toLowerCase()}/`).replace(
      /\\/g,
      "/"
    );
    out.push(win);
  }
  // Common WSL mount of the Windows profile that owns this machine
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

function installIntoHome(home) {
  const dest = path.join(home, ".cursor", "plugins", "local", pluginName);
  copyTree(source, dest);
  const manifest = path.join(dest, ".cursor-plugin", "plugin.json");
  if (!fs.existsSync(manifest)) fail(`copy failed — missing ${manifest}`);
  console.log(`install-cursor-local: installed -> ${dest}`);
  return dest;
}

function main() {
  ensureBuilt();

  const homes = [];
  if (process.env.HOME) homes.push(process.env.HOME);
  if (process.env.CURSOR_LOCAL_HOME) homes.push(process.env.CURSOR_LOCAL_HOME);
  for (const winHome of windowsHomeCandidates()) {
    if (!homes.includes(winHome)) homes.push(winHome);
  }

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
      "Note: external symlinks into plugins/local are rejected by Cursor — this install uses a real copy."
  );
}

main();
