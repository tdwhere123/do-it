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

test("Claude, Codex, Cursor, and Kimi register evidence-observer", () => {
	const claude = JSON.stringify(readJson("hooks/hooks.json"));
	assert.match(claude, /evidence-observer\.sh/);
	assert.match(claude, /Bash\|Shell/);

	const codex = JSON.stringify(readJson("install/codex-hooks.json"));
	assert.match(codex, /evidence-observer\.sh/);
	assert.match(codex, /Bash\|Shell/);

	const cursor = readJson("install/cursor-hooks.json");
	const post = JSON.stringify(cursor.hooks.postToolUse ?? []);
	const after = JSON.stringify(cursor.hooks.afterFileEdit ?? []);
	assert.match(post, /evidence-observer/);
	assert.match(after, /evidence-observer/);
	assert.match(post, /Shell/);

	const kimi = readJson("kimi.plugin.json");
	const observer = (kimi.hooks ?? []).filter(
		(hook) => hook.command === "./hooks/evidence-observer.sh",
	);
	assert.equal(observer.length, 2);
	assert.ok(observer.some((hook) => hook.matcher === "Edit|Write"));
	assert.ok(observer.some((hook) => hook.matcher === "Bash"));
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
