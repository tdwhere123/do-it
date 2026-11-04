import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { acquireCursorHomeLocks } from "../../scripts/lib/cursor-plugin-fs.mjs";
import { registerCursorPlugin } from "../../scripts/register-cursor-plugin.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function fixture(t, customRoot = false) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "do-it-cursor-managed-lock-"));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const packageRoot = path.join(home, "package");
  for (const entry of ["install", "scripts", "agents", "skills", "hooks", "manifest.json", "package.json"]) {
    fs.cpSync(path.join(repoRoot, entry), path.join(packageRoot, entry), { recursive: true });
  }
  const root = customRoot ? path.join(home, "managed") : path.join(home, ".cursor", "plugins", "local", "do-it-cursor");
  const trace = path.join(home, "mutations.jsonl");
  const lock = path.join(home, ".cursor", ".do-it-install.lock");
  const env = {
    ...process.env, HOME: home, USERPROFILE: process.platform === "win32" ? home : "",
    CURSOR_PLUGIN_ROOT_OVERRIDE: customRoot ? root : "", DO_IT_FORCE: "",
    DO_IT_TEST_MANAGED_HOME: home, DO_IT_TEST_MANAGED_ROOT: root, DO_IT_TEST_MANAGED_TRACE: trace,
    DO_IT_TEST_MANAGED_RECOVERY: "", DO_IT_TEST_CURSOR_FAIL_AT: ""
  };
  return {
    home, root, lock, trace,
    run(extra = {}, args = ["install", "--target=cursor"]) {
      return spawnSync(process.execPath, [
        "--import", pathToFileURL(path.join(repoRoot, "tests/fixtures/cursor-managed-lock-trace.mjs")).href,
        path.join(packageRoot, "install/manage.mjs"), ...args
      ], { cwd: packageRoot, env: { ...env, ...extra }, encoding: "utf8" });
    },
    events() { return fs.existsSync(trace) ? fs.readFileSync(trace, "utf8").trim().split("\n").filter(Boolean).map(JSON.parse) : []; }
  };
}

for (const customRoot of [false, true]) {
  test(`Cursor managed install blocks before mutations with an existing home lock (custom root: ${customRoot})`, (t) => {
    const f = fixture(t, customRoot);
    const initial = f.run();
    assert.equal(initial.status, 0, initial.stderr);
    fs.rmSync(f.trace, { force: true });
    const release = acquireCursorHomeLocks([f.home]);
    const owner = fs.readFileSync(f.lock, "utf8");
    try {
      const result = f.run();
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /another Cursor install may be active; lock retained/);
      assert.equal(fs.readFileSync(f.lock, "utf8"), owner);
      assert.deepEqual(f.events(), [], "managed assets must not change before lock rejection");
    } finally { release(); }
  });

  test(`Cursor managed install keeps one owner through registration and cleanup (custom root: ${customRoot})`, (t) => {
    const f = fixture(t, customRoot);
    const result = f.run();
    assert.equal(result.status, 0, result.stderr);
    const events = f.events();
    assert.ok(events.some((event) => event.target.endsWith(`${path.sep}hooks.json`)));
    assert.ok(events.some((event) => event.operation === "remove" && event.target.includes(".do-it-install-staging-")));
    assert.deepEqual(events.filter((event) => !event.owned), []);
    assert.equal(fs.existsSync(f.lock), false);
  });
}

test("Cursor managed rollback and cleanup keep the home lock and preserve every failure", (t) => {
  const f = fixture(t);
  assert.equal(f.run().status, 0);
  fs.rmSync(f.trace);
  const result = f.run({ DO_IT_TEST_CURSOR_FAIL_AT: "after-marker", DO_IT_TEST_MANAGED_RECOVERY: "1" });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /injected Cursor registration failure at after-marker/);
  assert.match(result.stderr, /rollback failed at .*do-it-core.*injected managed rollback failure/);
  assert.match(result.stderr, /stage cleanup failed at .*do-it-install-staging-.*injected managed stage cleanup failure/);
  assert.match(result.stderr, /lock release failed at .*do-it-install.lock.*injected managed lock removal failure/);
  assert.deepEqual(f.events().filter((event) => !event.owned), []);
  assert.ok(fs.existsSync(f.lock));
  assert.ok(fs.readdirSync(path.join(f.root, "skills")).some((entry) => entry.includes("do-it-core") && entry.includes("backup")));
});

test("Cursor registration rejects fabricated, wrong-home, and released borrowed locks", (t) => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "do-it-cursor-lock-owner-"));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const homeLock = acquireCursorHomeLocks([home]);
  try {
    for (const options of [{ home, homeLock: () => [] }, { home: path.join(home, "other"), homeLock }]) {
      assert.throws(() => registerCursorPlugin(options), /requires an active lock/);
    }
  } finally { homeLock(); }
  assert.throws(() => registerCursorPlugin({ home, homeLock }), /requires an active lock/);
});

test("Cursor --no-migrate refusal releases its lock and setup does not continue to doctor", (t) => {
  const f = fixture(t);
  assert.equal(f.run().status, 0);
  const statePath = path.join(f.root, ".do-it-install-state-cursor.json");
  const state = JSON.parse(fs.readFileSync(statePath, "utf8"));
  state.version = "0.18.1";
  const previous = `${JSON.stringify(state)}\n`;
  fs.writeFileSync(statePath, previous);
  const result = f.run({}, ["setup", "--target=cursor", "--no-migrate"]);
  assert.equal(result.status, 2, result.stderr);
  assert.equal(fs.readFileSync(statePath, "utf8"), previous);
  assert.equal(fs.existsSync(f.lock), false);
  assert.doesNotMatch(result.stdout, /doctor checked/);
});
