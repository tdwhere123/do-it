#!/usr/bin/env node
/**
 * Install the built Antigravity plugin (`do-it-agy`) into local
 * `<AGY_CONFIG_DIR || ~/.gemini/config>/plugins/do-it-agy`.
 * Validates with `agy plugin validate --strict --json` when `agy` is available,
 * swaps atomically, preserves `.do-it-data`, and never touches `config.json`.
 */

import fs from "node:fs";
import crypto from "node:crypto";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { buildAgyPlugin } from "./build-agy-plugin.mjs";
import { resolveUserHome } from "./lib/user-home.mjs";

const defaultRepoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function findExecutable(binaryName, env = process.env) {
  const pathEnv = env.PATH || "";
  const extensions = process.platform === "win32" ? [".exe", ".cmd", ".bat", ""] : [""];
  for (const dir of pathEnv.split(path.delimiter)) {
    if (!dir) continue;
    for (const ext of extensions) {
      const candidate = path.join(dir, `${binaryName}${ext}`);
      try {
        if (fs.statSync(candidate).isFile()) {
          if (process.platform !== "win32") fs.accessSync(candidate, fs.constants.X_OK);
          return candidate;
        }
      } catch {
        // try next PATH entry
      }
    }
  }
  return null;
}

function chmodHookScripts(rootDir) {
  const hooksDir = path.join(rootDir, "hooks");
  if (!fs.existsSync(hooksDir)) return;
  for (const name of fs.readdirSync(hooksDir)) {
    if (!name.endsWith(".sh")) continue;
    try {
      fs.chmodSync(path.join(hooksDir, name), 0o755);
    } catch {
      // best-effort on platforms without POSIX modes
    }
  }
}

export function resolveAgyConfigDir({ agyConfigDir, env = process.env } = {}) {
  if (agyConfigDir) return path.resolve(agyConfigDir);
  if (env.AGY_CONFIG_DIR) return path.resolve(env.AGY_CONFIG_DIR);
  return path.join(resolveUserHome(env), ".gemini", "config");
}

export function installAgyLocal(options = {}) {
  const env = options.env ?? process.env;
  const repoRoot = options.repoRoot ? path.resolve(options.repoRoot) : defaultRepoRoot;
  const sourceDir = options.pluginSourceDir
    ? path.resolve(options.pluginSourceDir)
    : path.join(repoRoot, "plugins", "do-it-agy");
  const configDir = resolveAgyConfigDir({ agyConfigDir: options.agyConfigDir, env });
  const pluginsRoot = path.join(configDir, "plugins");
  const targetDir = path.join(pluginsRoot, "do-it-agy");
  const manifestFile = path.join(sourceDir, "plugin.json");

  if (!fs.existsSync(manifestFile)) {
    if (!options.pluginSourceDir && fs.existsSync(path.join(repoRoot, "manifest.json"))) {
      buildAgyPlugin(repoRoot);
    } else {
      throw new Error(`do-it-agy plugin bundle missing at ${sourceDir}`);
    }
  }

  const skipValidate = options.skipValidate ?? env.DO_IT_SKIP_AGY_VALIDATE === "1";
  let validatedByAgy = false;
  if (!skipValidate) {
    const agyBin = findExecutable("agy", env);
    if (agyBin) {
      const check = spawnSync(
        agyBin,
        ["plugin", "validate", sourceDir, "--strict", "--json"],
        { env, encoding: "utf8" }
      );
      if (check.error) {
        throw new Error(`agy plugin validate failed to run: ${check.error.message}`);
      }
      if (check.status !== 0) {
        const detail = `${check.stdout || ""}${check.stderr || ""}`.trim();
        throw new Error(`agy plugin validate --strict failed (exit ${check.status}): ${detail}`);
      }
      validatedByAgy = true;
    }
  }

  fs.mkdirSync(pluginsRoot, { recursive: true });
  const suffix = `${process.pid}-${crypto.randomUUID()}`;
  const stageDir = path.join(pluginsRoot, `.do-it-agy.stage-${suffix}`);
  const backupDir = path.join(pluginsRoot, `.do-it-agy.backup-${suffix}`);

  try {
    fs.cpSync(sourceDir, stageDir, { recursive: true });
    chmodHookScripts(stageDir);

    const existingDataDir = path.join(targetDir, ".do-it-data");
    if (fs.existsSync(existingDataDir)) {
      fs.cpSync(existingDataDir, path.join(stageDir, ".do-it-data"), { recursive: true });
    }

    const hadExisting = fs.existsSync(targetDir);
    if (hadExisting) fs.renameSync(targetDir, backupDir);
    try {
      fs.renameSync(stageDir, targetDir);
    } catch (error) {
      if (hadExisting && fs.existsSync(backupDir) && !fs.existsSync(targetDir)) {
        fs.renameSync(backupDir, targetDir);
      }
      throw error;
    }
    if (hadExisting) fs.rmSync(backupDir, { recursive: true, force: true });
  } finally {
    fs.rmSync(stageDir, { recursive: true, force: true });
    fs.rmSync(backupDir, { recursive: true, force: true });
  }

  return { sourceDir, targetDir, configDir, validatedByAgy };
}

const isDirectRun =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectRun) {
  const { targetDir, validatedByAgy } = installAgyLocal();
  const suffix = validatedByAgy ? " (validated with agy --strict)" : "";
  console.log(`install-agy-local: installed -> ${targetDir}${suffix}`);
}
