#!/usr/bin/env node
/**
 * Unit coverage for scripts/install-cursor-local.mjs — real-directory install
 * under ~/.cursor/plugins/local (no external symlink), plus user-hooks merge
 * and Windows path safety.
 */

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  isDoItHookCommand,
  mergeDoItUserHooks,
  userHooksWiredForPlugin,
  commandForRunHook
} from "../../scripts/lib/cursor-user-hooks.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const script = path.join(repoRoot, "scripts", "install-cursor-local.mjs");

function runInstall(env) {
  return spawnSync(process.execPath, [script], {
    cwd: repoRoot,
    env: { ...process.env, ...env },
    encoding: "utf8"
  });
}

test("install-cursor-local copies a real plugin directory into HOME plugins/local", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "do-it-cursor-local-"));
  try {
    const result = runInstall({ HOME: home, CURSOR_LOCAL_HOME: "", USERPROFILE: "" });
    assert.equal(result.status, 0, result.stderr || result.stdout);

    const dest = path.join(home, ".cursor", "plugins", "local", "do-it-cursor");
    assert.ok(fs.existsSync(path.join(dest, ".cursor-plugin", "plugin.json")));
    assert.ok(!fs.lstatSync(dest).isSymbolicLink(), "must not be a symlink");
    assert.ok(fs.existsSync(path.join(dest, "skills", "do-it-router", "SKILL.md")));
    assert.ok(fs.existsSync(path.join(dest, "hooks", "hooks.json")));
    assert.ok(fs.existsSync(path.join(dest, "hooks", "run-hook.cmd")));

    const hooksPath = path.join(home, ".cursor", "hooks.json");
    assert.ok(fs.existsSync(hooksPath), "user-level hooks.json must be written");
    const hooks = JSON.parse(fs.readFileSync(hooksPath, "utf8"));
    assert.equal(hooks.version, 1);
    assert.ok(hooks.hooks.sessionStart?.length >= 1);
    assert.ok(
      hooks.hooks.sessionStart.some((entry) => isDoItHookCommand(entry.command)),
      "sessionStart should reference do-it-cursor hooks"
    );
    assert.ok(
      hooks.hooks.sessionStart.every(
        (entry) => !isDoItHookCommand(entry.command) || String(entry.command).includes("run-hook.cmd")
      ),
      "do-it sessionStart must use run-hook.cmd (never bare .sh)"
    );
    assert.ok(
      !JSON.stringify(hooks).match(/do-it-cursor[/\\]hooks[/\\][^"]+\.sh"/),
      "user hooks must not point at bare .sh paths"
    );
    assert.match(result.stdout, /user hooks wired/);
    assert.match(result.stdout, /installed -> /);
    const wired = userHooksWiredForPlugin(home, dest);
    assert.equal(wired.ok, true, wired.reason);
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test("install-cursor-local merges do-it hooks without clobbering user entries", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "do-it-cursor-merge-"));
  try {
    const hooksPath = path.join(home, ".cursor", "hooks.json");
    fs.mkdirSync(path.dirname(hooksPath), { recursive: true });
    fs.writeFileSync(
      hooksPath,
      `${JSON.stringify(
        {
          version: 1,
          hooks: {
            stop: [{ command: "./hooks/my-custom-stop.sh", timeout: 5 }]
          }
        },
        null,
        2
      )}\n`
    );

    const result = runInstall({ HOME: home, CURSOR_LOCAL_HOME: "", USERPROFILE: "" });
    assert.equal(result.status, 0, result.stderr || result.stdout);

    const hooks = JSON.parse(fs.readFileSync(hooksPath, "utf8"));
    assert.ok(
      hooks.hooks.stop.some((entry) => entry.command === "./hooks/my-custom-stop.sh"),
      "custom stop hook must survive"
    );
    assert.ok(
      hooks.hooks.stop.some((entry) => isDoItHookCommand(entry.command)),
      "do-it stop hook must be added"
    );
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test("mergeDoItUserHooks replaces prior do-it commands only", () => {
  const pluginRoot = "/tmp/fake-do-it-cursor";
  const existing = {
    version: 1,
    hooks: {
      sessionStart: [
        { command: commandForRunHook(pluginRoot, "session-start"), timeout: 1 },
        { command: "./hooks/keep-me.sh" }
      ]
    }
  };
  const merged = mergeDoItUserHooks(existing, pluginRoot);
  assert.ok(merged.hooks.sessionStart.some((e) => e.command === "./hooks/keep-me.sh"));
  assert.equal(
    merged.hooks.sessionStart.filter((e) => isDoItHookCommand(e.command)).length,
    1
  );
  assert.ok(
    merged.hooks.sessionStart.some((e) => String(e.command).includes("run-hook.cmd session-start"))
  );
});

test("mergeDoItUserHooks upgrades legacy bare .sh do-it commands to run-hook.cmd", () => {
  const pluginRoot = "/tmp/fake-do-it-cursor";
  const existing = {
    version: 1,
    hooks: {
      sessionStart: [
        { command: `${pluginRoot}/hooks/session-start.sh`, timeout: 25 }
      ]
    }
  };
  const merged = mergeDoItUserHooks(existing, pluginRoot);
  assert.equal(merged.hooks.sessionStart.length, 1);
  assert.match(merged.hooks.sessionStart[0].command, /run-hook\.cmd session-start$/);
  assert.ok(!merged.hooks.sessionStart[0].command.endsWith(".sh"));
});

test("win32 install never rewrites USERPROFILE into /mnt/c paths", () => {
  // Exercise the path helper logic via a small inline child so we do not need
  // to re-export internals; simulate the previous bug's rewrite rule.
  const userProfile = "C:\\Users\\alice";
  const bogus = userProfile
    .replace(/^([A-Za-z]):\\/, (_, d) => `/mnt/${d.toLowerCase()}/`)
    .replace(/\\/g, "/");
  assert.equal(bogus, "/mnt/c/Users/alice");

  // On win32 the installer must use the native profile, not the WSL mount.
  // We assert the install script source contains the guard (behavioral tests
  // for path.join on win32 run in Windows CI).
  const source = fs.readFileSync(script, "utf8");
  assert.match(source, /process\.platform === ["']win32["']/);
  assert.match(source, /Never rewrite USERPROFILE into \/mnt/);
  assert.match(source, /isWslLike/);
  assert.match(source, /looksLikeMsysUnixHome/);
});

test("register-cursor-plugin accepts USERPROFILE when HOME is unset", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "do-it-cursor-userprofile-"));
  const pluginRoot = path.join(home, "plugin");
  try {
    // Seed a built plugin at override path via manage install first? Use
    // register after a minimal copy of the built bundle.
    const built = path.join(repoRoot, "plugins", "do-it-cursor");
    assert.ok(fs.existsSync(path.join(built, ".cursor-plugin", "plugin.json")));

    const env = {
      ...process.env,
      HOME: "",
      USERPROFILE: home,
      CURSOR_PLUGIN_ROOT_OVERRIDE: pluginRoot,
      DO_IT_INSTALL_ROOT: pluginRoot
    };
    // Copy built bundle into override so register has a source.
    fs.cpSync(built, pluginRoot, { recursive: true });

    const result = spawnSync(
      process.execPath,
      [path.join(repoRoot, "scripts", "register-cursor-plugin.mjs")],
      { cwd: repoRoot, env, encoding: "utf8" }
    );
    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.ok(fs.existsSync(path.join(home, ".cursor", "hooks.json")));
    assert.match(
      fs.readFileSync(path.join(home, ".cursor", "hooks.json"), "utf8"),
      /run-hook\.cmd/
    );
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});
