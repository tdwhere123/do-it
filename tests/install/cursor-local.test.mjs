#!/usr/bin/env node
/**
 * Unit coverage for scripts/install-cursor-local.mjs — real-directory install
 * under ~/.cursor/plugins/local (no external symlink).
 */

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

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
    const result = runInstall({ HOME: home, CURSOR_LOCAL_HOME: "" });
    assert.equal(result.status, 0, result.stderr || result.stdout);

    const dest = path.join(home, ".cursor", "plugins", "local", "do-it-cursor");
    assert.ok(fs.existsSync(path.join(dest, ".cursor-plugin", "plugin.json")));
    assert.ok(!fs.lstatSync(dest).isSymbolicLink(), "must not be a symlink");
    assert.ok(fs.existsSync(path.join(dest, "skills", "do-it-router", "SKILL.md")));
    assert.ok(fs.existsSync(path.join(dest, "hooks", "hooks.json")));
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});
