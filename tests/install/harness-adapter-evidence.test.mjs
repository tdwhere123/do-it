#!/usr/bin/env node
/**
 * Install-surface wiring for evidence-observer. Pair of
 * tests/hooks/harness-adapter-evidence.test.sh: JSON manifests must register
 * the same observer script the adapters invoke.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { HOOK_SCRIPTS, RUN_HOOK_CMD_ALLOWLIST } from "../../scripts/lib/hook-manifest.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function readJson(relativePath) {
	return JSON.parse(fs.readFileSync(path.join(repoRoot, relativePath), "utf8"));
}

test("hook-manifest ships evidence-observer on every host bundle list", () => {
	assert.ok(HOOK_SCRIPTS.includes("evidence-observer.sh"));
	assert.ok(RUN_HOOK_CMD_ALLOWLIST.includes("evidence-observer.sh"));
});

test("default native wiring excludes automatic diagnostics and retired gates", () => {
  for (const config of ["hooks/hooks.json", "install/codex-hooks.json", "install/cursor-hooks.json", "kimi.plugin.json"]) {
    assert.doesNotMatch(JSON.stringify(readJson(config)), /evidence-observer|verification-gate|network-admission|adaptive-context|behavior-feedback/);
  }
});

test("harness adapter evidence shell suite passes", () => {
	const script = path.join(
		repoRoot,
		"tests/hooks/harness-adapter-evidence.test.sh",
	);
	const result = spawnSync("bash", [script], {
		cwd: repoRoot,
		encoding: "utf8",
	});
	assert.equal(result.status, 0, result.stdout + result.stderr);
});
