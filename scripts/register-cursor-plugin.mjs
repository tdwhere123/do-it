#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const PLUGIN_ID = "do-it-cursor@do-it";
const LEGACY_LOCAL_ID = "do-it-cursor@local";

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
const now = new Date().toISOString();

const installedPluginsPath = path.join(home, ".claude", "plugins", "installed_plugins.json");
const settingsPath = path.join(home, ".claude", "settings.json");
const localSymlink = path.join(home, ".cursor", "plugins", "local", "do-it-cursor");

function readJson(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

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

function registerInstalledPlugins() {
  const data = readJson(installedPluginsPath, { version: 2, plugins: {} });
  if (!data.plugins || typeof data.plugins !== "object") {
    data.plugins = {};
  }

  delete data.plugins[LEGACY_LOCAL_ID];

  data.plugins[PLUGIN_ID] = [
    {
      scope: "user",
      installPath: installRoot,
      version,
      installedAt: now,
      lastUpdated: now
    }
  ];

  writeJson(installedPluginsPath, data);
  console.error(`register-cursor-plugin: registered ${PLUGIN_ID} at ${installRoot}`);
}

function enableInSettings() {
  const settings = readJson(settingsPath, {});
  settings.enabledPlugins = settings.enabledPlugins ?? {};
  settings.enabledPlugins[PLUGIN_ID] = true;
  delete settings.enabledPlugins[LEGACY_LOCAL_ID];

  settings.extraKnownMarketplaces = settings.extraKnownMarketplaces ?? {};
  settings.extraKnownMarketplaces["do-it"] = {
    source: {
      source: "github",
      repo: "tdwhere123/do-it"
    },
    autoUpdate: true
  };

  writeJson(settingsPath, settings);
  console.error(`register-cursor-plugin: enabled ${PLUGIN_ID} in ~/.claude/settings.json`);
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
  registerInstalledPlugins();
  enableInSettings();
}

main();
