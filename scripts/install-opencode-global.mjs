#!/usr/bin/env node
/**
 * Install the built OpenCode plugin into OpenCode's global config home.
 *
 * OpenCode's supported global shapes are:
 * - npm package name in ~/.config/opencode/opencode.json `"plugin"` (Bun installs
 *   into its cache), or
 * - a package under the config home, referenced by name via package.json.
 *
 * Pointing `"plugin"` at a do-it git checkout is a **dev** convenience only —
 * it couples the live host to a mutable worktree. This installer vendors a
 * built copy under ~/.config/opencode/vendor/do-it-opencode and registers
 * `@tdwhere/do-it-opencode` (file: dependency) instead.
 */

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
const scriptDir = path.dirname(scriptPath);
const repoRoot = path.resolve(scriptDir, "..");
const source = path.join(repoRoot, "plugins", "do-it-opencode");
const packageName = "@tdwhere/do-it-opencode";

export function resolveOpenCodeConfigHome(env = process.env) {
  if (env.OPENCODE_CONFIG_DIR) return path.resolve(env.OPENCODE_CONFIG_DIR);
  if (env.XDG_CONFIG_HOME) return path.join(path.resolve(env.XDG_CONFIG_HOME), "opencode");
  const home = env.HOME || env.USERPROFILE;
  if (!home) throw new Error("HOME / USERPROFILE is not set");
  return path.join(path.resolve(home), ".config", "opencode");
}

export function validateOpenCodePlugin(pluginPath) {
  const root = path.resolve(pluginPath);
  const required = [
    "package.json",
    "dist/index.js",
    "hooks/router.sh",
    "hooks/verification-gate.sh",
    "skills/do-it-router/SKILL.md"
  ];
  for (const relative of required) {
    const full = path.join(root, relative);
    if (!fs.existsSync(full) || fs.lstatSync(full).isSymbolicLink()) {
      throw new Error(`OpenCode plugin missing real ${relative} under ${root}`);
    }
  }
  const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
  if (pkg.name !== packageName) {
    throw new Error(`expected package name ${packageName}, got ${pkg.name ?? "<missing>"}`);
  }
  return pkg;
}

function copyPluginTree(from, to) {
  fs.rmSync(to, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.cpSync(from, to, {
    recursive: true,
    filter: (src) => {
      const base = path.basename(src);
      if (base === "node_modules" || base === "src" || base === "tsconfig.json") return false;
      if (base.endsWith(".tgz")) return false;
      return true;
    }
  });
}

function runInstall(cwd) {
  const bun = spawnSync("bun", ["install"], { cwd, encoding: "utf8" });
  if (bun.status === 0) return { tool: "bun", result: bun };
  const npm = spawnSync("npm", ["install", "--omit=dev"], {
    cwd,
    encoding: "utf8",
    env: process.env
  });
  if (npm.status !== 0) {
    throw new Error(
      `dependency install failed in ${cwd}: ${(npm.stderr || npm.stdout || bun.stderr || "").trim()}`
    );
  }
  return { tool: "npm", result: npm };
}

export function rewritePluginEntries(plugins, packageId = packageName) {
  const list = Array.isArray(plugins) ? plugins : [];
  const kept = list.filter((entry) => {
    if (typeof entry !== "string") return true;
    if (entry === packageId) return false;
    if (entry.includes(`${path.sep}do-it${path.sep}plugins${path.sep}do-it-opencode`)) return false;
    if (entry.includes("/do-it/plugins/do-it-opencode")) return false;
    if (/do-it-opencode.*\.tgz$/i.test(entry)) return false;
    if (/[/\\]vibe[/\\]do-it[/\\]/i.test(entry)) return false;
    return true;
  });
  kept.push(packageId);
  return kept;
}

export function installOpenCodeGlobal({
  configHome = resolveOpenCodeConfigHome(),
  sourcePath = source,
  log = console.error
} = {}) {
  const pkg = validateOpenCodePlugin(sourcePath);
  const vendor = path.join(configHome, "vendor", "do-it-opencode");
  const configPath = path.join(configHome, "opencode.json");
  const packageJsonPath = path.join(configHome, "package.json");

  log(`install-opencode-global: vendoring ${pkg.version} -> ${vendor}`);
  copyPluginTree(sourcePath, vendor);
  runInstall(vendor);

  const packageJson = fs.existsSync(packageJsonPath)
    ? JSON.parse(fs.readFileSync(packageJsonPath, "utf8"))
    : {};
  packageJson.dependencies = {
    ...(packageJson.dependencies || {}),
    [packageName]: "file:./vendor/do-it-opencode"
  };
  fs.writeFileSync(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`);
  runInstall(configHome);

  if (!fs.existsSync(configPath)) {
    const starter = {
      $schema: "https://opencode.ai/config.json",
      plugin: [packageName],
      permission: { skill: "allow" }
    };
    fs.writeFileSync(configPath, `${JSON.stringify(starter, null, 2)}\n`);
  } else {
    const backup = `${configPath}.bak-pre-do-it-opencode-${Date.now()}`;
    fs.copyFileSync(configPath, backup);
    log(`install-opencode-global: config backup -> ${backup}`);
    const cfg = JSON.parse(fs.readFileSync(configPath, "utf8"));
    cfg.plugin = rewritePluginEntries(cfg.plugin);
    cfg.permission = cfg.permission || {};
    if (!cfg.permission.skill) cfg.permission.skill = "allow";
    fs.writeFileSync(configPath, `${JSON.stringify(cfg, null, 2)}\n`);
  }

  const linked = path.join(configHome, "node_modules", ...packageName.split("/"));
  if (!fs.existsSync(linked)) {
    throw new Error(`expected ${linked} after install`);
  }

  log(`install-opencode-global: registered ${packageName} in ${configPath}`);
  log("install-opencode-global: done. Restart OpenCode to load the plugin.");
  return { configHome, vendor, configPath, version: pkg.version };
}

function isDirectRun() {
  const entry = process.argv[1] ? path.resolve(process.argv[1]) : "";
  return entry === scriptPath;
}

if (isDirectRun()) {
  try {
    installOpenCodeGlobal();
  } catch (error) {
    console.error(`install-opencode-global: ${error.message}`);
    process.exitCode = 1;
  }
}
