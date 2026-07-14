#!/usr/bin/env node
/**
 * Install the built Cursor plugin into each selected local Cursor home. Every
 * home is staged and validated before any target changes; plugin copies and
 * user hooks are then committed together with rollback on process-level errors.
 */

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { prepareUserHooksForPlugin } from "./lib/cursor-user-hooks.mjs";
import {
  acquireCursorHomeLocks,
  commitPreparedReplacements,
  discardPreparedReplacements,
  prepareDirectoryReplacement,
  prepareFileReplacement,
  validateCursorPlugin
} from "./lib/cursor-plugin-fs.mjs";
import {
  looksLikeWindowsPath,
  looksLikeMsysUnixHome,
  resolveUserHome,
  toWslMountPath
} from "./lib/user-home.mjs";

const scriptPath = fileURLToPath(import.meta.url);
const scriptDir = path.dirname(scriptPath);
const repoRoot = path.resolve(scriptDir, "..");
const source = path.join(repoRoot, "plugins", "do-it-cursor");
const pluginName = "do-it-cursor";

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
 * WSL mirrors only the caller's USERPROFILE; it never enumerates other users.
 */
export function windowsHomeCandidates(env = process.env) {
  if (process.platform === "win32" || !isWslLike()) return [];
  if (env.USERPROFILE && looksLikeWindowsPath(env.USERPROFILE)) {
    return [toWslMountPath(env.USERPROFILE)];
  }
  return [];
}

export function collectHomes(env = process.env) {
  const homes = [];
  const push = (value) => {
    if (!value) return;
    if (process.platform === "win32" && /(?:^|\/)mnt\/[a-z]\//i.test(value.replace(/\\/g, "/"))) {
      return;
    }
    if (process.platform === "win32" && looksLikeMsysUnixHome(value)) return;
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

function injectedFailure(point, configuredPoint) {
  if (configuredPoint === point) {
    throw new Error(`injected Cursor local install failure at ${point}`);
  }
}

export function installCursorLocal(options = {}) {
  const sourcePath = options.source ?? source;
  const homes = options.homes ?? collectHomes(options.env ?? process.env);
  const failAt = options.failAt ?? process.env.DO_IT_TEST_CURSOR_LOCAL_FAIL_AT;
  if (homes.length === 0) throw new Error("no HOME / Windows profile found");
  validateCursorPlugin(sourcePath, { requireRuntime: true });

  const replacements = [];
  const installed = [];
  const recoveryBackups = [];
  const releaseLocks = acquireCursorHomeLocks(homes, options.lockOptions);
  try {
    for (const [index, home] of homes.entries()) {
      const dest = path.join(home, ".cursor", "plugins", "local", pluginName);
      injectedFailure(`before-copy-${index + 1}`, failAt);
      replacements.push(
        prepareDirectoryReplacement(sourcePath, dest, {
          kind: "plugin",
          home,
          validate(stagedPath) {
            validateCursorPlugin(stagedPath, { requireRuntime: true });
          }
        })
      );
      injectedFailure(`after-stage-${index + 1}`, failAt);

      injectedFailure(`before-hook-merge-${index + 1}`, failAt);
      const preparedHooks = prepareUserHooksForPlugin(home, path.resolve(dest));
      replacements.push(
        prepareFileReplacement(
          preparedHooks.hooksPath,
          `${JSON.stringify(preparedHooks.value, null, 2)}\n`,
          { kind: "user-hooks", home, expectedState: preparedHooks.fileState }
        )
      );
      installed.push({ home, dest: path.resolve(dest), hooksPath: preparedHooks.hooksPath });
    }

    const { cleanupFailures } = commitPreparedReplacements(replacements, {
      afterReplace(record, index) {
        injectedFailure(`after-commit-${index + 1}`, failAt);
        injectedFailure(`after-${record.kind}-${homes.indexOf(record.home) + 1}`, failAt);
      }
    });
    for (const failure of cleanupFailures) recoveryBackups.push(failure.path);
  } catch (error) {
    discardPreparedReplacements(replacements);
    throw error;
  } finally {
    for (const failure of releaseLocks()) recoveryBackups.push(failure.path);
  }

  return { installed, recoveryBackups };
}

function main() {
  try {
    const { installed, recoveryBackups } = installCursorLocal();
    for (const item of installed) {
      console.log(`install-cursor-local: installed -> ${item.dest}`);
      console.log(`install-cursor-local: user hooks wired -> ${path.resolve(item.hooksPath)}`);
    }
    for (const backupPath of recoveryBackups) {
      console.error(`install-cursor-local: installed successfully; retained recovery backup: ${backupPath}`);
    }
    console.log(
      "install-cursor-local: done. Reload Cursor (Developer: Reload Window).\n" +
        "Note: external symlinks into plugins/local are rejected by Cursor — this install uses a real copy.\n" +
        "Note: user-level ~/.cursor/hooks.json was merged so Hooks UI / service can see do-it entries\n" +
        "(plugin-local hooks/hooks.json alone is not registered by current Cursor)."
    );
  } catch (error) {
    console.error(`install-cursor-local: ${error.message}`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
  main();
}
