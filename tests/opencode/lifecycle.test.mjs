import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repoRoot = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	"../..",
);
const indexJs = path.join(repoRoot, "plugins/do-it-opencode/dist/index.js");
assert.ok(
	fs.existsSync(indexJs),
	"build plugins/do-it-opencode before running these tests",
);
const { DoItOpencodePlugin, injectedSessions, safeSessionKey } = await import(
	pathToFileURL(indexJs).href
);

function message(info, parts) {
	return { info, parts };
}

test("template does not auto-allow edit, write, or bash", () => {
	const template = JSON.parse(
		fs.readFileSync(
			path.join(repoRoot, "plugins/do-it-opencode/opencode.json.template"),
			"utf8",
		),
	);
	assert.equal(template.permission.skill, "allow");
	assert.equal(Object.hasOwn(template.permission, "edit"), false);
	assert.equal(Object.hasOwn(template.permission, "write"), false);
	assert.equal(Object.hasOwn(template.permission, "bash"), false);
	assert.doesNotMatch(
		JSON.stringify(template),
		/git push|strict-external/i,
		"OpenCode template must not silently opt into the strict external-action profile",
	);
});

// The session-dir resolution order in hooks/lib/common.sh prefers
// DO_IT_HOOK_DATA / CURSOR_PLUGIN_DATA / CLAUDE_PLUGIN_DATA / PLUGIN_DATA over
// OPENCODE_DATA. A runner environment carrying any of those would redirect the
// hooks' session state (and the feedback-recorder dedup state) into a shared
// bucket that persists across runs, making these tests order-dependent. Clear
// them around every test that sets OPENCODE_DATA, mirroring router.test.sh's
// _isolate_state.
const SESSION_ENV_VARS = [
	"DO_IT_HOOK_DATA",
	"CURSOR_PLUGIN_DATA",
	"CLAUDE_PLUGIN_DATA",
	"PLUGIN_DATA",
	"DO_IT_ROUTER_MODE",
];

function isolateSessionEnv() {
	const saved = new Map();
	for (const name of SESSION_ENV_VARS) {
		if (name in process.env) {
			saved.set(name, process.env[name]);
			delete process.env[name];
		}
	}
	return () => {
		for (const [name, value] of saved) process.env[name] = value;
	};
}

test("fake host exercises config, bootstrap, hooks, idle notification, and cleanup", async () => {
	const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "doit-opencode-host-"));
	const data = path.join(cwd, "host-data");
	const restoreEnv = isolateSessionEnv();
	const previousData = process.env.OPENCODE_DATA;
	process.env.OPENCODE_DATA = data;
	const calls = { messages: [], toasts: [] };
	const sessionID = "session/fake-host";

	const host = {
		directory: cwd,
		worktree: cwd,
		client: {
			session: {
				get: async () => ({ data: { id: sessionID } }),
				messages: async (input) => {
					calls.messages.push(input);
					return {
						data: [
							message({ role: "user", sessionID }, [
								{ type: "text", text: "private current prompt" },
							]),
							message({ role: "assistant", sessionID }, [
								{
									type: "tool",
									callID: "edit-1",
									tool: "edit",
									state: {
										status: "completed",
										input: { file_path: "src/a.ts", new_string: "secret" },
										output: "edited",
									},
								},
								{ type: "text", text: "Done with the implementation." },
							]),
						],
					};
				},
			},
			tui: {
				showToast: async (input) => {
					calls.toasts.push(input);
				},
			},
		},
	};

	try {
		const hooks = await DoItOpencodePlugin(host);
		const config = {
			agent: {
				reviewer: {
					description: "user reviewer",
					prompt: "keep me",
					model: "user/model",
				},
			},
		};
		await hooks.config(config);
		assert.ok(
			config.skills.paths.some((entry) =>
				entry.endsWith("plugins/do-it-opencode/skills"),
			),
		);
		assert.deepEqual(config.agent.reviewer, {
			description: "user reviewer",
			prompt: "keep me",
			model: "user/model",
		});
		assert.match(
			config.agent["code-mapper"].prompt,
			/Act as a deep, read-only mapper/,
		);
		assert.match(config.agent["code-mapper"].description, /^Use when /);
		assert.equal(config.agent["code-mapper"].mode, "subagent");
		assert.equal("model" in config.agent["code-mapper"], false);

		const messages = [
			message({ role: "user", sessionID }, [
				{ type: "text", text: "implement this" },
			]),
		];
		await hooks["experimental.chat.messages.transform"]({}, { messages });
		assert.doesNotMatch(messages[0].parts[0].text, /<do-it-bootstrap>/);
		assert.equal(messages[0].parts[0].text, "implement this");
		await hooks["experimental.chat.messages.transform"]({}, { messages });
		assert.doesNotMatch(messages[0].parts[0].text, /<do-it-bootstrap>/);

		const promptOutput = {
			parts: [
				{
					type: "text",
					text: "Implement src/auth.ts token refresh",
				},
			],
		};
		await hooks["chat.message"](
			{
				sessionID,
				model: { providerID: "openrouter", modelID: "claude-sonnet-4" },
			},
			promptOutput,
		);
		assert.match(
			promptOutput.parts[0].text,
			/Implement src\/auth\.ts token refresh/,
		);
		assert.match(
			promptOutput.parts[0].text,
			/Do-it kernel: read current repository truth/,
		);
		assert.doesNotMatch(promptOutput.parts[0].text, /skill:\/\/do-it-core/);
		assert.doesNotMatch(promptOutput.parts[0].text, /do-it tier:/);

		const editOutput = { title: "Edit", output: "edited", metadata: {} };
		await hooks["tool.execute.after"](
			{
				sessionID,
				callID: "edit-1",
				tool: "edit",
				args: { file_path: "src/a.ts" },
			},
			editOutput,
		);
		assert.equal(typeof editOutput.output, "string");

		injectedSessions.add(sessionID);
		await hooks.event({
			event: { type: "session.idle", properties: { sessionID } },
		});
		assert.deepEqual(calls.messages, [
			{ path: { id: sessionID }, query: { directory: cwd, limit: 400 } },
		]);
		assert.equal(calls.toasts.length, 1);
		assert.match(calls.toasts[0].body.message, /verification-gate/);
		assert.equal(calls.toasts[0].body.variant, "warning");
		assert.deepEqual(calls.toasts[0].query, { directory: cwd });
		const verificationPrefix = `do-it-opencode-${safeSessionKey(sessionID)}-`;
		assert.deepEqual(
			fs
				.readdirSync(os.tmpdir())
				.filter((name) => name.startsWith(verificationPrefix)),
			[],
		);

		await hooks.event({
			event: {
				type: "session.deleted",
				properties: { info: { id: sessionID } },
			},
		});
		assert.equal(injectedSessions.has(sessionID), false);

		injectedSessions.add("dispose-me");
		await hooks.dispose();
		assert.equal(injectedSessions.size, 0);
	} finally {
		if (previousData === undefined) delete process.env.OPENCODE_DATA;
		else process.env.OPENCODE_DATA = previousData;
		restoreEnv();
		fs.rmSync(cwd, { recursive: true, force: true });
	}
});

test("shadow and thin skip bootstrap, inject kernel, and omit classifier text", async () => {
	const KERNEL_NEEDLE = /Do-it kernel: read current repository truth/;
	for (const mode of ["shadow", "thin"]) {
		const cwd = fs.mkdtempSync(path.join(os.tmpdir(), `doit-opencode-${mode}-`));
		const data = path.join(cwd, "host-data");
		const restoreEnv = isolateSessionEnv();
		const previousData = process.env.OPENCODE_DATA;
		const previousMode = process.env.DO_IT_ROUTER_MODE;
		process.env.OPENCODE_DATA = data;
		process.env.DO_IT_ROUTER_MODE = mode;
		const sessionID = `session/${mode}-kernel`;
		const host = {
			directory: cwd,
			worktree: cwd,
			client: {
				session: {
					get: async () => ({ data: { id: sessionID } }),
					messages: async () => ({ data: [] }),
				},
				tui: { showToast: async () => {} },
			},
		};
		try {
			const hooks = await DoItOpencodePlugin(host);
			const messages = [
				message({ role: "user", sessionID }, [
					{ type: "text", text: "Implement src/auth.ts token refresh" },
				]),
			];
			await hooks["experimental.chat.messages.transform"]({}, { messages });
			assert.doesNotMatch(messages[0].parts[0].text, /<do-it-bootstrap>/);
			const promptOutput = {
				parts: [
					{
						type: "text",
						text: "Implement src/auth.ts token refresh",
					},
				],
			};
			await hooks["chat.message"](
				{
					sessionID,
					model: { providerID: "openrouter", modelID: "claude-sonnet-4" },
				},
				promptOutput,
			);
			assert.match(promptOutput.parts[0].text, KERNEL_NEEDLE);
			assert.doesNotMatch(promptOutput.parts[0].text, /skill:\/\/do-it-core/);
			assert.doesNotMatch(promptOutput.parts[0].text, /do-it tier:/);
			assert.doesNotMatch(promptOutput.parts[0].text, /<do-it-bootstrap>/);
			if (mode === "thin") {
				assert.doesNotMatch(promptOutput.parts[0].text, /do-it grill/);
			}
			await hooks.dispose();
		} finally {
			if (previousData === undefined) delete process.env.OPENCODE_DATA;
			else process.env.OPENCODE_DATA = previousData;
			if (previousMode === undefined) delete process.env.DO_IT_ROUTER_MODE;
			else process.env.DO_IT_ROUTER_MODE = previousMode;
			restoreEnv();
			fs.rmSync(cwd, { recursive: true, force: true });
		}
	}
});

function initGit(cwd) {
	const env = { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_SYSTEM: "/dev/null" };
	for (const args of [
		["init", "-q"],
		["config", "user.email", "t@e.com"],
		["config", "user.name", "t"],
	]) {
		const result = spawnSync("git", args, { cwd, env, encoding: "utf8" });
		assert.equal(result.status, 0, result.stderr);
	}
	fs.writeFileSync(path.join(cwd, "README"), "base\n");
	assert.equal(
		spawnSync("git", ["add", "README"], { cwd, env, encoding: "utf8" }).status,
		0,
	);
	assert.equal(
		spawnSync("git", ["commit", "-q", "-m", "base"], { cwd, env, encoding: "utf8" })
			.status,
		0,
	);
}

function setRecorderEnabled(cwd, sessionID = "feedback-control") {
	initGit(cwd);
	const hook = path.join(repoRoot, "hooks", "behavior-feedback.sh");
	const result = spawnSync("bash", [hook], {
		cwd,
		input: JSON.stringify({
			session_id: sessionID,
			cwd,
			prompt: "/do-it-retrospective on",
		}),
		encoding: "utf8",
	});
	assert.equal(result.status, 0, result.stderr);
	const config = path.join(
		cwd,
		".do-it",
		"runtime",
		"retrospective",
		"config.json",
	);
	assert.equal(
		JSON.parse(fs.readFileSync(config, "utf8")).enabled,
		true,
		"control command should enable the recorder",
	);
}

function feedbackHost(cwd, sessionID, parentID) {
	const calls = { get: 0 };
	return {
		directory: cwd,
		worktree: cwd,
		client: {
			session: {
				get: async () => {
					calls.get += 1;
					return { data: { id: sessionID, ...(parentID ? { parentID } : {}) } };
				},
			},
			tui: { showToast: async () => undefined },
		},
		calls,
	};
}

test("feedback capture uses OpenCode parentage and never records a child session", async () => {
	const rootCwd = fs.mkdtempSync(
		path.join(os.tmpdir(), "doit-opencode-feedback-root-"),
	);
	const childCwd = fs.mkdtempSync(
		path.join(os.tmpdir(), "doit-opencode-feedback-child-"),
	);
	const previousData = process.env.OPENCODE_DATA;
	process.env.OPENCODE_DATA = path.join(rootCwd, "host-data");
	const restoreEnv = isolateSessionEnv();
	try {
		const rootSession = "session/feedback-root";
		setRecorderEnabled(rootCwd, rootSession);
		const rootHost = feedbackHost(rootCwd, rootSession);
		const rootHooks = await DoItOpencodePlugin(rootHost);
		await rootHooks["chat.message"](
			{ sessionID: rootSession },
			{
				parts: [
					{
						type: "text",
						text: "do-it behavior is unexpected: delegation was missed",
					},
				],
			},
		);
		assert.equal(
			rootHost.calls.get,
			1,
			"enabled root recorder should query session parentage",
		);
		const rootEvents = path.join(
			rootCwd,
			".do-it",
			"runtime",
			"retrospective",
			"events.jsonl",
		);
		assert.ok(
			fs.existsSync(rootEvents),
			"root session should be eligible for opt-in feedback capture",
		);

		const childSession = "session/feedback-child";
		setRecorderEnabled(childCwd, childSession);
		const childHost = feedbackHost(childCwd, childSession, "session/parent");
		const childHooks = await DoItOpencodePlugin(childHost);
		await childHooks["chat.message"](
			{ sessionID: childSession },
			{
				parts: [
					{
						type: "text",
						text: "do-it behavior is unexpected: delegation was missed",
					},
				],
			},
		);
		assert.equal(
			childHost.calls.get,
			1,
			"enabled child recorder should query session parentage",
		);
		const childEvents = path.join(
			childCwd,
			".do-it",
			"runtime",
			"retrospective",
			"events.jsonl",
		);
		assert.equal(
			fs.existsSync(childEvents),
			false,
			"child session must not be recorded",
		);
	} finally {
		if (previousData === undefined) delete process.env.OPENCODE_DATA;
		else process.env.OPENCODE_DATA = previousData;
		restoreEnv();
		fs.rmSync(rootCwd, { recursive: true, force: true });
		fs.rmSync(childCwd, { recursive: true, force: true });
	}
});

test("idle notifies when session payload cannot synthesize a transcript", async () => {
	const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "doit-opencode-bad-idle-"));
	const calls = { toasts: [] };
	const sessionID = "session/bad-shape";
	const host = {
		directory: cwd,
		worktree: cwd,
		client: {
			session: {
				get: async () => ({ data: { id: sessionID } }),
				messages: async () => ({
					data: [
						// Assistant-only window: edits + completion, but no user boundary.
						message({ role: "assistant", sessionID }, [
							{
								type: "tool",
								callID: "edit-1",
								tool: "edit",
								state: {
									status: "completed",
									input: { file_path: "src/a.ts" },
									output: "edited",
								},
							},
							{ type: "text", text: "Done with the implementation." },
						]),
					],
				}),
			},
			tui: {
				showToast: async (input) => {
					calls.toasts.push(input);
				},
			},
		},
	};

	try {
		const hooks = await DoItOpencodePlugin(host);
		await hooks.event({
			event: { type: "session.idle", properties: { sessionID } },
		});
		assert.equal(calls.toasts.length, 1);
		assert.match(
			calls.toasts[0].body.message,
			/could not synthesize transcript|NOT_VERIFIED/,
		);
	} finally {
		fs.rmSync(cwd, { recursive: true, force: true });
	}
});

test("tool.execute.after records edit and shell facts; missing exit is partial", async () => {
	const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "doit-opencode-observe-"));
	const restoreEnv = isolateSessionEnv();
	const previousData = process.env.OPENCODE_DATA;
	const previousGitDir = process.env.GIT_DIR;
	const previousGitWorkTree = process.env.GIT_WORK_TREE;
	delete process.env.GIT_DIR;
	delete process.env.GIT_WORK_TREE;
	process.env.OPENCODE_DATA = path.join(cwd, "host-data");
	spawnSync("git", ["init", "-q"], { cwd });
	spawnSync("git", ["config", "user.email", "t@e.com"], { cwd });
	spawnSync("git", ["config", "user.name", "t"], { cwd });
	fs.writeFileSync(path.join(cwd, "README"), "base\n");
	spawnSync("git", ["add", "README"], { cwd });
	spawnSync("git", ["commit", "-q", "-m", "base"], { cwd });

	const host = {
		directory: cwd,
		worktree: cwd,
		client: {
			session: { get: async () => ({ data: { id: "s-obs" } }) },
			tui: { showToast: async () => undefined }
		}
	};

	try {
		const hooks = await DoItOpencodePlugin(host);
		await hooks["tool.execute.after"](
			{
				sessionID: "s-obs",
				callID: "edit-1",
				tool: "edit",
				args: { file_path: path.join(cwd, "README") }
			},
			{ title: "Edit", output: "edited", metadata: {} }
		);
		await hooks["tool.execute.after"](
			{
				sessionID: "s-obs",
				callID: "bash-1",
				tool: "bash",
				args: { command: "npm test" }
			},
			{ title: "Bash", output: "ok", metadata: { exit_code: 0 } }
		);
		const withExit = path.join(cwd, ".do-it", "runtime", "events", "evidence.jsonl");
		assert.ok(fs.existsSync(withExit), "observer must write the canonical ledger");
		const rows = fs
			.readFileSync(withExit, "utf8")
			.trim()
			.split("\n")
			.map((line) => JSON.parse(line));
		assert.equal(rows[0].schema, 1);
		assert.equal(rows[0].kind, "edit");
		assert.equal(rows[0].source, "observed");
		assert.equal(rows[1].kind, "test");
		assert.equal(rows[1].exit_code, 0);
		assert.equal(rows[1].host, "opencode");

		const other = fs.mkdtempSync(path.join(os.tmpdir(), "doit-opencode-partial-"));
		spawnSync("git", ["init", "-q"], { cwd: other });
		spawnSync("git", ["config", "user.email", "t@e.com"], { cwd: other });
		spawnSync("git", ["config", "user.name", "t"], { cwd: other });
		fs.writeFileSync(path.join(other, "README"), "base\n");
		spawnSync("git", ["add", "README"], { cwd: other });
		spawnSync("git", ["commit", "-q", "-m", "base"], { cwd: other });
		const partialHost = {
			directory: other,
			worktree: other,
			client: {
				session: { get: async () => ({ data: { id: "s-partial" } }) },
				tui: { showToast: async () => undefined }
			}
		};
		const partialHooks = await DoItOpencodePlugin(partialHost);
		await partialHooks["tool.execute.after"](
			{
				sessionID: "s-partial",
				callID: "bash-2",
				tool: "bash",
				args: { command: "npm test" }
			},
			{ title: "Bash", output: "host omitted the exit code", metadata: {} }
		);
		const partialLine = JSON.parse(
			fs.readFileSync(
				path.join(other, ".do-it", "runtime", "events", "evidence.jsonl"),
				"utf8"
			).trim()
		);
		assert.equal(partialLine.kind, "test");
		assert.equal(Object.hasOwn(partialLine, "exit_code"), false);
		assert.equal(partialLine.worktree.coverage, "partial");
		fs.rmSync(other, { recursive: true, force: true });
	} finally {
		if (previousData === undefined) delete process.env.OPENCODE_DATA;
		else process.env.OPENCODE_DATA = previousData;
		if (previousGitDir === undefined) delete process.env.GIT_DIR;
		else process.env.GIT_DIR = previousGitDir;
		if (previousGitWorkTree === undefined) delete process.env.GIT_WORK_TREE;
		else process.env.GIT_WORK_TREE = previousGitWorkTree;
		restoreEnv();
		fs.rmSync(cwd, { recursive: true, force: true });
	}
});
