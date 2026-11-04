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
	piSessionRole,
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

function fakePi(toolNames = ["read", "subagent"], role) {
	const handlers = new Map();
	const commands = new Map();
	return {
		handlers,
		commands,
		api: {
			events: {
				emit(name, request) {
					if (name === "subagents:session-context" && role) {
						request.reply({ version: 1, runtime: "@tintinweb/pi-subagents", role });
					}
				},
			},
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
			getHeader() {
				return { type: "session", id: sessionId };
			},
			getSessionId() {
				return sessionId;
			},
			getSessionFile() {
				return path.join(cwd, `${sessionId}.jsonl`);
			},
			appendCustomEntry() {},
			buildSessionProjection() { return { messages: [] }; },
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

		for (const toolName of ["subagent", "Agent"]) {
			const present = fakePi(["read", toolName]);
			createDoItPiExtension({ env: { HOME: cwd } })(present.api);
			const presentContext = fakeContext(cwd);
			presentContext.hasUI = true;
			await present.commands.get("do-it-status").handler("", presentContext);
			assert.match(presentContext.notices[0].message, /subagent tool: registered/i);
			assert.match(presentContext.notices[0].message, /does not verify package-agent discovery or source/i);
			assert.match(presentContext.notices[0].message, /session role: unmarked/);
			assert.match(presentContext.notices[0].message, /unpatched Tintinweb children are unsupported/);
		}
	} finally {
		rmTemp(cwd);
	}
});

test("session identity requires the runtime's versioned response, not tools or lineage", () => {
	for (const role of ["root", "child"]) {
		for (const tools of [[], ["Agent"], ["subagent"]]) {
			assert.equal(piSessionRole({}, fakePi(tools, role).api), role);
		}
	}
	assert.equal(piSessionRole({}, fakePi(["Agent"]).api), "unmarked");
	for (const reply of [null, {}, { version: 2, runtime: "@tintinweb/pi-subagents", role: "child" },
		{ version: 1, runtime: "another-runtime", role: "child" }]) {
		assert.equal(piSessionRole({}, { events: { emit: (_name, request) => request.reply(reply) } }), "unmarked");
	}
});

for (const role of ["root", "child"]) {
	test(`${role} identity selects hooks even with nested Agent and parent lineage`, async () => {
		const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "do-it-pi-identity-"));
		const calls = [];
		const pi = fakePi(["read", "edit", "Agent"], role);
		createDoItPiExtension({
			env: { HOME: cwd, DO_IT_EVIDENCE_MODE: "observe" },
			runHook: async (_dir, script) => {
				calls.push(script);
				return { exitCode: 0, stdout: "", stderr: "", additionalContext: script };
			},
		})(pi.api);
		const ctx = fakeContext(cwd);
		ctx.sessionManager.getHeader = () => ({ parentSession: "/tmp/parent.jsonl" });
		try {
			const result = await pi.handlers.get("before_agent_start")({ prompt: "assigned task" }, ctx);
			assert.equal(result.message.content, role === "child" ? "subagent-stance.sh" : "prompt-submit.sh");
			await pi.handlers.get("tool_result")({ toolName: "edit", input: {}, content: [] }, ctx);
			assert.deepEqual(calls, role === "child" ? ["subagent-stance.sh"] : ["prompt-submit.sh", "evidence-observer.sh", "write-quality-lint.sh"]);
		} finally { rmTemp(cwd); }
	});
}

test("in-process child delivers real shell stance with a subprocess-only child flag", async () => {
	const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "do-it-pi-native-stance-"));
	const previousChildFlag = process.env.PI_SUBAGENT_CHILD;
	const env = { ...process.env, HOME: cwd, PI_CODING_AGENT_DIR: cwd, PI_SUBAGENT_CHILD: "" };
	const pi = fakePi(["read", "Agent"], "child");
	createDoItPiExtension({ env, pluginRoot: path.join(repoRoot, "plugins/do-it-pi") })(pi.api);
	try {
		const result = await pi.handlers.get("before_agent_start")({ prompt: "inspect assigned files" }, fakeContext(cwd));
		assert.equal(result?.message.customType, "do-it");
		assert.match(result.message.content, /do-it subagent stance:/);
		assert.doesNotMatch(result.message.content, KERNEL_NEEDLE);
		assert.equal(env.PI_SUBAGENT_CHILD, "");
		assert.equal(process.env.PI_SUBAGENT_CHILD, previousChildFlag);
	} finally { rmTemp(cwd); }
});

test("child stance dedupe requires an actually persisted delivery, not a launch or diagnostic", async () => {
	const pi = fakePi([], "child");
	const ctx = fakeContext("/tmp/stance-receipt");
	const messages = [];
	ctx.sessionManager.buildSessionProjection = () => ({ messages });
	let calls = 0;
	createDoItPiExtension({ env: { HOME: os.tmpdir() }, runHook: async () => {
		calls++;
		return calls === 1 ? { exitCode: 124, diagnostic: "interrupted" }
			: { exitCode: 0, additionalContext: "delivered stance" };
	} })(pi.api);
	const run = () => pi.handlers.get("before_agent_start")({ prompt: "resume" }, ctx);
	const diagnostic = await run();
	messages.push({ role: "custom", ...diagnostic.message });
	assert.equal(diagnostic.message.details.doIt.kind, "diagnostic");
	await run(); // Successful output lost before the SDK commits the message.
	const delivered = await run();
	assert.equal(calls, 3);
	messages.push({ role: "custom", ...delivered.message });
	assert.equal(await run(), undefined);
	assert.equal(calls, 3);
});

for (const role of ["root", "child"]) {
	test(`${role} context reconciles owned reminders without changing history or user content`, () => {
		const pi = fakePi([], role);
		createDoItPiExtension({ env: { HOME: os.tmpdir() } })(pi.api);
		const stance = "<system-reminder>\ndo-it subagent stance: historical authorization\n</system-reminder>";
		const root = { role: "custom", customType: "do-it", content: "Do-it: Preserve the user's goal, historical root" };
		const legacy = { role: "custom", customType: "do-it", content: stance };
		const modern = { role: "custom", customType: "do-it", content: "owned stance", details: { doIt: { version: 1, role: "child", kind: "stance" } } };
		const user = { role: "user", content: stance };
		const foreign = { role: "custom", customType: "another-extension", content: stance };
		const unknown = { role: "custom", customType: "do-it", content: `Quoted example: ${stance}` };
		const messages = Object.freeze([root, legacy, modern, user, foreign, unknown].map(Object.freeze));
		const snapshot = JSON.stringify(messages);
		const result = pi.handlers.get("context")({ messages }).messages;
		assert.deepEqual(result, role === "root" ? [root, user, foreign, unknown] : [legacy, modern, user, foreign, unknown]);
		assert.equal(JSON.stringify(messages), snapshot);
	});
}

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
    const structuredContent = { changed: true, count: 1 };
    const result = await pi.handlers.get("tool_result")({ toolName: "edit", input: { path: "a.ts" }, content, details: { kept: true }, structuredContent, isError: false }, ctx);
    assert.equal(result.content[1], image);
    assert.equal(result.structuredContent, structuredContent);
    assert.equal(result.isError, false);
    await pi.handlers.get("tool_result")({ toolName: "bash", input: { command: "printf https://example.invalid" }, content: [] }, ctx);
    assert.deepEqual(calls, ["prompt-submit.sh", "write-quality-lint.sh"]);
    assert.equal(pi.handlers.has("agent_settled"), false);
    await pi.handlers.get("session_shutdown")({}, ctx);
  } finally { rmTemp(cwd); }
});

test("session shutdown terminates only hooks owned by that extension instance", { skip: process.platform === "win32" }, async () => {
	const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "do-it-pi-owners-"));
	const hookDir = path.join(cwd, "hooks");
	fs.mkdirSync(hookDir);
	fs.writeFileSync(path.join(hookDir, "prompt-submit.sh"),
		'#!/usr/bin/env bash\nsleep 0.5\nprintf \'%s\\n\' \'{"hookSpecificOutput":{"additionalContext":"completed"}}\'\n',
		{ mode: 0o700 });
	const first = fakePi();
	const second = fakePi();
	const extension = createDoItPiExtension({ env: { ...process.env, HOME: cwd }, pluginRoot: cwd });
	extension(first.api);
	extension(second.api);
	try {
		const firstRun = first.handlers.get("before_agent_start")({ prompt: "first" }, fakeContext(cwd, "first"));
		const secondRun = second.handlers.get("before_agent_start")({ prompt: "second" }, fakeContext(cwd, "second"));
		await first.handlers.get("session_shutdown")();
		assert.match((await firstRun).message.content, /aborted/);
		assert.equal((await secondRun).message.content, "completed");
		await second.handlers.get("session_shutdown")();
	} finally {
		rmTemp(cwd);
	}
});

for (const child of [false, true]) {
	test(`custom-message agent starts preserve ${child ? "child stance" : "root prompt isolation"}`, async () => {
		const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "do-it-pi-custom-start-"));
		const calls = [];
		const pi = fakePi();
		createDoItPiExtension({
			env: { HOME: cwd, PI_SUBAGENT_CHILD: child ? "1" : "" },
			runHook: async (_hooksDir, scriptName, payload) => {
				calls.push({ scriptName, prompt: payload.prompt });
				return { exitCode: 0, stdout: "", stderr: "", additionalContext: "child stance" };
			},
		})(pi.api);
		try {
			const result = await pi.handlers.get("before_agent_start")({
				type: "before_agent_start",
				messageType: "custom",
				message: { role: "custom", customType: "notification", content: "background update", display: false, timestamp: 0 },
				systemPrompt: "",
				systemPromptOptions: {},
			}, fakeContext(cwd));
			assert.deepEqual(calls, child ? [{ scriptName: "subagent-stance.sh", prompt: "" }] : []);
			if (child) assert.equal(result.message.content, "child stance");
			else assert.equal(result, undefined);
		} finally {
			rmTemp(cwd);
		}
	});
}
