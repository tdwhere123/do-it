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
const KERNEL_NEEDLE = /Do-it kernel: read current repository truth/;
const indexUrl = pathToFileURL(
	path.join(repoRoot, "plugins/do-it-pi/.test-dist/extensions/index.js"),
).href;
const {
	appendToolResultContext,
	assistantTextFromMessages,
	createDoItPiExtension,
	isPiSubagent,
	resolvePiAgentDir,
} = await import(indexUrl);

function rmTemp(dir) {
	for (let attempt = 0; attempt < 8; attempt += 1) {
		try {
			fs.rmSync(dir, { recursive: true, force: true });
			return;
		} catch (error) {
			if (!["EBUSY", "ENOTEMPTY", "EPERM"].includes(error.code)) throw error;
			Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50 * (attempt + 1));
		}
	}
	fs.rmSync(dir, { recursive: true, force: true });
}

function fakePi(toolNames = ["read", "subagent"]) {
	const handlers = new Map();
	const commands = new Map();
	return {
		handlers,
		commands,
		api: {
			on(name, handler) {
				handlers.set(name, handler);
			},
			registerCommand(name, command) {
				commands.set(name, command);
			},
			getAllTools() {
				return toolNames.map((name) => ({ name }));
			},
		},
	};
}

function fakeContext(cwd, sessionId = "session-1") {
	const notices = [];
	return {
		cwd,
		notices,
		signal: new AbortController().signal,
		hasUI: false,
		ui: {
			notify(message, level) {
				notices.push({ message, level });
			},
		},
		sessionManager: {
			getSessionId() {
				return sessionId;
			},
			getSessionFile() {
				return path.join(cwd, `${sessionId}.jsonl`);
			},
			appendCustomEntry() {},
		},
	};
}

test("appendToolResultContext preserves every existing content part", () => {
	const image = { type: "image", data: "abc", mimeType: "image/png" };
	const original = [{ type: "text", text: "edited" }, image];
	const result = appendToolResultContext(original, "lint advisory");

	assert.equal(result.length, 3);
	assert.deepEqual(result[0], original[0]);
	assert.equal(result[1], image);
	assert.deepEqual(result[2], { type: "text", text: "lint advisory" });
	assert.equal(original.length, 2, "input must not be mutated");
});

test("assistantTextFromMessages reads the last assistant text without session internals", () => {
	const text = assistantTextFromMessages([
		{ role: "assistant", content: [{ type: "text", text: "working" }] },
		{ role: "toolResult", content: [{ type: "text", text: "tool" }] },
		{
			role: "assistant",
			content: [{ type: "text", text: "Implemented and verified." }],
		},
	]);
	assert.equal(text, "Implemented and verified.");
});

test("Pi environment helpers honor host and child contracts", () => {
	assert.equal(
		resolvePiAgentDir({
			PI_CODING_AGENT_DIR: "/tmp/custom-pi",
			HOME: "/tmp/home",
		}),
		path.resolve("/tmp/custom-pi"),
	);
	assert.equal(
		resolvePiAgentDir({ HOME: "/tmp/home" }),
		path.join("/tmp/home", ".pi", "agent"),
	);
	assert.equal(isPiSubagent({ PI_SUBAGENT_CHILD: "1" }), true);
	assert.equal(isPiSubagent({}), false);
});

test("do-it-status reports tool registration without inferring agent discovery", async () => {
	const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "do-it-pi-status-"));
	try {
		const absent = fakePi(["read"]);
		createDoItPiExtension({ env: { HOME: cwd } })(absent.api);
		const absentContext = fakeContext(cwd);
		absentContext.hasUI = true;
		await absent.commands.get("do-it-status").handler("", absentContext);
		assert.match(
			absentContext.notices[0].message,
			/subagent tool: not registered/i,
		);
		assert.match(
			absentContext.notices[0].message,
			/extension, skills, and prompts remain active/i,
		);

		const present = fakePi(["read", "subagent"]);
		createDoItPiExtension({ env: { HOME: cwd } })(present.api);
		const presentContext = fakeContext(cwd);
		presentContext.hasUI = true;
		await present.commands.get("do-it-status").handler("", presentContext);
		assert.match(
			presentContext.notices[0].message,
			/subagent tool: registered/i,
		);
		assert.match(
			presentContext.notices[0].message,
			/does not verify do-it\.\*/i,
		);
	} finally {
		rmTemp(cwd);
	}
});

test("advisory hook failures become context instead of rejecting Pi lifecycle", async () => {
	const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "do-it-pi-hook-failure-"));
	const pi = fakePi();
	createDoItPiExtension({
		env: { HOME: cwd },
		runHook: async () => {
			throw new Error("synthetic hook failure");
		},
	})(pi.api);
	const ctx = fakeContext(cwd);
	try {
		const result = await pi.handlers.get("before_agent_start")(
			{ prompt: "implement feature" },
			ctx,
		);
		assert.match(result.message.content, /synthetic hook failure/);
		ctx.hasUI = true;
		await pi.commands.get("do-it-status").handler("", ctx);
		assert.match(
			ctx.notices[0].message,
			/last hook diagnostic:.*synthetic hook failure/s,
		);
	} finally {
		rmTemp(cwd);
	}
});

test("child lifecycle runs only subagent stance", async () => {
	const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "do-it-pi-child-"));
	const calls = [];
	const runHook = async (_hooksDir, scriptName) => {
		calls.push(scriptName);
		return {
			exitCode: 0,
			stdout: "",
			stderr: "",
			additionalContext: `${scriptName}-context`,
		};
	};
	const pi = fakePi();
	createDoItPiExtension({
		env: { HOME: cwd, PI_SUBAGENT_CHILD: "1" },
		dataDir: path.join(cwd, "data"),
		runHook,
	})(pi.api);
	const ctx = fakeContext(cwd, "child-1");

	try {
		const result = await pi.handlers.get("before_agent_start")(
			{ prompt: "delegated task" },
			ctx,
		);
		assert.deepEqual(calls, ["subagent-stance.sh"]);
		assert.match(result.message.content, /subagent-stance\.sh-context/);
		assert.doesNotMatch(result.message.content, /<do-it-bootstrap>/);

		const toolResult = await pi.handlers.get("tool_result")(
			{
				toolName: "edit",
				input: { path: "src/a.ts" },
				content: [{ type: "text", text: "edited" }],
			},
			ctx,
		);
		assert.equal(toolResult, undefined);
        assert.equal(pi.handlers.has("agent_end"), false);
        assert.equal(pi.handlers.has("agent_settled"), false);
		assert.deepEqual(calls, ["subagent-stance.sh"]);
	} finally {
		rmTemp(cwd);
	}
});

test("root bash results are observed without treating isError as proof", async () => {
	const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "do-it-pi-observe-"));
	const calls = [];
	const runHook = async (_hooksDir, scriptName, payload) => {
		calls.push({ scriptName, payload });
		return { exitCode: 0, stdout: "", stderr: "" };
	};
	const pi = fakePi();
	createDoItPiExtension({ env: { HOME: cwd, DO_IT_EVIDENCE_MODE: "observe" }, runHook })(pi.api);
	const ctx = fakeContext(cwd);
	try {
		await pi.handlers.get("tool_result")(
			{
				toolName: "bash",
				input: { command: "npm test" },
				content: [{ type: "text", text: "ok" }],
				details: { exit_code: 0 },
				isError: false,
			},
			ctx,
		);
		assert.deepEqual(
			calls.map((call) => call.scriptName),
			["evidence-observer.sh"],
		);
		assert.equal(calls[0].payload.tool_name, "bash");
		assert.equal(calls[0].payload.tool_input.command, "npm test");
		assert.equal(calls[0].payload.tool_response.exit_code, 0);
		assert.equal(calls[0].payload.tool_response.output, "ok");
	} finally {
		rmTemp(cwd);
	}
});

test("missing evidence observer does not reject Pi tool_result", async () => {
	const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "do-it-pi-observer-missing-"));
	const pi = fakePi();
	createDoItPiExtension({
		env: { HOME: cwd, DO_IT_EVIDENCE_MODE: "observe" },
		runHook: async (_hooksDir, scriptName) => {
			if (scriptName === "evidence-observer.sh") {
				return {
					exitCode: 0,
					stdout: "",
					stderr: "missing",
					diagnostic: "do-it hook skipped: script missing",
					unavailable: true,
				};
			}
			return {
				exitCode: 0,
				stdout: "",
				stderr: "",
				additionalContext: "write-quality-lint.sh-context",
			};
		},
	})(pi.api);
	const ctx = fakeContext(cwd);
	try {
		const result = await pi.handlers.get("tool_result")(
			{
				toolName: "edit",
				input: { path: "src/a.ts" },
				content: [{ type: "text", text: "edited" }],
				isError: false,
			},
			ctx,
		);
		assert.equal(result.content.at(-1).text, "write-quality-lint.sh-context");
	} finally {
		rmTemp(cwd);
	}
});

test("default Pi runtime delivers context and edit checks without diagnostics or completion scanning", async () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "do-it-pi-default-"));
  const calls = [];
  const pi = fakePi();
  const runHook = async (_dir, scriptName) => { calls.push(scriptName); return { exitCode: 0, stdout: "", stderr: "", additionalContext: "context" }; };
  createDoItPiExtension({ env: { HOME: cwd }, runHook })(pi.api);
  const ctx = fakeContext(cwd);
  try {
    await pi.handlers.get("before_agent_start")({ prompt: "fix the helper" }, ctx);
    const image = { type: "image", data: "abc", mimeType: "image/png" };
    const content = [{ type: "text", text: "changed" }, image];
    const result = await pi.handlers.get("tool_result")({ toolName: "edit", input: { path: "a.ts" }, content, details: { kept: true }, isError: false }, ctx);
    assert.equal(result.content[1], image);
    assert.equal(result.isError, false);
    await pi.handlers.get("tool_result")({ toolName: "bash", input: { command: "printf https://example.invalid" }, content: [] }, ctx);
    assert.deepEqual(calls, ["prompt-submit.sh", "write-quality-lint.sh"]);
    assert.equal(pi.handlers.has("agent_settled"), false);
    await pi.handlers.get("session_shutdown")({}, ctx);
  } finally { rmTemp(cwd); }
});
