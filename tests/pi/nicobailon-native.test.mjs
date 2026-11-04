import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const plugin = path.join(root, "plugins/do-it-pi");
const nicobailonRoot = path.join(plugin, "node_modules/pi-subagents");
const nicobailonEntry = path.join(nicobailonRoot, "index.ts");
const nicobailonAgents = path.join(nicobailonRoot, "src/agents/agents.ts");
const doItExtension = path.join(plugin, "extensions/index.ts");
const childFauxFixture = path.join(
	root,
	"tests/pi/fixtures/nicobailon-child-faux.ts",
);
const piCli = path.join(
	plugin,
	"node_modules/@earendil-works/pi-coding-agent/dist/bundle/cli.js",
);
const skipWin = process.platform === "win32";
const expectedPackageNames = fs
	.readdirSync(path.join(root, "agents"))
	.filter((name) => name.endsWith(".toml"))
	.map((name) => `do-it.${name.replace(/\.toml$/, "")}`)
	.sort();

function sleep(ms) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function processAlive(pid) {
	if (!Number.isInteger(pid) || pid <= 1) return false;
	try {
		process.kill(pid, 0);
		return true;
	} catch (error) {
		if (error.code === "ESRCH") return false;
		if (error.code === "EPERM") return true;
		throw error;
	}
}

async function waitForFile(filePath, timeoutMs, label) {
	const started = Date.now();
	while (!fs.existsSync(filePath)) {
		assert.ok(Date.now() - started < timeoutMs, `timed out waiting for ${label}`);
		await sleep(25);
	}
	return fs.readFileSync(filePath, "utf8");
}

async function ensureDead(pid) {
	if (!processAlive(pid) || pid === process.pid) return;
	try {
		process.kill(pid, "SIGTERM");
	} catch {
		return;
	}
	const started = Date.now();
	while (processAlive(pid) && Date.now() - started < 1000) await sleep(25);
	if (processAlive(pid)) {
		try {
			process.kill(pid, "SIGKILL");
		} catch {
			// Best-effort leftover cleanup.
		}
	}
}

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

function withIsolatedEnv(values, fn) {
	const previous = {};
	for (const key of Object.keys(values)) {
		previous[key] = process.env[key];
		if (values[key] === undefined) delete process.env[key];
		else process.env[key] = values[key];
	}
	return fn().finally(() => {
		for (const key of Object.keys(values)) {
			if (previous[key] === undefined) delete process.env[key];
			else process.env[key] = previous[key];
		}
	});
}

function createHarness() {
	const home = fs.mkdtempSync(path.join(os.tmpdir(), "do-it-nico-native-home-"));
	const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "do-it-nico-native-cwd-"));
	const agentDir = path.join(home, ".pi", "agent");
	const factsPath = path.join(cwd, "child-facts.json");
	const readyPath = path.join(cwd, "child-ready.json");
	const spawnLog = path.join(cwd, "spawn.log");
	const wrapper = path.join(cwd, "pi-1.5");
	fs.mkdirSync(path.join(agentDir, "extensions"), { recursive: true });
	fs.writeFileSync(
		path.join(agentDir, "settings.json"),
		`${JSON.stringify({ packages: [plugin] }, null, 2)}\n`,
	);
	fs.writeFileSync(
		path.join(cwd, "AGENTS.md"),
		"# Project Constraints\n\nNICO_PROJECT_CONSTRAINT_MARKER: keep mapping read-only.\n",
	);
	fs.writeFileSync(path.join(cwd, "example.ts"), "export const probed = true;\n");
	fs.copyFileSync(
		childFauxFixture,
		path.join(agentDir, "extensions", "nicobailon-child-faux.ts"),
	);
	fs.writeFileSync(
		wrapper,
		`#!/bin/sh\nset -eu\nif [ -n "\${DO_IT_NICO_SPAWN_LOG:-}" ]; then\n  echo "child=\${PI_SUBAGENT_CHILD-}" >> "\${DO_IT_NICO_SPAWN_LOG}"\n  echo "agent=\${PI_SUBAGENT_CHILD_AGENT-}" >> "\${DO_IT_NICO_SPAWN_LOG}"\n  echo "cli=\${DO_IT_NICO_PI_CLI-}" >> "\${DO_IT_NICO_SPAWN_LOG}"\nfi\nexec "\${DO_IT_NICO_NODE}" "\${DO_IT_NICO_PI_CLI}" "$@"\n`,
		{ mode: 0o755 },
	);
	return { home, cwd, agentDir, factsPath, readyPath, spawnLog, wrapper };
}

const isolatedKeys = (harness, extra = {}) => ({
	HOME: harness.home,
	USERPROFILE: harness.home,
	PI_CODING_AGENT_DIR: harness.agentDir,
	PI_OFFLINE: "1",
	PI_SKIP_VERSION_CHECK: "1",
	PI_TELEMETRY: "0",
	PI_SUBAGENT_PI_BINARY: harness.wrapper,
	DO_IT_NICO_NODE: process.execPath,
	DO_IT_NICO_PI_CLI: piCli,
	DO_IT_NICO_SPAWN_LOG: harness.spawnLog,
	DO_IT_NICO_CHILD_FACTS: harness.factsPath,
	DO_IT_NICO_CHILD_READY: harness.readyPath,
	DO_IT_NICO_CHILD_DELAY_MS: "0",
	ANTHROPIC_API_KEY: undefined,
	OPENAI_API_KEY: undefined,
	...extra,
});

test("installed nicobailon 0.35.1 is a distinct TypeScript package on Pi 1.5", () => {
	const pkg = JSON.parse(
		fs.readFileSync(path.join(nicobailonRoot, "package.json"), "utf8"),
	);
	const sdk = JSON.parse(
		fs.readFileSync(
			path.join(plugin, "node_modules/@earendil-works/pi-coding-agent/package.json"),
			"utf8",
		),
	);
	assert.equal(pkg.name, "pi-subagents");
	assert.equal(pkg.version, "0.35.1");
	assert.equal(pkg.exports["."], "./index.ts");
	assert.equal(fs.existsSync(nicobailonEntry), true);
	assert.equal(sdk.version, "1.5.0");
	assert.equal(fs.existsSync(piCli), true);
	assert.notEqual(pkg.name, "@tintinweb/pi-subagents");
});

test(
	"nicobailon 0.35.1 discovers package roles as do-it.* from the plugin declaration",
	{ skip: skipWin },
	() => {
		const harness = createHarness();
		try {
			const require = createRequire(import.meta.url);
			const jitiUrl = pathToFileURL(
				require.resolve("jiti", { paths: [plugin] }),
			).href;
			const script = `
				import { createJiti } from ${JSON.stringify(jitiUrl)};
				const jiti = createJiti(import.meta.url, { fsCache: false, moduleCache: false });
				const { discoverAgentsAll } = await jiti.import(${JSON.stringify(nicobailonAgents)});
				const result = discoverAgentsAll(${JSON.stringify(harness.cwd)});
				console.log(JSON.stringify(result.package.map((agent) => ({
					name: agent.name,
					source: agent.source,
					filePath: agent.filePath,
				})).sort((a, b) => a.name.localeCompare(b.name))));
			`;
			const discovered = spawnSync(
				process.execPath,
				["--input-type=module", "--eval", script],
				{
					cwd: harness.cwd,
					encoding: "utf8",
					env: {
						...process.env,
						...isolatedKeys(harness),
						NODE_NO_WARNINGS: "1",
					},
				},
			);
			assert.equal(discovered.status, 0, discovered.stderr || discovered.stdout);
			const agents = JSON.parse(discovered.stdout.trim());
			assert.deepEqual(
				agents.map((agent) => agent.name),
				expectedPackageNames,
			);
			for (const agent of agents) {
				assert.equal(agent.source, "package", agent.name);
				assert.equal(
					agent.filePath.startsWith(path.join(plugin, "agents") + path.sep),
					true,
					agent.filePath,
				);
			}
		} finally {
			rmTemp(harness.home);
			rmTemp(harness.cwd);
		}
	},
);

test(
	"native Pi 1.5 child executes do-it.code-mapper through nicobailon subagent",
	{ skip: skipWin, timeout: 90_000 },
	async () => {
		const sdk = await import(
			pathToFileURL(path.join(plugin, "node_modules/@earendil-works/pi-coding-agent/dist/index.js")).href
		);
		const ai = await import(
			pathToFileURL(path.join(plugin, "node_modules/@earendil-works/pi-ai/dist/index.js")).href
		);
		const harness = createHarness();
		await withIsolatedEnv(isolatedKeys(harness), async () => {
			const fake = ai.fauxProvider();
			fake.setResponses([
				ai.fauxAssistantMessage(
					ai.fauxToolCall("subagent", {
						agent: "do-it.code-mapper",
						task: "Map example.ts ownership in one sentence.",
						timeoutMs: 45_000,
					}),
					{ stopReason: "toolUse" },
				),
				ai.fauxAssistantMessage("parent-after-child"),
			]);
			const runtime = await sdk.ModelRuntime.create({
				authPath: path.join(harness.cwd, "auth.json"),
				allowModelNetwork: false,
			});
			runtime.registerNativeProvider(fake.provider);
			const settings = sdk.SettingsManager.inMemory({
				compaction: { enabled: false },
				retry: { enabled: false },
			});
			const loader = new sdk.DefaultResourceLoader({
				cwd: harness.cwd,
				agentDir: harness.agentDir,
				settingsManager: settings,
				noExtensions: true,
				noSkills: true,
				noPromptTemplates: true,
				noThemes: true,
				noContextFiles: true,
				additionalExtensionPaths: [nicobailonEntry, doItExtension],
			});
			let session;
			try {
				await loader.reload();
				assert.deepEqual(loader.getExtensions().errors, []);
				({ session } = await sdk.createAgentSession({
					cwd: harness.cwd,
					agentDir: harness.agentDir,
					modelRuntime: runtime,
					model: fake.getModel(),
					resourceLoader: loader,
					settingsManager: settings,
					sessionManager: sdk.SessionManager.inMemory(harness.cwd),
				}));
				await session.bindExtensions({});
				assert.equal(session.getActiveToolNames().includes("subagent"), true);
				let toolResult;
				session.subscribe((event) => {
					if (event.type === "tool_execution_end" && event.toolName === "subagent") {
						toolResult = event.result;
					}
				});
				await session.prompt("Delegate mapping to the package code-mapper.");
				assert.equal(fake.state.callCount, 2);
				assert.equal(session.getLastAssistantText(), "parent-after-child");
				assert.notEqual(toolResult?.isError, true);
				assert.equal(
					toolResult?.content?.some(
						(part) => part.type === "text" && part.text.includes("NICO_CHILD_OK"),
					),
					true,
					JSON.stringify(toolResult?.content),
				);
				assert.equal(toolResult?.details?.mode, "single");
				assert.equal(toolResult?.details?.results?.[0]?.agent, "do-it.code-mapper");
				assert.equal(toolResult?.details?.results?.[0]?.exitCode, 0);
				assert.equal(toolResult?.details?.results?.[0]?.model, "faux/faux-1");
				assert.ok(toolResult?.details?.results?.[0]?.acceptance, "nicobailon overlays attested acceptance on read-only roles");
				assert.equal(fs.existsSync(harness.factsPath), true);
				const facts = JSON.parse(fs.readFileSync(harness.factsPath, "utf8"));
				assert.equal(facts.child, "1");
				assert.equal(facts.agent, "do-it.code-mapper");
				assert.equal(facts.inheritProject, "1");
				assert.equal(facts.inheritSkills, "0");
				assert.deepEqual(facts.toolNames, [
					"bash",
					"contact_supervisor",
					"intercom",
					"read",
				]);
				assert.equal(facts.hasStance, true);
				assert.equal(facts.hasRootKernel, false);
				assert.equal(facts.hasProjectConstraint, true);
				assert.equal(facts.hasCodeMapper, true);
				assert.equal(facts.hasChildBoundary, true);
				const spawn = fs.readFileSync(harness.spawnLog, "utf8");
				assert.match(spawn, /^child=1$/m);
				assert.match(spawn, /^agent=do-it\.code-mapper$/m);
				assert.equal(spawn.includes(`cli=${piCli}`), true, spawn);
				const parentDoIt = session.messages.filter(
					(message) => message.role === "custom" && message.customType === "do-it",
				);
				assert.ok(parentDoIt.length > 0, "root session must receive do-it prompt context");
				assert.match(String(parentDoIt[0].content), /Preserve the user's goal/);
				assert.doesNotMatch(String(parentDoIt[0].content), /do-it subagent stance/);
				assert.equal(session.getActiveToolNames().includes("subagent"), true);
			} finally {
				session?.dispose();
				rmTemp(harness.home);
				rmTemp(harness.cwd);
			}
		});
	},
);

test(
	"aborting a nicobailon child leaves the parent session usable",
	{ skip: skipWin, timeout: 90_000 },
	async () => {
		const sdk = await import(
			pathToFileURL(path.join(plugin, "node_modules/@earendil-works/pi-coding-agent/dist/index.js")).href
		);
		const ai = await import(
			pathToFileURL(path.join(plugin, "node_modules/@earendil-works/pi-ai/dist/index.js")).href
		);
		const harness = createHarness();
		let childPid;
		await withIsolatedEnv(
			isolatedKeys(harness, { DO_IT_NICO_CHILD_DELAY_MS: "20000" }),
			async () => {
				const fake = ai.fauxProvider();
				fake.setResponses([
					ai.fauxAssistantMessage(
						ai.fauxToolCall("subagent", {
							agent: "do-it.code-mapper",
							task: "Map example.ts ownership in one sentence.",
							timeoutMs: 25_000,
						}),
						{ stopReason: "toolUse" },
					),
				]);
				const runtime = await sdk.ModelRuntime.create({
					authPath: path.join(harness.cwd, "auth.json"),
					allowModelNetwork: false,
				});
				runtime.registerNativeProvider(fake.provider);
				const settings = sdk.SettingsManager.inMemory({
					compaction: { enabled: false },
					retry: { enabled: false },
				});
				const loader = new sdk.DefaultResourceLoader({
					cwd: harness.cwd,
					agentDir: harness.agentDir,
					settingsManager: settings,
					noExtensions: true,
					noSkills: true,
					noPromptTemplates: true,
					noThemes: true,
					noContextFiles: true,
					additionalExtensionPaths: [nicobailonEntry, doItExtension],
				});
				let session;
				let toolResult;
				try {
					await loader.reload();
					({ session } = await sdk.createAgentSession({
						cwd: harness.cwd,
						agentDir: harness.agentDir,
						modelRuntime: runtime,
						model: fake.getModel(),
						resourceLoader: loader,
						settingsManager: settings,
						sessionManager: sdk.SessionManager.inMemory(harness.cwd),
					}));
					await session.bindExtensions({});
					session.subscribe((event) => {
						if (event.type === "tool_execution_end" && event.toolName === "subagent") {
							toolResult = event.result;
						}
					});
					const pending = session.prompt("Delegate mapping.");
					const ready = JSON.parse(
						await waitForFile(harness.readyPath, 15_000, "child fake-provider handshake"),
					);
					childPid = ready.pid;
					assert.equal(typeof childPid, "number");
					assert.notEqual(childPid, process.pid);
					assert.equal(ready.child, "1");
					assert.equal(ready.agent, "do-it.code-mapper");
					assert.equal(processAlive(childPid), true, "handshake pid must be a live child");
					assert.equal(fs.existsSync(harness.factsPath), false, "completion facts must not exist before abort");
					await session.abort();
					await pending.catch(() => {});
					const waitStart = Date.now();
					while (processAlive(childPid) && !fs.existsSync(harness.factsPath) && Date.now() - waitStart < 10_000) {
						await sleep(25);
					}
					if (fs.existsSync(harness.factsPath)) {
						const facts = JSON.parse(fs.readFileSync(harness.factsPath, "utf8"));
						assert.notEqual(
							facts.completed,
							true,
							"abort must cancel the child before normal fake-provider completion",
						);
					}
					assert.equal(
						processAlive(childPid),
						false,
						"child process must exit after abort rather than finish the delayed reply",
					);
					const resultText = JSON.stringify(toolResult ?? {});
					assert.equal(resultText.includes("NICO_CHILD_OK"), false, resultText);
					const childResult = toolResult?.details?.results?.[0];
					const cancelled =
						toolResult?.isError === true ||
						childResult?.interrupted === true ||
						(typeof childResult?.exitCode === "number" && childResult.exitCode !== 0);
					assert.equal(
						cancelled,
						true,
						`missing cancellation metadata after child exit: ${resultText}`,
					);
					assert.equal(session.getActiveToolNames().includes("subagent"), true);
					fake.setResponses([ai.fauxAssistantMessage("parent-still-alive")]);
					await session.prompt("Confirm the parent session still works.");
					assert.equal(session.getLastAssistantText(), "parent-still-alive");
					assert.equal(session.getActiveToolNames().includes("edit"), true);
					assert.equal(session.getActiveToolNames().includes("subagent"), true);
				} finally {
					await ensureDead(childPid);
					session?.dispose();
					rmTemp(harness.home);
					rmTemp(harness.cwd);
				}
			},
		);
	},
);
