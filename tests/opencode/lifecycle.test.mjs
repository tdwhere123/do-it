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

test("fake host exercises config, bootstrap, hooks, idle notification, and cleanup", async () => {
	const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "doit-opencode-host-"));
	const data = path.join(cwd, "host-data");
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
		assert.match(messages[0].parts[0].text, /<do-it-bootstrap>/);
		assert.match(
			messages[0].parts[0].text,
			/direct user intent wins over hook heuristics/,
		);
		assert.match(
			messages[0].parts[0].text,
			/Bundled subagents are visible in the host agent list/,
		);
		assert.doesNotMatch(messages[0].parts[0].text, /Light, Standard, or Heavy/);
		await hooks["experimental.chat.messages.transform"]({}, { messages });
		assert.equal(
			messages[0].parts[0].text.match(/<do-it-bootstrap>/g).length,
			1,
		);

		const promptOutput = {
			parts: [
				{
					type: "text",
					text: "Design a migration across packages with several architecture tradeoffs",
				},
			],
		};
		await hooks["chat.message"]({ sessionID }, promptOutput);
		assert.match(
			promptOutput.parts[0].text,
			/Design a migration across packages/,
		);

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
		fs.rmSync(cwd, { recursive: true, force: true });
	}
});

function setRecorderEnabled(cwd, sessionID = "feedback-control") {
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
