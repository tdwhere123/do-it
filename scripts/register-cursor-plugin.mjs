#!/usr/bin/env node
/**
 * Register the Cursor plugin in the official local discovery path and wire the
 * user-level hooks Cursor actually loads. Filesystem changes are committed as
 * one process-level transaction so a failed registration restores prior state.
 */

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { prepareUserHooksForPlugin } from "./lib/cursor-user-hooks.mjs";
import { resolveUserHome } from "./lib/user-home.mjs";
import {
  acquireCursorHomeLocks,
  commitPreparedReplacements,
  discardPreparedReplacements,
  prepareDirectoryReplacement,
  prepareFileReplacement,
  validateCursorPlugin
} from "./lib/cursor-plugin-fs.mjs";

// Re-export FS helpers for compatibility with existing importers.
export {
  acquireCursorHomeLocks,
  commitPreparedReplacements,
  discardPreparedReplacements,
  prepareDirectoryReplacement,
  prepareFileReplacement,
  validateCursorPlugin
} from "./lib/cursor-plugin-fs.mjs";

const scriptPath = fileURLToPath(import.meta.url);
const scriptDir = path.dirname(scriptPath);
const repoRoot = path.resolve(scriptDir, "..");
const manifest = JSON.parse(fs.readFileSync(path.join(repoRoot, "manifest.json"), "utf8"));

function pathState(targetPath) {
  try {
    return fs.lstatSync(targetPath);
  } catch {
    return null;
  }
}

function isSymlink(targetPath) {
  return Boolean(pathState(targetPath)?.isSymbolicLink());
}

function injectedFailure(point, configuredPoint) {
  if (configuredPoint === point) {
    throw new Error(`injected Cursor registration failure at ${point}`);
  }
}

export function registerCursorPlugin(options = {}) {
  const home = options.home ?? resolveUserHome();
  if (!home) throw new Error("HOME / USERPROFILE is not set");

  const installRoot =
    options.installRoot ??
    process.env.DO_IT_INSTALL_ROOT ??
    process.env.CURSOR_PLUGIN_ROOT_OVERRIDE ??
    path.join(home, ".cursor", "plugins", "local", "do-it-cursor");
  const version =
    options.version ?? process.env.DO_IT_MANIFEST_VERSION ?? manifest.version;
  const builtBundle = options.builtBundle ?? path.join(repoRoot, "plugins", "do-it-cursor");
  const failAt = options.failAt ?? process.env.DO_IT_TEST_CURSOR_FAIL_AT;
  const log = options.log ?? ((message) => console.error(`register-cursor-plugin: ${message}`));
  const localPlugin = path.join(home, ".cursor", "plugins", "local", "do-it-cursor");
  const markerPath = path.join(home, ".cursor", "plugins", "do-it-cursor-install.json");
  const sameAsLocal = path.resolve(installRoot) === path.resolve(localPlugin);
  const replacements = [];
  const recoveryBackups = [];
  const releaseLocks = acquireCursorHomeLocks([home], options.lockOptions);
  let committed = false;

  try {
    if (sameAsLocal && !isSymlink(localPlugin)) {
      validateCursorPlugin(localPlugin, { requireRuntime: true, expectedVersion: version });
      log(`local plugin already at ${localPlugin}`);
    } else {
      const source = sameAsLocal
        ? builtBundle
        : fs.existsSync(path.join(installRoot, ".cursor-plugin", "plugin.json"))
          ? installRoot
          : builtBundle;
      validateCursorPlugin(source, { requireRuntime: true, expectedVersion: version });
      replacements.push(
        prepareDirectoryReplacement(source, localPlugin, {
          kind: "local-plugin",
          home,
          validate(stagedPath) {
            validateCursorPlugin(stagedPath, { requireRuntime: true, expectedVersion: version });
          }
        })
      );
    }

    const preparedHooks = prepareUserHooksForPlugin(home, path.resolve(localPlugin));
    const marker = {
      id: "do-it-cursor",
      installPath: path.resolve(localPlugin),
      version,
      registeredAt: new Date().toISOString(),
      note: "Local copy under ~/.cursor/plugins/local (Cursor rejects external symlinks)."
    };
    replacements.push(
      prepareFileReplacement(markerPath, `${JSON.stringify(marker, null, 2)}\n`, {
        kind: "marker",
        home
      }),
      prepareFileReplacement(
        preparedHooks.hooksPath,
        `${JSON.stringify(preparedHooks.value, null, 2)}\n`,
        { kind: "user-hooks", home, expectedState: preparedHooks.fileState }
      )
    );

    const { cleanupFailures } = commitPreparedReplacements(replacements, {
      afterReplace(record) {
        injectedFailure(`after-${record.kind}`, failAt);
      }
    });
    committed = true;
    for (const failure of cleanupFailures) {
      recoveryBackups.push(failure.path);
      log(`installed successfully; retained recovery backup after cleanup failed: ${failure.path}`);
    }
  } catch (error) {
    discardPreparedReplacements(replacements);
    throw error;
  } finally {
    for (const failure of releaseLocks()) {
      recoveryBackups.push(failure.path);
      log(
        committed
          ? `installed successfully; retained Cursor install lock after cleanup failed: ${failure.path}`
          : `install failed; retained Cursor install lock after cleanup failed: ${failure.path}`
      );
    }
  }

  if (!sameAsLocal || isSymlink(localPlugin)) {
    log(`copied plugin -> ${path.resolve(localPlugin)}`);
  }
  log(`wrote ${markerPath}`);
  log(`user hooks wired -> ${path.resolve(preparedHooksPath(home))}`);
  return { installPath: path.resolve(localPlugin), markerPath, recoveryBackups };
}

function preparedHooksPath(home) {
  return path.join(home, ".cursor", "hooks.json");
}

function main() {
  try {
    registerCursorPlugin();
    console.error(
      "register-cursor-plugin: ready. Reload Cursor (Developer: Reload Window).\n" +
        "Customize → Hooks should list user-level do-it entries from ~/.cursor/hooks.json.\n" +
        "On native Windows use %USERPROFILE%\\.cursor\\plugins\\local\\do-it-cursor (not /mnt/c/...).\n" +
        "On WSL with Windows-hosted Cursor, also run: node scripts/install-cursor-local.mjs"
    );
  } catch (error) {
    console.error(`register-cursor-plugin: ${error.message}`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
  main();
}
