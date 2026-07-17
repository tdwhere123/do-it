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
  commandForRunHook,
  toWindowsPathIfWslMount
} from "../../scripts/lib/cursor-user-hooks.mjs";
import { resolveUserHome, looksLikeMsysUnixHome } from "../../scripts/lib/user-home.mjs";
import {
  collectHomes,
  installCursorLocal,
  windowsHomeCandidates
} from "../../scripts/install-cursor-local.mjs";
import {
  acquireCursorHomeLocks,
  commitPreparedReplacements,
  prepareFileReplacement,
  registerCursorPlugin,
  validateCursorPlugin
} from "../../scripts/register-cursor-plugin.mjs";
import { prepareUserHooksForPlugin } from "../../scripts/lib/cursor-user-hooks.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const script = path.join(repoRoot, "scripts", "install-cursor-local.mjs");

function runInstall(env) {
  return spawnSync(process.execPath, [script], {
    cwd: repoRoot,
    env: { ...process.env, ...env },
    encoding: "utf8"
  });
}

test("Cursor home locks steal immediately when owner PID is dead", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "do-it-cursor-dead-lock-"));
  try {
    const lockPath = path.join(home, ".cursor", ".do-it-install.lock");
    fs.mkdirSync(path.dirname(lockPath), { recursive: true });
    fs.writeFileSync(
      lockPath,
      `${JSON.stringify({ pid: 99999999, createdAt: Date.now(), id: "dead-owner" })}\n`
    );
    const release = acquireCursorHomeLocks([home]);
    release();
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test("Cursor home locks reject concurrent installs", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "do-it-cursor-lock-"));
  try {
    const release = acquireCursorHomeLocks([home]);
    assert.throws(() => acquireCursorHomeLocks([home]), /another Cursor install is active/);
    assert.deepEqual(release(), []);
    const releaseAgain = acquireCursorHomeLocks([home]);
    assert.deepEqual(releaseAgain(), []);
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test("Cursor lock cleanup failures are reported without reversing a committed install", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "do-it-cursor-lock-cleanup-"));
  const source = path.join(repoRoot, "plugins", "do-it-cursor");
  try {
    const result = installCursorLocal({
      homes: [home],
      source,
      lockOptions: {
        removeLock() {
          throw new Error("cleanup blocked");
        }
      }
    });

    assert.equal(result.recoveryBackups.length, 1);
    assert.match(result.recoveryBackups[0], /\.do-it-install\.lock$/);
    assert.ok(
      fs.existsSync(path.join(home, ".cursor", "plugins", "local", "do-it-cursor", ".cursor-plugin", "plugin.json"))
    );
    assert.ok(fs.existsSync(path.join(home, ".cursor", "hooks.json")));
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test("registerCursorPlugin reports lock cleanup failure after committing", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "do-it-cursor-register-lock-"));
  const installRoot = path.join(home, "managed");
  const builtBundle = path.join(repoRoot, "plugins", "do-it-cursor");
  const messages = [];
  try {
    const result = registerCursorPlugin({
      home,
      installRoot,
      builtBundle,
      log(message) {
        messages.push(message);
      },
      lockOptions: {
        removeLock() {
          throw new Error("cleanup blocked");
        }
      }
    });

    assert.equal(result.recoveryBackups.length, 1);
    assert.ok(fs.existsSync(path.join(result.installPath, ".cursor-plugin", "plugin.json")));
    assert.match(messages.join("\n"), /retained Cursor install lock/);
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test("commitPreparedReplacements refuses a changed staged hook target", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "do-it-cursor-cas-"));
  try {
    const hooksPath = path.join(home, ".cursor", "hooks.json");
    fs.mkdirSync(path.dirname(hooksPath), { recursive: true });
    fs.writeFileSync(hooksPath, '{"version":1,"hooks":{}}\n');
    const prepared = prepareUserHooksForPlugin(home, "/tmp/fake-do-it-cursor");
    const replacement = prepareFileReplacement(
      hooksPath,
      `${JSON.stringify(prepared.value, null, 2)}\n`,
      { kind: "user-hooks", home, expectedState: prepared.fileState }
    );
    fs.writeFileSync(hooksPath, '{"version":1,"hooks":{"stop":[{"command":"concurrent"}]}}\n');

    assert.throws(
      () => commitPreparedReplacements([replacement]),
      /target changed while Cursor install was staged/
    );
    assert.match(fs.readFileSync(hooksPath, "utf8"), /concurrent/);
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test("commitPreparedReplacements reports backup cleanup failures after commit", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "do-it-cursor-cleanup-"));
  try {
    const target = path.join(home, "target.txt");
    fs.writeFileSync(target, "old\n");
    const replacement = prepareFileReplacement(target, "new\n");
    const result = commitPreparedReplacements([replacement], {
      removeBackup() {
        throw new Error("cleanup blocked");
      }
    });
    assert.equal(result.cleanupFailures.length, 1);
    assert.equal(fs.readFileSync(target, "utf8"), "new\n");
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});

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
    assert.ok(
      !fs.existsSync(path.join(dest, ".do-it-install-state-cursor.json")),
      "copy-only local install must not fabricate managed state"
    );

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

test("install-cursor-local copy failure preserves the existing plugin and hooks", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "do-it-cursor-copy-fail-"));
  try {
    const dest = path.join(home, ".cursor", "plugins", "local", "do-it-cursor");
    const hooksPath = path.join(home, ".cursor", "hooks.json");
    fs.mkdirSync(dest, { recursive: true });
    fs.writeFileSync(path.join(dest, "keep.txt"), "old plugin\n");
    fs.mkdirSync(path.dirname(hooksPath), { recursive: true });
    fs.writeFileSync(hooksPath, '{"version":1,"hooks":{"stop":[{"command":"keep-me"}]}}\n');

    const result = runInstall({
      HOME: home,
      CURSOR_LOCAL_HOME: "",
      USERPROFILE: "",
      DO_IT_TEST_CURSOR_LOCAL_FAIL_AT: "before-copy-1"
    });
    assert.notEqual(result.status, 0);
    assert.equal(fs.readFileSync(path.join(dest, "keep.txt"), "utf8"), "old plugin\n");
    assert.equal(
      fs.readFileSync(hooksPath, "utf8"),
      '{"version":1,"hooks":{"stop":[{"command":"keep-me"}]}}\n'
    );
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test("install-cursor-local rolls back every home when the second commit fails", () => {
  const firstHome = fs.mkdtempSync(path.join(os.tmpdir(), "do-it-cursor-first-"));
  const secondHome = fs.mkdtempSync(path.join(os.tmpdir(), "do-it-cursor-second-"));
  try {
    const firstDest = path.join(firstHome, ".cursor", "plugins", "local", "do-it-cursor");
    const firstHooks = path.join(firstHome, ".cursor", "hooks.json");
    const secondDest = path.join(secondHome, ".cursor", "plugins", "local", "do-it-cursor");
    const secondHooks = path.join(secondHome, ".cursor", "hooks.json");
    fs.mkdirSync(firstDest, { recursive: true });
    fs.writeFileSync(path.join(firstDest, "keep.txt"), "old plugin\n");
    fs.mkdirSync(path.dirname(firstHooks), { recursive: true });
    fs.writeFileSync(firstHooks, '{"version":1,"hooks":{"stop":[{"command":"keep-me"}]}}\n');
    fs.mkdirSync(secondDest, { recursive: true });
    fs.writeFileSync(path.join(secondDest, "keep.txt"), "second old plugin\n");
    fs.mkdirSync(path.dirname(secondHooks), { recursive: true });
    fs.writeFileSync(secondHooks, '{"version":1,"hooks":{"stop":[{"command":"second"}]}}\n');

    const result = runInstall({
      HOME: firstHome,
      CURSOR_LOCAL_HOME: secondHome,
      USERPROFILE: "",
      DO_IT_TEST_CURSOR_LOCAL_FAIL_AT: "after-plugin-2"
    });
    assert.notEqual(result.status, 0);
    assert.equal(fs.readFileSync(path.join(firstDest, "keep.txt"), "utf8"), "old plugin\n");
    assert.equal(
      fs.readFileSync(firstHooks, "utf8"),
      '{"version":1,"hooks":{"stop":[{"command":"keep-me"}]}}\n'
    );
    assert.equal(
      fs.readFileSync(path.join(secondDest, "keep.txt"), "utf8"),
      "second old plugin\n",
      "second plugin must roll back"
    );
    assert.equal(
      fs.readFileSync(secondHooks, "utf8"),
      '{"version":1,"hooks":{"stop":[{"command":"second"}]}}\n',
      "second hooks must remain unchanged"
    );
  } finally {
    fs.rmSync(firstHome, { recursive: true, force: true });
    fs.rmSync(secondHome, { recursive: true, force: true });
  }
});

test("install-cursor-local hook merge failure preserves staged targets", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "do-it-cursor-hook-merge-fail-"));
  try {
    const dest = path.join(home, ".cursor", "plugins", "local", "do-it-cursor");
    const hooksPath = path.join(home, ".cursor", "hooks.json");
    fs.mkdirSync(dest, { recursive: true });
    fs.writeFileSync(path.join(dest, "keep.txt"), "old plugin\n");
    fs.mkdirSync(path.dirname(hooksPath), { recursive: true });
    fs.writeFileSync(hooksPath, '{"version":1,"hooks":{"stop":[{"command":"keep-me"}]}}\n');

    const result = runInstall({
      HOME: home,
      CURSOR_LOCAL_HOME: "",
      USERPROFILE: "",
      DO_IT_TEST_CURSOR_LOCAL_FAIL_AT: "before-hook-merge-1"
    });
    assert.notEqual(result.status, 0);
    assert.equal(fs.readFileSync(path.join(dest, "keep.txt"), "utf8"), "old plugin\n");
    assert.equal(
      fs.readFileSync(hooksPath, "utf8"),
      '{"version":1,"hooks":{"stop":[{"command":"keep-me"}]}}\n'
    );
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test("install-cursor-local rolls back plugin copies when hook commit fails", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "do-it-cursor-hook-fail-"));
  try {
    const dest = path.join(home, ".cursor", "plugins", "local", "do-it-cursor");
    const hooksPath = path.join(home, ".cursor", "hooks.json");
    fs.mkdirSync(dest, { recursive: true });
    fs.writeFileSync(path.join(dest, "keep.txt"), "old plugin\n");
    fs.mkdirSync(path.dirname(hooksPath), { recursive: true });
    fs.writeFileSync(hooksPath, '{"version":1,"hooks":{"stop":[{"command":"keep-me"}]}}\n');

    const result = runInstall({
      HOME: home,
      CURSOR_LOCAL_HOME: "",
      USERPROFILE: "",
      DO_IT_TEST_CURSOR_LOCAL_FAIL_AT: "after-user-hooks-1"
    });
    assert.notEqual(result.status, 0);
    assert.equal(fs.readFileSync(path.join(dest, "keep.txt"), "utf8"), "old plugin\n");
    assert.equal(
      fs.readFileSync(hooksPath, "utf8"),
      '{"version":1,"hooks":{"stop":[{"command":"keep-me"}]}}\n'
    );
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

test("commandForRunHook rewrites WSL mounts to Windows paths", () => {
  const cmd = commandForRunHook(
    "/mnt/c/Users/alice/.cursor/plugins/local/do-it-cursor",
    "session-start"
  );
  assert.match(
    cmd,
    /^"C:\\Users\\alice\\.cursor\\plugins\\local\\do-it-cursor\\hooks\\run-hook\.cmd" session-start$/
  );
  assert.ok(!cmd.includes("/mnt/"));
});

test("commandForRunHook rewrites custom WSL mounts (without /mnt) to Windows paths", () => {
  const cmd = commandForRunHook(
    "/c/Users/alice/.cursor/plugins/local/do-it-cursor",
    "session-start"
  );
  assert.match(
    cmd,
    /^"C:\\Users\\alice\\.cursor\\plugins\\local\\do-it-cursor\\hooks\\run-hook\.cmd" session-start$/
  );
  assert.ok(!cmd.includes("/c/Users/"));
});

test("toWindowsPathIfWslMount leaves ordinary Unix paths unchanged", () => {
  assert.equal(toWindowsPathIfWslMount("/a/b/c"), "/a/b/c");
  assert.equal(toWindowsPathIfWslMount("/home/alice/.cursor"), "/home/alice/.cursor");
});

test("validateCursorPlugin rejects intermediate directory symlinks", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "do-it-cursor-symlink-tree-"));
  const expectedVersion = JSON.parse(
    fs.readFileSync(path.join(repoRoot, "package.json"), "utf8")
  ).version;
  try {
    const plugin = path.join(root, "plugin");
    const external = path.join(root, "external-hooks");
    fs.mkdirSync(path.join(plugin, ".cursor-plugin"), { recursive: true });
    fs.writeFileSync(
      path.join(plugin, ".cursor-plugin", "plugin.json"),
      JSON.stringify({ name: "do-it-cursor", version: expectedVersion })
    );
    fs.mkdirSync(path.join(plugin, "skills", "do-it-router"), { recursive: true });
    fs.writeFileSync(path.join(plugin, "skills", "do-it-router", "SKILL.md"), "# router\n");
    fs.mkdirSync(path.join(plugin, "agents"), { recursive: true });
    fs.writeFileSync(path.join(plugin, "agents", "reviewer.md"), "# reviewer\n");
    fs.mkdirSync(external, { recursive: true });
    fs.writeFileSync(path.join(external, "hooks.json"), "{}\n");
    fs.writeFileSync(path.join(external, "run-hook.cmd"), "@echo off\n");
    fs.writeFileSync(path.join(external, "session-start.sh"), "#!/bin/sh\n");
    fs.symlinkSync(external, path.join(plugin, "hooks"), process.platform === "win32" ? "junction" : "dir");
    assert.throws(
      () => validateCursorPlugin(plugin, { requireRuntime: true, expectedVersion }),
      /must not contain symlinks/
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
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

test("isDoItHookCommand requires do-it-cursor hooks marker", () => {
  assert.equal(
    isDoItHookCommand(
      '"C:\\Users\\a\\.cursor\\plugins\\local\\do-it-cursor\\hooks\\run-hook.cmd" session-start'
    ),
    true
  );
  assert.equal(isDoItHookCommand("./hooks/run-hook.cmd session-start"), false);
  assert.equal(isDoItHookCommand("C:\\tools\\run-hook.cmd session-start"), false);
});

test("mergeDoItUserHooks preserves third-party run-hook.cmd entries", () => {
  const pluginRoot = "/tmp/fake-do-it-cursor";
  const existing = {
    version: 1,
    hooks: {
      sessionStart: [
        { command: "C:\\tools\\run-hook.cmd other-tool", timeout: 1 },
        { command: commandForRunHook(pluginRoot, "session-start"), timeout: 1 }
      ]
    }
  };
  const merged = mergeDoItUserHooks(existing, pluginRoot);
  assert.ok(
    merged.hooks.sessionStart.some((e) => e.command === "C:\\tools\\run-hook.cmd other-tool"),
    "third-party run-hook.cmd must survive"
  );
  assert.equal(
    merged.hooks.sessionStart.filter((e) => isDoItHookCommand(e.command)).length,
    1
  );
});

test("userHooksWiredForPlugin rejects bare .sh and missing entries", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "do-it-hooks-neg-"));
  const pluginRoot = path.join(home, ".cursor", "plugins", "local", "do-it-cursor");
  try {
    fs.mkdirSync(path.join(pluginRoot, "hooks"), { recursive: true });
    const hooksPath = path.join(home, ".cursor", "hooks.json");
    fs.writeFileSync(
      hooksPath,
      `${JSON.stringify(
        {
          version: 1,
          hooks: {
            sessionStart: [
              {
                command: `${pluginRoot}/hooks/session-start.sh`,
                timeout: 1
              }
            ]
          }
        },
        null,
        2
      )}\n`
    );
    const bare = userHooksWiredForPlugin(home, pluginRoot);
    assert.equal(bare.ok, false);
    assert.match(bare.reason, /bare \.sh/);

    fs.writeFileSync(
      hooksPath,
      `${JSON.stringify({ version: 1, hooks: { sessionStart: [] } }, null, 2)}\n`
    );
    const missing = userHooksWiredForPlugin(home, pluginRoot);
    assert.equal(missing.ok, false);
    assert.match(missing.reason, /missing do-it entries/);
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test("syncUserHooksForPlugin is idempotent on rewrite", async () => {
  const { syncUserHooksForPlugin } = await import("../../scripts/lib/cursor-user-hooks.mjs");
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "do-it-hooks-atomic-"));
  const pluginRoot = path.join(home, ".cursor", "plugins", "local", "do-it-cursor");
  try {
    fs.mkdirSync(path.join(pluginRoot, "hooks"), { recursive: true });
    const first = syncUserHooksForPlugin(home, pluginRoot);
    const second = syncUserHooksForPlugin(home, pluginRoot);
    assert.equal(first, second);
    const wired = userHooksWiredForPlugin(home, pluginRoot);
    assert.equal(wired.ok, true, wired.reason);
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test("windowsHomeCandidates prefers USERPROFILE mount and does not scan all users", () => {
  if (process.platform === "win32") {
    assert.deepEqual(windowsHomeCandidates({ USERPROFILE: "C:\\Users\\alice" }), []);
    return;
  }

  // Without a Windows profile, never enumerate /mnt/c/Users/* (shared-host safety).
  assert.deepEqual(windowsHomeCandidates({ USERPROFILE: "" }), []);
  assert.deepEqual(windowsHomeCandidates({}), []);

  const withProfile = windowsHomeCandidates({ USERPROFILE: "C:\\Users\\alice" });
  // On Linux CI without WSL mounts this is []; with /mnt/c present it is exactly
  // the caller's mount — never a multi-user list.
  if (withProfile.length > 0) {
    assert.deepEqual(withProfile, ["/mnt/c/Users/alice"]);
  } else {
    // Still prove the short-circuit shape via source when mounts are absent.
    const source = fs.readFileSync(script, "utf8");
    assert.match(source, /toWslMountPath\(env\.USERPROFILE\)/);
    assert.doesNotMatch(source, /readdirSync\(usersRoot\)/);
  }
});

test("registerCursorPlugin rejects an incomplete runtime bundle", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "do-it-cursor-incomplete-"));
  const incomplete = path.join(home, "incomplete");
  const expectedVersion = JSON.parse(
    fs.readFileSync(path.join(repoRoot, "package.json"), "utf8")
  ).version;
  try {
    fs.mkdirSync(path.join(incomplete, ".cursor-plugin"), { recursive: true });
    fs.writeFileSync(
      path.join(incomplete, ".cursor-plugin", "plugin.json"),
      JSON.stringify({ name: "do-it-cursor", version: expectedVersion }) + "\n"
    );

    assert.throws(
      () => registerCursorPlugin({ home, installRoot: incomplete, builtBundle: incomplete, log() {} }),
      /missing real hooks[/\\]hooks\.json/
    );
    assert.ok(!fs.existsSync(path.join(home, ".cursor", "hooks.json")));
    assert.ok(!fs.existsSync(path.join(home, ".cursor", "plugins", "do-it-cursor-install.json")));
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
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
