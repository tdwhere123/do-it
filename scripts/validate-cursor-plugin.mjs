#!/usr/bin/env node
/**
 * Validate Cursor marketplace + plugin manifests against Cursor's published
 * JSON Schema (https://cursor.com/schemas/cursor-plugin/*), matching
 * cursor/plugins and cursor/plugin-template layout rules.
 */

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const errors = [];

const pluginNamePattern = /^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$/;
const marketplaceAllowed = new Set(["name", "owner", "metadata", "plugins"]);
const pluginEntryAllowed = new Set(["name", "source", "description"]);
// From https://cursor.com/schemas/cursor-plugin/plugin.json (additionalProperties: false)
const pluginManifestAllowed = new Set([
  "name",
  "displayName",
  "description",
  "version",
  "author",
  "publisher",
  "homepage",
  "repository",
  "license",
  "logo",
  "keywords",
  "category",
  "tags",
  "commands",
  "agents",
  "skills",
  "rules",
  "hooks",
  "mcpServers"
]);

function readJson(rel) {
  return JSON.parse(fs.readFileSync(path.join(repoRoot, rel), "utf8"));
}

function fail(msg) {
  errors.push(msg);
}

function assertNoExtra(obj, allowed, label) {
  for (const key of Object.keys(obj ?? {})) {
    if (!allowed.has(key)) {
      fail(`${label}: unknown field "${key}" (Cursor schema rejects additionalProperties)`);
    }
  }
}

function main() {
  const marketplace = readJson(".cursor-plugin/marketplace.json");
  assertNoExtra(marketplace, marketplaceAllowed, ".cursor-plugin/marketplace.json");

  if (typeof marketplace.name !== "string" || marketplace.name.length < 1) {
    fail('marketplace "name" is required');
  }
  if (!marketplace.owner?.name) {
    fail('marketplace "owner.name" is required');
  }
  if (!Array.isArray(marketplace.plugins) || marketplace.plugins.length === 0) {
    fail('marketplace "plugins" must be a non-empty array');
  }

  for (const [i, entry] of (marketplace.plugins ?? []).entries()) {
    const label = `marketplace.plugins[${i}]`;
    assertNoExtra(entry, pluginEntryAllowed, label);
    if (!pluginNamePattern.test(entry.name ?? "")) {
      fail(`${label}.name must match kebab-case plugin id pattern`);
    }
    if (typeof entry.source !== "string" || !entry.source) {
      fail(`${label}.source is required`);
    }
    const pluginDir = path.join(repoRoot, entry.source);
    const manifestPath = path.join(pluginDir, ".cursor-plugin", "plugin.json");
    if (!fs.existsSync(manifestPath)) {
      fail(`${label}: missing ${path.relative(repoRoot, manifestPath)}`);
      continue;
    }
    const plugin = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    assertNoExtra(plugin, pluginManifestAllowed, `${entry.name} plugin.json`);
    if (plugin.name !== entry.name) {
      fail(`${entry.name}: marketplace name !== plugin.json name (${plugin.name})`);
    }
    if (!pluginNamePattern.test(plugin.name ?? "")) {
      fail(`${entry.name}: plugin.json name must be kebab-case`);
    }
    for (const field of ["skills", "agents", "hooks", "logo", "rules", "commands"]) {
      const value = plugin[field];
      if (typeof value !== "string") continue;
      if (value.startsWith("http://") || value.startsWith("https://")) continue;
      const resolved = path.resolve(pluginDir, value);
      if (!fs.existsSync(resolved)) {
        fail(`${entry.name}: ${field} path missing: ${value}`);
      }
    }
  }

  if (errors.length) {
    console.error("validate-cursor-plugin: failed");
    for (const e of errors) console.error(`- ${e}`);
    process.exit(1);
  }
  console.log("validate-cursor-plugin: marketplace + plugin.json match Cursor schema");
}

main();
