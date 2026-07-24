import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repoRoot = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	"../..",
);
const bridgeUrl = pathToFileURL(
	path.join(repoRoot, "plugins/do-it-pi/.test-dist/extensions/bridge.js"),
).href;
const bridge = await import(bridgeUrl);

test("buildHookPayload keeps transcript and tool-result text", () => {
	const payload = bridge.buildHookPayload({
		sessionId: "session-1",
		cwd: "/tmp/project",
		transcriptPath: "/tmp/session.jsonl",
		toolName: "edit",
		input: { path: "src/a.ts", oldText: "a", newText: "b" },
		content: [
			{ type: "text", text: "edited" },
			{ type: "image", data: "abc", mimeType: "image/png" },
		],
	});

	assert.equal(payload.session_id, "session-1");
	assert.equal(payload.cwd, "/tmp/project");
	assert.equal(payload.transcript_path, "/tmp/session.jsonl");
	assert.equal(payload.tool_name, "Edit");
	assert.equal(payload.file_path, "src/a.ts");
	assert.equal(payload.tool_result, "edited");
});

test("parseHookOutput extracts advisory context", () => {
	const result = bridge.parseHookOutput(
		'{"hookSpecificOutput":{"additionalContext":"<system-reminder>lint</system-reminder>"}}\n',
	);
	assert.equal(
		result.additionalContext,
		"<system-reminder>lint</system-reminder>",
	);
});

test("parseHookOutput rejects non-string protocol fields and bounds context", () => {
	const invalid = bridge.parseHookOutput(
		'{"decision":"block","reason":42,"hookSpecificOutput":{"additionalContext":{"text":"no"}}}',
	);
	assert.deepEqual(invalid, {});

	const oversized = "x".repeat(70 * 1024);
	const bounded = bridge.parseHookOutput(
		JSON.stringify({ hookSpecificOutput: { additionalContext: oversized } }),
	);
	assert.ok(bounded.additionalContext.length < oversized.length);
	assert.match(bounded.additionalContext, /truncated at 65536 bytes/);
});

test("resolveBash honors an executable DO_IT_BASH override", () => {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "do-it-pi-bash-"));
	const executable = path.join(
		dir,
		process.platform === "win32" ? "bash.exe" : "bash",
	);
	fs.writeFileSync(
		executable,
		process.platform === "win32" ? "" : "#!/bin/sh\nexit 0\n",
		{ mode: 0o700 },
	);

	try {
		assert.equal(
			bridge.resolveBash(
				{ DO_IT_BASH: executable, PATH: "" },
				process.platform,
			),
			executable,
		);
	} finally {
		fs.rmSync(dir, { recursive: true, force: true });
	}
});

test("spawnHook reports explicit degradation when Bash is unavailable", async () => {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "do-it-pi-no-bash-"));
	const script = path.join(dir, "ok.sh");
	fs.writeFileSync(script, "#!/usr/bin/env bash\nexit 0\n", { mode: 0o700 });
	try {
		const result = await bridge.spawnHook(
			dir,
			"ok.sh",
			{ session_id: "s", cwd: dir },
			{ env: { DO_IT_BASH: path.join(dir, "missing-bash"), PATH: "" } },
		);
		assert.equal(result.unavailable, true);
		assert.equal(result.exitCode, 0);
		assert.match(result.diagnostic, /DO_IT_BASH does not resolve/i);
	} finally {
		fs.rmSync(dir, { recursive: true, force: true });
	}
});

test("spawnHook runs a real advisory hook through Bash", async (t) => {
	const bash = bridge.resolveBash();
	if (!bash) return t.skip("Bash unavailable");

	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "do-it-pi-hook-"));
	const script = path.join(dir, "ok.sh");
	fs.writeFileSync(
		script,
		'#!/usr/bin/env bash\nread -r input\nprintf \'%s\\n\' \'{"hookSpecificOutput":{"additionalContext":"hook-ok"}}\'\n',
		{ mode: 0o700 },
	);

	try {
		const result = await bridge.spawnHook(
			dir,
			"ok.sh",
			{ session_id: "s", cwd: dir },
			{ timeoutMs: 2_000 },
		);
		assert.equal(result.exitCode, 0);
		assert.equal(result.additionalContext, "hook-ok");
		assert.equal(result.timedOut, undefined);
	} finally {
		fs.rmSync(dir, { recursive: true, force: true });
	}
});

test("spawnHook terminates a timed-out hook", async (t) => {
	const bash = bridge.resolveBash();
	if (!bash) return t.skip("Bash unavailable");

	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "do-it-pi-timeout-"));
	const script = path.join(dir, "slow.sh");
	fs.writeFileSync(script, "#!/usr/bin/env bash\nsleep 5\n", { mode: 0o700 });

	try {
		const result = await bridge.spawnHook(
			dir,
			"slow.sh",
			{ session_id: "s", cwd: dir },
			{ timeoutMs: 50 },
		);
		assert.equal(result.exitCode, 124);
		assert.equal(result.timedOut, true);
		assert.match(result.diagnostic ?? "", /timed out/i);
	} finally {
		fs.rmSync(dir, { recursive: true, force: true });
	}
});

test("spawnHook settles after cleanup grace when a descendant escapes the process group", async (t) => {
	if (process.platform !== "linux" || !fs.existsSync("/usr/bin/setsid")) {
		return t.skip("Linux setsid unavailable");
	}
	const bash = bridge.resolveBash();
	if (!bash) return t.skip("Bash unavailable");

	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "do-it-pi-escaped-child-"));
	const script = path.join(dir, "escape.sh");
	fs.writeFileSync(
		script,
		'#!/usr/bin/env bash\nsetsid bash -c "sleep 2" &\nexit 0\n',
		{ mode: 0o700 },
	);
	try {
		const started = Date.now();
		const result = await bridge.spawnHook(
			dir,
			"escape.sh",
			{ session_id: "s", cwd: dir },
			{ timeoutMs: 50 },
		);
		const elapsed = Date.now() - started;
		assert.equal(result.exitCode, 124);
		assert.equal(result.timedOut, true);
		assert.ok(elapsed < 800, `hook settled too slowly: ${elapsed}ms`);
		// After timeout, either the direct child closes inside the grace window
		// ("termination was requested") or pipes are force-closed at grace
		// ("descendant cleanup could not be confirmed"). Both are valid races
		// once a setsid grandchild keeps inherited stdio open.
		assert.match(result.diagnostic ?? "", /timed out after 50ms/i);
		assert.match(
			result.diagnostic ?? "",
			/Process-tree termination was requested|descendant cleanup could not be confirmed/i,
		);
	} finally {
		fs.rmSync(dir, { recursive: true, force: true });
	}
});

test("spawnHook enforces an aggregate output limit above, not at, the boundary", async (t) => {
	const bash = bridge.resolveBash();
	if (!bash) return t.skip("Bash unavailable");

	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "do-it-pi-output-limit-"));
	try {
		for (const [name, bytes] of [
			["exact.sh", 256 * 1024],
			["over.sh", 256 * 1024 + 1],
		]) {
			fs.writeFileSync(
				path.join(dir, name),
				`#!/usr/bin/env bash\nhead -c ${bytes} /dev/zero | tr '\\0' x\n`,
				{ mode: 0o700 },
			);
		}
		const exact = await bridge.spawnHook(
			dir,
			"exact.sh",
			{ session_id: "s", cwd: dir },
			{ timeoutMs: 2_000 },
		);
		assert.equal(exact.exitCode, 0);
		assert.equal(Buffer.byteLength(exact.stdout), 256 * 1024);

		const over = await bridge.spawnHook(
			dir,
			"over.sh",
			{ session_id: "s", cwd: dir },
			{ timeoutMs: 2_000 },
		);
		assert.equal(over.exitCode, 1);
		assert.match(
			over.diagnostic ?? "",
			/aggregate stdout\/stderr output limit/i,
		);
	} finally {
		fs.rmSync(dir, { recursive: true, force: true });
	}
});

test("spawnHook terminates an aborted hook", async (t) => {
	const bash = bridge.resolveBash();
	if (!bash) return t.skip("Bash unavailable");

	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "do-it-pi-abort-"));
	const script = path.join(dir, "slow.sh");
	fs.writeFileSync(script, "#!/usr/bin/env bash\nsleep 5\n", { mode: 0o700 });
	const controller = new AbortController();
	try {
		const running = bridge.spawnHook(
			dir,
			"slow.sh",
			{ session_id: "s", cwd: dir },
			{ timeoutMs: 2_000, signal: controller.signal },
		);
		setTimeout(() => controller.abort(), 50);
		const result = await running;
		assert.equal(result.exitCode, 130);
		assert.equal(result.aborted, true);
		assert.match(result.diagnostic ?? "", /aborted/i);
	} finally {
		fs.rmSync(dir, { recursive: true, force: true });
	}
});

test("windowsTaskkill resolves the native process-tree killer", () => {
	assert.equal(
		bridge.windowsTaskkill({ SystemRoot: "C:\\Windows" }),
		"C:\\Windows\\System32\\taskkill.exe",
	);
	assert.equal(bridge.windowsTaskkill({}), "taskkill.exe");
});

test("real subagent stance honors PI_SUBAGENT_CHILD without path heuristics", async (t) => {
	const bash = bridge.resolveBash();
	if (!bash) return t.skip("Bash unavailable");

	const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "do-it-pi-child-hook-"));
	const dataDir = path.join(cwd, "hook-data");
	try {
		const result = await bridge.spawnHook(
			path.join(repoRoot, "plugins/do-it-pi/hooks"),
			"subagent-stance.sh",
			{
				session_id: "pi-child-test",
				cwd,
				transcript_path: path.join(cwd, "session.jsonl"),
			},
			{
				timeoutMs: 2_000,
				env: {
					PI_SUBAGENT_CHILD: "1",
					DO_IT_HOOK_DATA: dataDir,
					PLUGIN_DATA: dataDir,
				},
			},
		);
		assert.equal(result.exitCode, 0);
		assert.match(result.additionalContext ?? "", /do-it subagent stance/i);
	} finally {
		fs.rmSync(cwd, { recursive: true, force: true });
	}
});
