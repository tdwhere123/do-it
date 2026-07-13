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
import { resolveUserHome, looksLikeMsysUnixHome } from "../../scripts/lib/user-home.mjs";
import { collectHomes, windowsHomeCandidates } from "../../scripts/install-cursor-local.mjs";

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

test("resolveUserHome prefers USERPROFILE and rejects MSYS HOME on win32 semantics", () => {
  assert.equal(looksLikeMsysUnixHome("/c/Users/alice"), true);
  assert.equal(looksLikeMsysUnixHome("C:\\Users\\alice"), false);

  if (process.platform === "win32") {
    const home = resolveUserHome({
      USERPROFILE: "C:\\Users\\alice",
      HOME: "/c/Users/alice"
    });
    assert.match(home, /Users[\\/]alice$/i);
    assert.doesNotMatch(home, /[\\/]c[\\/]Users/i);
  } else {
    // Shared helper still returns HOME on non-win32.
    assert.equal(resolveUserHome({ HOME: "/home/alice" }), "/home/alice");
  }
});

test("collectHomes on win32 rejects /mnt and MSYS HOME candidates", () => {
  if (process.platform !== "win32") {
    const source = fs.readFileSync(script, "utf8");
    assert.match(source, /looksLikeMsysUnixHome/);
    assert.ok(source.includes("mnt\\/[a-z]\\/"), "win32 collectHomes must reject /mnt/<drive>/ paths");
    return;
  }

  const homes = collectHomes({
    USERPROFILE: "C:\\Users\\alice",
    HOME: "/c/Users/alice",
    CURSOR_LOCAL_HOME: "D:\\mnt\\c\\Users\\evil"
  });
  assert.ok(homes.some((h) => /Users[\\/]alice$/i.test(h)));
  assert.ok(!homes.some((h) => /[\\/]c[\\/]Users/i.test(h)));
  assert.ok(!homes.some((h) => /mnt[\\/]c/i.test(h)));
});

test("windowsHomeCandidates prefers USERPROFILE mount and does not scan all users when set", () => {
  if (process.platform === "win32") {
    assert.deepEqual(windowsHomeCandidates({ USERPROFILE: "C:\\Users\\alice" }), []);
    return;
  }
  // On Linux CI without WSL mounts this returns []. With USERPROFILE set the
  // implementation short-circuits to that mount only (no multi-user scan).
  const withProfile = windowsHomeCandidates({ USERPROFILE: "C:\\Users\\alice" });
  if (withProfile.length > 0) {
    assert.deepEqual(withProfile, ["/mnt/c/Users/alice"]);
  }
});

test("register-cursor-plugin accepts USERPROFILE when HOME is unset", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "do-it-cursor-userprofile-"));
  const pluginRoot = path.join(home, "plugin");
  try {
    const built = path.join(repoRoot, "plugins", "do-it-cursor");
    assert.ok(fs.existsSync(path.join(built, ".cursor-plugin", "plugin.json")));

    const env = {
      ...process.env,
      HOME: "",
      USERPROFILE: home,
      CURSOR_PLUGIN_ROOT_OVERRIDE: pluginRoot,
      DO_IT_INSTALL_ROOT: pluginRoot
    };
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

test("register-cursor-plugin ignores MSYS HOME when USERPROFILE is set", () => {
  if (process.platform !== "win32") return;

  const home = fs.mkdtempSync(path.join(os.tmpdir(), "do-it-cursor-msys-"));
  const pluginRoot = path.join(home, "plugin");
  try {
    const built = path.join(repoRoot, "plugins", "do-it-cursor");
    fs.cpSync(built, pluginRoot, { recursive: true });
    const result = spawnSync(
      process.execPath,
      [path.join(repoRoot, "scripts", "register-cursor-plugin.mjs")],
      {
        cwd: repoRoot,
        env: {
          ...process.env,
          HOME: "/c/Users/should-not-use",
          USERPROFILE: home,
          CURSOR_PLUGIN_ROOT_OVERRIDE: pluginRoot,
          DO_IT_INSTALL_ROOT: pluginRoot
        },
        encoding: "utf8"
      }
    );
    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.ok(fs.existsSync(path.join(home, ".cursor", "hooks.json")));
    assert.ok(!fs.existsSync("C:\\c\\Users\\should-not-use\\.cursor\\hooks.json"));
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});
