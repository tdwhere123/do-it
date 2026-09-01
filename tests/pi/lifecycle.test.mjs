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

test("root lifecycle default thin skips bootstrap, preserves ToolResult arrays, and queues verification", async () => {
	const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "do-it-pi-lifecycle-"));
	const calls = [];
	const runHook = async (_hooksDir, scriptName, payload) => {
		calls.push({ scriptName, payload });
		return {
			exitCode: 0,
			stdout: "",
			stderr: "",
			additionalContext: `${scriptName}-context`,
		};
	};
	const pi = fakePi();
	createDoItPiExtension({
		env: { HOME: cwd },
		dataDir: path.join(cwd, "data"),
		runHook,
	})(pi.api);
	const ctx = fakeContext(cwd);
	ctx.model = { provider: "openrouter", id: "claude-sonnet-4" };

	try {
		await pi.handlers.get("session_start")({}, ctx);
		const first = await pi.handlers.get("before_agent_start")(
			{ prompt: "implement feature" },
			ctx,
		);
		assert.doesNotMatch(first.message.content, /<do-it-bootstrap>/);
		assert.match(first.message.content, /prompt-submit\.sh-context/);
		assert.doesNotMatch(first.message.content, /router\.sh-context/);
		assert.doesNotMatch(first.message.content, /grill-prompt\.sh-context/);
		assert.equal(
			calls.filter((call) => call.scriptName === "prompt-submit.sh").length,
			1,
		);
		assert.equal(calls.filter((call) => call.scriptName === "router.sh").length, 0);
		assert.equal(calls.filter((call) => call.scriptName === "grill-prompt.sh").length, 0);
		assert.equal(
			calls[0].payload.transcript_path,
			path.join(cwd, "session-1.jsonl"),
		);
		assert.equal(calls[0].payload.model, "openrouter/claude-sonnet-4");

		const second = await pi.handlers.get("before_agent_start")(
			{ prompt: "continue" },
			ctx,
		);
		assert.doesNotMatch(second.message.content, /<do-it-bootstrap>/);

		const image = { type: "image", data: "abc", mimeType: "image/png" };
		const toolResult = await pi.handlers.get("tool_result")(
			{
				toolName: "edit",
				input: { path: "src/a.ts" },
				content: [{ type: "text", text: "edited" }, image],
				details: { ok: true },
				isError: false,
			},
			ctx,
		);
		assert.equal(toolResult.content.length, 3);
		assert.equal(toolResult.content[1], image);
		assert.deepEqual(toolResult.details, { ok: true });
		assert.equal(toolResult.isError, false);
		assert.ok(
			calls.some((call) => call.scriptName === "evidence-observer.sh"),
			"root edit must record a canonical evidence fact",
		);
		assert.equal(calls.at(-1).payload.tool_name, "Edit");

		await pi.handlers.get("agent_end")(
			{
				messages: [
					{
						role: "assistant",
						content: [{ type: "text", text: "Fixed the feature." }],
					},
				],
			},
			ctx,
		);
		await pi.handlers.get("agent_settled")({}, ctx);
		assert.ok(
			calls.some((call) => call.scriptName === "verification-gate.sh"),
			"settlement must ask the shared gate / ledger, not process-local success flags",
		);
		const afterSettled = await pi.handlers.get("before_agent_start")(
			{ prompt: "next" },
			ctx,
		);
		assert.match(
			afterSettled.message.content,
			/verification-gate\.sh-context|fresh relevant evidence/i,
		);
	} finally {
		rmTemp(cwd);
	}
});

test("explicit legacy still injects bootstrap once", async () => {
	const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "do-it-pi-legacy-"));
	const runHook = async (_hooksDir, scriptName) => ({
		exitCode: 0,
		stdout: "",
		stderr: "",
		additionalContext: `${scriptName}-context`,
	});
	const pi = fakePi();
	createDoItPiExtension({
		env: { HOME: cwd, DO_IT_ROUTER_MODE: "legacy" },
		dataDir: path.join(cwd, "data"),
		runHook,
	})(pi.api);
	const ctx = fakeContext(cwd);
	try {
		await pi.handlers.get("session_start")({}, ctx);
		const first = await pi.handlers.get("before_agent_start")(
			{ prompt: "implement feature" },
			ctx,
		);
		assert.match(first.message.content, /<do-it-bootstrap>/);
		assert.match(first.message.content, /prompt-submit\.sh-context/);
		const second = await pi.handlers.get("before_agent_start")(
			{ prompt: "continue" },
			ctx,
		);
		assert.doesNotMatch(second.message.content, /<do-it-bootstrap>/);
	} finally {
		rmTemp(cwd);
	}
});

test("shadow and thin skip bootstrap, spawn prompt-submit, and inject the kernel", async () => {
	for (const mode of ["shadow", "thin"]) {
		const cwd = fs.mkdtempSync(path.join(os.tmpdir(), `do-it-pi-${mode}-`));
		const pi = fakePi();
		createDoItPiExtension({
			env: { HOME: cwd, DO_IT_ROUTER_MODE: mode },
			pluginRoot: repoRoot,
		})(pi.api);
		const ctx = fakeContext(cwd, `${mode}-session`);
		ctx.model = { provider: "openrouter", id: "claude-sonnet-4" };
		try {
			await pi.handlers.get("session_start")({}, ctx);
			const first = await pi.handlers.get("before_agent_start")(
				{ prompt: "Implement src/auth.ts token refresh" },
				ctx,
			);
			assert.ok(first?.message?.content, `${mode} must inject prompt context`);
			assert.doesNotMatch(first.message.content, /<do-it-bootstrap>/);
			assert.match(first.message.content, KERNEL_NEEDLE);
			assert.doesNotMatch(first.message.content, /skill:\/\/do-it-core/);
			assert.doesNotMatch(first.message.content, /do-it tier:/);
			if (mode === "thin") {
				assert.doesNotMatch(first.message.content, /do-it grill/);
			}
		} finally {
			rmTemp(cwd);
		}
	}
});

test("thin set after create without env option skips bootstrap and injects the kernel", async () => {
	const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "do-it-pi-thin-late-"));
	const previousMode = process.env.DO_IT_ROUTER_MODE;
	const previousHome = process.env.HOME;
	const pi = fakePi();
	createDoItPiExtension({ pluginRoot: repoRoot })(pi.api);
	process.env.DO_IT_ROUTER_MODE = "thin";
	process.env.HOME = cwd;
	const ctx = fakeContext(cwd, "thin-late-env");
	ctx.model = { provider: "openrouter", id: "claude-sonnet-4" };
	try {
		await pi.handlers.get("session_start")({}, ctx);
		const first = await pi.handlers.get("before_agent_start")(
			{ prompt: "Implement src/auth.ts token refresh" },
			ctx,
		);
		assert.ok(first?.message?.content, "thin must inject prompt context");
		assert.doesNotMatch(first.message.content, /<do-it-bootstrap>/);
		assert.match(first.message.content, KERNEL_NEEDLE);
	} finally {
		if (previousMode === undefined) delete process.env.DO_IT_ROUTER_MODE;
		else process.env.DO_IT_ROUTER_MODE = previousMode;
		if (previousHome === undefined) delete process.env.HOME;
		else process.env.HOME = previousHome;
		rmTemp(cwd);
	}
});

test("verification reminders require a same-turn successful edit and shared completion vocabulary", async () => {
	const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "do-it-pi-verify-"));
	const pi = fakePi();
	createDoItPiExtension({
		env: { HOME: cwd },
		runHook: async (_hooksDir, scriptName) => {
			if (scriptName === "verification-gate.sh") {
				return {
					exitCode: 0,
					stdout: "",
					stderr: "",
					additionalContext:
						"<system-reminder>map each material acceptance item to fresh relevant evidence from this worktree</system-reminder>",
				};
			}
			return { exitCode: 0, stdout: "", stderr: "" };
		},
	})(pi.api);
	const ctx = fakeContext(cwd);
	const editResult = (toolName, isError) =>
		pi.handlers.get("tool_result")(
			{
				toolName,
				input: { path: "src/a.ts" },
				content: [{ type: "text", text: isError ? "failed" : "edited" }],
				details: undefined,
				isError,
			},
			ctx,
		);
	const settle = async (text) => {
		await pi.handlers.get("agent_end")(
			{ messages: [{ role: "assistant", content: text }] },
			ctx,
		);
		await pi.handlers.get("agent_settled")({}, ctx);
		return pi.handlers.get("before_agent_start")({ prompt: "" }, ctx);
	};

	try {
		await pi.handlers.get("before_agent_start")({ prompt: "" }, ctx);

		assert.equal(await settle("Fixed."), undefined, "no edit stays quiet");

		await editResult("edit", true);
		assert.equal(
			await settle("Fixed."),
			undefined,
			"failed edit stays quiet",
		);

		await editResult("write", false);
		assert.equal(
			await settle("Implemented."),
			undefined,
			"Pi-only completion vocabulary stays quiet",
		);
		assert.equal(
			await settle("Fixed."),
			undefined,
			"successful edit state is consumed at settlement",
		);

		await editResult("edit", false);
		const reminder = await settle("Fixed.");
		assert.match(reminder.message.content, /fresh relevant evidence/i);
		assert.equal(
			await pi.handlers.get("before_agent_start")({ prompt: "" }, ctx),
			undefined,
			"queued reminder is consumed once",
		);

		await editResult("multiedit", false);
		assert.equal(
			await settle("Done. NOT_VERIFIED: check unavailable."),
			undefined,
			"NOT_VERIFIED stays quiet",
		);
		assert.equal(
			await settle("Done."),
			undefined,
			"NOT_VERIFIED settlement consumes edit state",
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
		await pi.handlers.get("agent_end")(
			{ messages: [{ role: "assistant", content: "Implemented." }] },
			ctx,
		);
		await pi.handlers.get("agent_settled")({}, ctx);
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
	createDoItPiExtension({ env: { HOME: cwd }, runHook })(pi.api);
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
			["evidence-observer.sh", "network-admission.sh"],
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
		env: { HOME: cwd },
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
