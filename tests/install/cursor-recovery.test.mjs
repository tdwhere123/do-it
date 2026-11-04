import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { acquireCursorHomeLocks } from "../../scripts/lib/cursor-plugin-fs.mjs";
import { installCursorLocal } from "../../scripts/install-cursor-local.mjs";
import { registerCursorPlugin } from "../../scripts/register-cursor-plugin.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const source = path.join(repoRoot, "plugins", "do-it-cursor");
const lockPathFor = (home) => path.join(home, ".cursor", ".do-it-install.lock");
const pluginPathFor = (home) => path.join(home, ".cursor", "plugins", "local", "do-it-cursor");

function freshHome() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "do-it-cursor-recovery-"));
}

for (const namespace of ["same", "foreign", "legacy"]) {
  test(`Cursor never reclaims a ${namespace}-namespace lock using a local PID`, () => {
    const home = freshHome();
    try {
      const release = acquireCursorHomeLocks([home]);
      const lock = lockPathFor(home);
      const owner = JSON.parse(fs.readFileSync(lock, "utf8"));
      assert.equal(owner.namespace.platform, process.platform);
      assert.equal(owner.namespace.hostname, os.hostname());
      if (process.platform === "linux") {
        assert.equal(owner.namespace.pidNamespace, fs.readlinkSync("/proc/self/ns/pid"));
      }
      assert.deepEqual(release(), []);
      owner.pid = 99999999;
      owner.createdAt = 1;
      if (namespace === "foreign") owner.namespace.platform = process.platform === "win32" ? "linux" : "win32";
      if (namespace === "legacy") delete owner.namespace;
      const before = JSON.stringify(owner);
      fs.writeFileSync(lock, before);
      assert.throws(() => acquireCursorHomeLocks([home]), /lock retained.*every OS.*retry once/);
      assert.equal(fs.readFileSync(lock, "utf8"), before);
      // Explicit recovery is safe only with all installers quiescent, as here.
      fs.renameSync(lock, `${lock}.archived`);
      const releaseRecovered = acquireCursorHomeLocks([home]);
      assert.deepEqual(releaseRecovered(), []);
    } finally {
      fs.rmSync(home, { recursive: true, force: true });
    }
  });
}

test("Cursor does not unlink a new owner that replaces a stale lock during acquisition", () => {
  const home = freshHome();
  const originalOpen = fs.openSync;
  let lock;
  try {
    lock = lockPathFor(home);
    fs.mkdirSync(path.dirname(lock), { recursive: true });
    fs.writeFileSync(lock, JSON.stringify({ pid: 99999999, id: "stale" }));
    const nextOwner = JSON.stringify({ pid: process.pid, id: "new-owner" });
    fs.openSync = function (file, flags, ...args) {
      try {
        return originalOpen.call(fs, file, flags, ...args);
      } catch (error) {
        if (file === lock && flags === "wx" && error.code === "EEXIST") {
          fs.writeFileSync(lock, nextOwner);
        }
        throw error;
      }
    };
    assert.throws(() => acquireCursorHomeLocks([home]), /lock retained/);
    assert.equal(fs.readFileSync(lock, "utf8"), nextOwner);
  } finally {
    fs.openSync = originalOpen;
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test("Cursor release refuses a replaced owner and preserves the replacement lock", () => {
  const home = freshHome();
  try {
    const release = acquireCursorHomeLocks([home]);
    const lock = lockPathFor(home);
    const newer = JSON.stringify({ pid: process.pid, id: "another-owner" });
    fs.writeFileSync(lock, newer);
    const failures = release();
    assert.equal(failures.length, 1);
    assert.match(failures[0].error.message, /ownership changed/);
    assert.equal(fs.readFileSync(lock, "utf8"), newer);
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});

for (const caller of ["local", "registration"]) {
  test(`Cursor ${caller} CLI retains commit, rollback, stage cleanup, and lock failures`, () => {
    const home = freshHome();
    try {
      installCursorLocal({ homes: [home], source });
      const plugin = pluginPathFor(home);
      const reviewer = path.join(plugin, "agents", "reviewer.md");
      fs.writeFileSync(reviewer, "previous reviewer\n");
      const script = caller === "local" ? "install-cursor-local.mjs" : "register-cursor-plugin.mjs";
      const env = {
        ...process.env,
        HOME: home,
        USERPROFILE: process.platform === "win32" ? home : "",
        CURSOR_LOCAL_HOME: "",
        DO_IT_INSTALL_ROOT: source,
        DO_IT_TEST_CURSOR_LOCAL_FAIL_AT: "after-plugin-1",
        DO_IT_TEST_CURSOR_FAIL_AT: "after-local-plugin"
      };
      const result = spawnSync(process.execPath, [
        "--import", pathToFileURL(path.join(repoRoot, "tests", "fixtures", "cursor-install-faults.mjs")).href,
        path.join(repoRoot, "scripts", script)
      ], { cwd: repoRoot, env, encoding: "utf8" });
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /injected Cursor (local install|registration) failure/);
      assert.match(result.stderr, /rollback incomplete:.*backup:.*\.do-it-backup-reviewer/);
      assert.match(result.stderr, /stage cleanup failed at .*\.do-it-stage-.*injected stage cleanup failure/);
      assert.match(result.stderr, /lock release failed at .*\.do-it-install\.lock: injected lock close failure/);
      assert.match(result.stderr, /lock release failed at .*\.do-it-install\.lock: injected lock removal failure/);
      assert.equal(fs.readFileSync(reviewer, "utf8"), "concurrent reviewer change\n");
      const backup = fs.readdirSync(path.dirname(reviewer)).find((name) => name.startsWith(".do-it-backup-reviewer.md-"));
      assert.ok(backup);
      assert.equal(fs.readFileSync(path.join(path.dirname(reviewer), backup), "utf8"), "previous reviewer\n");
      assert.ok(fs.existsSync(lockPathFor(home)));
    } finally {
      fs.rmSync(home, { recursive: true, force: true });
    }
  });
}

test("Cursor registration failure does not call a throwing cleanup logger", () => {
  const home = freshHome();
  try {
    assert.throws(() => registerCursorPlugin({
      home,
      installRoot: source,
      builtBundle: source,
      failAt: "after-local-plugin",
      log() { throw new Error("logger must not mask failure"); },
      lockOptions: { removeLock() { throw new Error("lock release denied"); } }
    }), (error) => {
      assert.match(error.message, /injected Cursor registration failure/);
      assert.match(error.message, /lock release failed.*lock release denied/);
      assert.doesNotMatch(error.message, /logger must not/);
      return true;
    });
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});

for (const modified of [false, true]) {
  test(`Cursor handbook retirement preserves adjacent files (modified: ${modified})`, () => {
    const home = freshHome();
    try {
      installCursorLocal({ homes: [home], source });
      const handbook = path.join(pluginPathFor(home), "skills", "do-it-handbook");
      fs.mkdirSync(handbook);
      const fixture = fs.readFileSync(path.join(repoRoot, "tests", "fixtures", "cursor-0.18.1-do-it-handbook.md"), "utf8");
      const contents = fixture + (modified ? "\nPersonal customization.\n" : "");
      fs.writeFileSync(path.join(handbook, "SKILL.md"), contents);
      fs.writeFileSync(path.join(handbook, "personal.md"), "keep personal history\n");
      installCursorLocal({ homes: [home], source });
      assert.equal(fs.existsSync(path.join(handbook, "SKILL.md")), modified);
      if (modified) assert.equal(fs.readFileSync(path.join(handbook, "SKILL.md"), "utf8"), contents);
      assert.equal(fs.readFileSync(path.join(handbook, "personal.md"), "utf8"), "keep personal history\n");
    } finally {
      fs.rmSync(home, { recursive: true, force: true });
    }
  });
}
