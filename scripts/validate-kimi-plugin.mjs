#!/usr/bin/env node
/**
 * Validate the root kimi.plugin.json (Kimi Code plugin manifest) against the
 * documented manifest contract and this repository's layout.
 *
 * Kimi Code ships no generated bundle: the repository root IS the plugin root,
 * so this validator checks the manifest's path references, skill inventory
 * parity with scripts/skill-tiers.mjs, hook wiring, and version parity with
 * package.json. Manifest field contract:
 * https://moonshotai.github.io/kimi-code/en/customization/plugins.html
 */

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { ALL_SKILLS } from "./skill-tiers.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const errors = [];

const pluginNamePattern = /^[a-z0-9][a-z0-9_-]{0,63}$/;
// Supported manifest fields per Kimi Code plugin docs. `agents` is intentionally
// absent — Kimi Code has no custom subagent mechanism (built-in coder/explore/plan only).
const manifestAllowed = new Set([
  "name",
  "version",
  "description",
  "keywords",
  "author",
  "homepage",
  "license",
  "interface",
  "skills",
  "sessionStart",
  "skillInstructions",
  "mcpServers",
  "hooks",
  "commands"
]);
const hookEntryAllowed = new Set(["event", "matcher", "command", "timeout"]);
// Events listed in the Kimi Code hooks documentation.
const hookEvents = new Set([
  "UserPromptSubmit",
  "PreToolUse",
  "PostToolUse",
  "PostToolUseFailure",
  "Stop",
  "StopFailure",
  "PermissionRequest",
  "PermissionResult",
  "SessionStart",
  "SessionEnd",
  "SubagentStart",
  "SubagentStop",
  "Interrupt",
  "PreCompact",
  "PostCompact",
  "Notification"
]);

/** Required v1 wiring — silent inventory drift must fail validate. */
const expectedHooks = [
  { event: "UserPromptSubmit", command: "./hooks/router.sh" },
  { event: "UserPromptSubmit", command: "./hooks/grill-prompt.sh" },
  { event: "UserPromptSubmit", command: "./hooks/behavior-feedback.sh" },
  { event: "PostToolUse", matcher: "Edit|Write", command: "./hooks/write-quality-lint.sh" },
  { event: "Stop", command: "./hooks/verification-gate.sh" }
];

function readJson(rel) {
  return JSON.parse(fs.readFileSync(path.join(repoRoot, rel), "utf8"));
}

function fail(msg) {
  errors.push(msg);
}

function assertNoExtra(obj, allowed, label) {
  for (const key of Object.keys(obj ?? {})) {
    if (!allowed.has(key)) {
      fail(`${label}: unknown field "${key}"`);
    }
  }
}

/** Resolve a manifest "./" path inside the repo and require it to exist. */
function resolvePluginPath(value, label) {
  if (typeof value !== "string" || !value.startsWith("./")) {
    fail(`${label}: path must be a "./"-relative string, got ${JSON.stringify(value)}`);
    return null;
  }
  const resolved = path.resolve(repoRoot, value);
  if (!resolved.startsWith(repoRoot + path.sep)) {
    fail(`${label}: path escapes plugin root: ${value}`);
    return null;
  }
  if (!fs.existsSync(resolved)) {
    fail(`${label}: path missing: ${value}`);
    return null;
  }
  return resolved;
}

function main() {
  const manifest = readJson("kimi.plugin.json");
  const pkg = readJson("package.json");

  assertNoExtra(manifest, manifestAllowed, "kimi.plugin.json");
  if ("agents" in manifest) {
    fail("kimi.plugin.json: `agents` is not a supported Kimi Code field (no custom subagents)");
  }
  if (!pluginNamePattern.test(manifest.name ?? "")) {
    fail(`name must match ${pluginNamePattern} (got ${JSON.stringify(manifest.name)})`);
  }
  if (manifest.version !== pkg.version) {
    fail(`version ${manifest.version} does not match package.json ${pkg.version}`);
  }
  if (!manifest.interface?.displayName) {
    fail("interface.displayName is required");
  }

  // skills: one or more "./" dirs; every immediate child with SKILL.md registers.
  const skillsPaths = Array.isArray(manifest.skills) ? manifest.skills : [manifest.skills];
  const foundSkills = new Set();
  for (const p of skillsPaths) {
    const dir = resolvePluginPath(p, "skills");
    if (!dir) continue;
    if (!fs.statSync(dir).isDirectory()) {
      fail(`skills: ${p} is not a directory`);
      continue;
    }
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory() && fs.existsSync(path.join(dir, entry.name, "SKILL.md"))) {
        foundSkills.add(entry.name);
      }
    }
  }
  const missing = ALL_SKILLS.filter((s) => !foundSkills.has(s));
  const unexpected = [...foundSkills].filter((s) => !ALL_SKILLS.includes(s));
  if (missing.length) fail(`skills: missing skill dirs: ${missing.join(", ")}`);
  if (unexpected.length) fail(`skills: dirs not in skill-tiers.mjs ALL_SKILLS: ${unexpected.join(", ")}`);

  // commands: dir scanned recursively for .md files.
  const commandPaths = Array.isArray(manifest.commands) ? manifest.commands : [manifest.commands];
  let commandCount = 0;
  for (const p of commandPaths) {
    const target = resolvePluginPath(p, "commands");
    if (!target) continue;
    const walk = (d) => {
      for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
        const full = path.join(d, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (entry.name.endsWith(".md")) commandCount += 1;
      }
    };
    if (fs.statSync(target).isDirectory()) walk(target);
    else if (target.endsWith(".md")) commandCount += 1;
  }
  if (commandCount === 0) fail("commands: no .md command files found");

  // hooks: strict entry shape, known events, script paths exist (+ executable on POSIX).
  if (!Array.isArray(manifest.hooks) || manifest.hooks.length === 0) {
    fail("hooks: expected a non-empty array");
  }
  const hookKeys = (manifest.hooks ?? []).map(
    (h) => `${h.event}\0${h.matcher ?? ""}\0${h.command}`
  );
  const expectedKeys = expectedHooks.map(
    (h) => `${h.event}\0${h.matcher ?? ""}\0${h.command}`
  );
  if (hookKeys.length !== expectedKeys.length || hookKeys.some((k, i) => k !== expectedKeys[i])) {
    fail(
      "hooks: inventory must be exactly " +
        expectedHooks
          .map((h) => `${h.event}${h.matcher ? `(${h.matcher})` : ""}→${h.command}`)
          .join(", ")
    );
  }
  for (const [i, hook] of (manifest.hooks ?? []).entries()) {
    const label = `hooks[${i}]`;
    assertNoExtra(hook, hookEntryAllowed, label);
    if (!hookEvents.has(hook.event)) {
      fail(`${label}: unknown event ${JSON.stringify(hook.event)}`);
    }
    const script = resolvePluginPath(hook.command, `${label}.command`);
    if (script && process.platform !== "win32") {
      try {
        fs.accessSync(script, fs.constants.X_OK);
      } catch {
        fail(`${label}.command: not executable: ${hook.command}`);
      }
    }
    if (hook.timeout !== undefined && (!Number.isInteger(hook.timeout) || hook.timeout < 1 || hook.timeout > 600)) {
      fail(`${label}: timeout must be an integer 1-600`);
    }
  }

  if (errors.length) {
    console.error("validate-kimi-plugin: failed");
    for (const e of errors) console.error(`- ${e}`);
    process.exit(1);
  }
  console.log(`validate-kimi-plugin: manifest OK (${foundSkills.size} skills, ${commandCount} commands, ${manifest.hooks.length} hooks)`);
}

main();
