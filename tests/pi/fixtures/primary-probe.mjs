// Provider-free probe through Pi's real loader, Agent tool, sessions and hooks.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createHash } from "node:crypto";
import { parseAgentToml } from "../../../scripts/lib/agent-source.mjs";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const sdkPlugin = path.join(repo, "plugins/do-it-pi");
const plugin = process.env.DO_IT_PI_PLUGIN_ROOT ? path.resolve(process.env.DO_IT_PI_PLUGIN_ROOT) : sdkPlugin;
const piVersion = JSON.parse(fs.readFileSync(path.join(sdkPlugin, "node_modules/@earendil-works/pi-coding-agent/package.json"), "utf8")).version;
assert.equal(piVersion, "1.5.0", "native evidence is for the locked Pi 1.5 host");
const source = path.resolve(process.env.DO_IT_TINTINWEB_SOURCE);
const scenario = process.argv[2];
const expectedPatched = process.env.DO_IT_PI_EXPECT_UNPATCHED !== "1";
const home = fs.mkdtempSync(path.join(os.tmpdir(), "do-it-pi-primary-"));
const agentDir = path.join(home, "agent");
const cwd = path.join(home, "project");
for (const dir of [agentDir, cwd, path.join(cwd, ".pi/agents")]) fs.mkdirSync(dir, { recursive: true });
process.chdir(cwd);
Object.assign(process.env, { HOME: home, USERPROFILE: home, PI_CODING_AGENT_DIR: agentDir, PI_OFFLINE: "1", DO_IT_EVIDENCE_MODE: "observe", DO_IT_PI_PROBE_DIR: home });
delete process.env.PI_SUBAGENT_CHILD;
// Prevent accidental provider/network access even if fixture routing regresses.
globalThis.fetch = async () => { throw new Error("network is forbidden in the native Pi fixture"); };

const canonical = fs.readdirSync(path.join(repo, "agents")).filter((file) => file.endsWith(".toml"))
	.map((file) => parseAgentToml(fs.readFileSync(path.join(repo, "agents", file), "utf8")));
const writer = canonical.find((agent) => agent.sandbox_mode === "workspace-write");
assert.ok(writer, "fixture needs an existing canonical writer, not a hardcoded role");
const observer = path.join(repo, "tests/pi/fixtures/primary-observer.mjs");
fs.writeFileSync(path.join(agentDir, "settings.json"), JSON.stringify({ packages: [plugin, source], extensions: [observer],
	defaultProjectTrust: "always", compaction: { enabled: false }, retry: { enabled: false } }));
fs.writeFileSync(path.join(agentDir, "subagents.json"), JSON.stringify({ rememberAgents: scenario !== "memory", outputTranscript: false,
	fallbackSubagent: "none", widgetMode: "off", fleetView: false }));
// Native metadata fixture only; canonical semantic instructions remain untouched.
fs.writeFileSync(path.join(cwd, ".pi/agents/probe-nested.md"), `---\nname: probe-nested\ndescription: Native nested fixture\ntools: read, bash, write\nallowed_subagents: ${writer.name}\n---\nExercise the assigned temporary fixture only.\n`);
fs.writeFileSync(path.join(cwd, ".pi/agents/probe-filtered.md"), `---\nname: probe-filtered\ndescription: Native filtered fixture\ntools: read, bash, write\nextensions: do-it-pi, ${observer}\n---\nExercise the assigned temporary fixture only.\n`);

const sdk = await import(pathToFileURL(path.join(sdkPlugin, "node_modules/@earendil-works/pi-coding-agent/dist/index.js")));
const ai = await import(pathToFileURL(path.join(sdkPlugin, "node_modules/@earendil-works/pi-ai/dist/index.js")));
const fake = ai.fauxProvider();
const counts = new Map();
const tool = (name, args) => ai.fauxToolCall(name, args);
const answer = (content) => ai.fauxAssistantMessage(content, { stopReason: typeof content === "string" ? "stop" : "toolUse" });
const spawn = (label, type = writer.name) => tool("Agent", { subagent_type: type, prompt: `PROBE:${label}`,
	description: `probe-${label}`, run_in_background: false });
function respond(context) {
	const userText = context.messages.filter((message) => message.role === "user").map((message) =>
		typeof message.content === "string" ? message.content : message.content.filter((part) => part.type === "text").map((part) => part.text).join("\n"));
	const label = userText.flatMap((text) => [...text.matchAll(/PROBE:([a-z-]+)/g)].map((match) => match[1])).at(-1);
	assert.ok(label, "fake provider requires a fixture prompt");
	const turn = (counts.get(label) ?? 0) + 1;
	counts.set(label, turn);
	if (label === "root" && turn === 1) return answer(scenario === "concurrent"
		? [spawn("cancelled"), spawn("survivor"), tool("probe_control", {})]
		: spawn(scenario === "nested" ? "nested" : "child", scenario === "nested" ? "probe-nested" : scenario === "filtered" ? "probe-filtered" : writer.name));
	if (label === "nested" && turn === 1) return answer(spawn("leaf"));
	if (["child", "leaf", "cancelled", "survivor", "fork"].includes(label)) {
		if (turn === 1) return answer(tool("write", { path: `${label}.md`, content: "fixture evidence\n" }));
		if (turn === 2) return answer(["cancelled", "survivor"].includes(label)
			? tool("probe_wait", { label }) : tool("bash", { command: "printf fixture-evidence" }));
		if (label === "survivor" && turn === 3) return answer(tool("bash", { command: "printf sibling-survived" }));
	}
	return answer(`fixture ${label} complete`);
}
// Explicit scripted responses, not a launch turn budget. An exhausted script fails.
fake.setResponses(Array.from({ length: 30 }, () => respond));
const models = await sdk.ModelRuntime.create({ authPath: path.join(agentDir, "auth.json"), allowModelNetwork: false });
models.registerNativeProvider(fake.provider);
const errors = [];
const createRuntime = async ({ sessionManager, sessionStartEvent }) => {
	const services = await sdk.createAgentSessionServices({ cwd, agentDir, modelRuntime: models,
		resourceLoaderOptions: { noThemes: true } });
	assert.deepEqual(services.resourceLoader.getExtensions().errors, []);
	return { ...(await sdk.createAgentSessionFromServices({ services, sessionManager, sessionStartEvent, model: fake.getModel() })),
		services, diagnostics: services.diagnostics };
};
let runtime;
let report;
try {
	runtime = await sdk.createAgentSessionRuntime(createRuntime, { cwd, agentDir,
		sessionManager: sdk.SessionManager.create(cwd, path.join(home, "sessions")) });
	const bind = async (session) => session.bindExtensions({ onError: (error) => errors.push(error) });
	runtime.setRebindSession(bind);
	await bind(runtime.session);
	const catalog = runtime.session.getAllTools().find((entry) => entry.name === "Agent");
	assert.ok(catalog, "native runtime must register Agent");
	const nativeCatalog = runtime.session.extensionRunner.getToolDefinition("Agent").parameters.properties.subagent_type.description;
	for (const agent of canonical) assert.ok(nativeCatalog.includes(agent.name), `${agent.name}: absent from native discovery`);
	await runtime.session.prompt("PROBE:root");
	if (scenario === "fork") {
		const leaf = runtime.session.sessionManager.getLeafId();
		assert.equal((await runtime.fork(leaf, { position: "at" })).cancelled, false);
		assert.ok(runtime.session.sessionManager.getHeader()?.parentSession);
		await runtime.session.prompt("PROBE:fork");
	}
	await runtime.dispose();
	runtime = undefined;
	assert.deepEqual(errors, []);
	const trace = fs.readFileSync(path.join(home, "trace.jsonl"), "utf8").trim().split("\n").map(JSON.parse);
	const before = trace.filter((entry) => entry.type === "before");
	const sessions = before.map((entry) => {
		const stateFile = path.join(agentDir, "do-it-data/sessions", entry.sessionId, "state.json");
		return { ...entry, registeredTools: entry.tools, modelRequests: counts.get(entry.prompt.slice("PROBE:".length)),
			state: fs.existsSync(stateFile) ? JSON.parse(fs.readFileSync(stateFile, "utf8")) : null,
			start: trace.find((item) => item.type === "start" && item.sessionId === entry.sessionId),
			contexts: trace.filter((item) => item.type === "context" && item.sessionId === entry.sessionId),
			tools: trace.filter((item) => item.type === "tool" && item.sessionId === entry.sessionId),
			shutdown: trace.filter((item) => item.type === "shutdown" && item.sessionId === entry.sessionId) };
	});
	assert.equal(before.length, scenario === "nested" || scenario === "fork" || scenario === "concurrent" ? 3 : 2);
	for (const session of sessions) {
		const child = !["PROBE:root", "PROBE:fork"].includes(session.prompt);
		assert.equal(session.processChildFlag, null, "same-process runtime must not flip the env marker");
		assert.equal(session.identity?.role ?? null, expectedPatched ? child ? "child" : "root" : null);
		assert.ok(session.modelRequests > 0, `${session.prompt}: real provider request missing`);
		// A cancelled loop can prepare one last context before noticing abort;
		// a context event is not itself a provider request.
		const pending = session.contexts.length - session.modelRequests;
		assert.ok(pending === 0 || (session.prompt === "PROBE:cancelled" && pending === 1));
		assert.equal(session.shutdown.length, 1, `${session.prompt}: native shutdown must happen once`);
		if (child && expectedPatched) {
			assert.equal(session.state?.subagent_stance_seen, undefined, "Pi delivery belongs to persisted SDK messages, not pre-output hook state");
			assert.deepEqual(session.state?.hook_invocations, { subagent_stance: 1, subagent_dispatch: 1 });
			assert.equal(session.state?.kernel_text, undefined);
			for (const context of session.contexts) { assert.equal(context.stance, 1); assert.equal(context.core, false); }
		} else {
			assert.equal(session.state?.subagent_stance_seen, undefined);
			assert.equal(session.state?.user_turn, 1);
			for (const context of session.contexts) { assert.equal(context.stance, 0); assert.equal(context.core, true); }
		}
		for (const result of session.tools) {
			assert.equal(result.error, session.prompt === "PROBE:cancelled" && result.name === "probe_wait");
		}
		const requiredTools = session.prompt === "PROBE:root" || session.prompt === "PROBE:nested"
			? ["Agent"] : session.prompt === "PROBE:cancelled" ? ["write", "probe_wait"] : ["write", "bash"];
		for (const name of requiredTools) assert.ok(session.tools.some((item) => item.name === name), `${session.prompt}: ${name} never executed`);
	}
	const byPrompt = (name) => sessions.find((entry) => entry.prompt === `PROBE:${name}`);
	if (scenario === "memory") assert.equal(byPrompt("child").start.file, null);
	if (scenario === "persisted") assert.ok(byPrompt("child").start.file);
	if (scenario === "nested") {
		assert.ok(before.find((entry) => entry.prompt === "PROBE:nested").tools.includes("Agent"));
		assert.equal(byPrompt("leaf").start.file, null);
	}
	if (scenario === "concurrent") {
		assert.equal(trace.find((entry) => entry.type === "barrier" && entry.label === "cancelled")?.aborted, true);
		assert.equal(trace.find((entry) => entry.type === "barrier" && entry.label === "survivor")?.aborted, false);
		assert.ok(byPrompt("survivor").tools.some((entry) => entry.name === "bash"));
		assert.equal(trace.filter((entry) => entry.type === "control").length, 1);
		const cancelled = byPrompt("root").tools.find((entry) => entry.name === "Agent" && entry.input.description === "probe-cancelled");
		assert.match(cancelled.content[0].text, /STOPPED BY THE USER/);
	}
	if (scenario === "fork") assert.equal(byPrompt("fork").state.hook_invocations.write_quality_lint, 1);
	assert.equal(sessions.reduce((total, session) => total + session.modelRequests, 0), fake.state.callCount);
	const digest = (file) => createHash("sha256").update(fs.readFileSync(file)).digest("hex");
	report = { scenario, expectedPatched, pi: piVersion, runtime: JSON.parse(fs.readFileSync(path.join(source, "package.json"), "utf8")).version,
		provider: "local faux; network fetch denied", requests: fake.state.callCount, source, plugin, writer: writer.name,
		canonicalRoles: canonical.map((agent) => agent.name), nativeCatalog, node: process.version,
		fixtureHashes: Object.fromEntries(["primary-probe.mjs", "primary-observer.mjs"].map((file) => [file, digest(path.join(repo, "tests/pi/fixtures", file))])),
		canonicalAgentHashes: Object.fromEntries(canonical.map((agent) => [agent.name, digest(path.join(repo, "agents", `${agent.name}.toml`))])),
		hashes: Object.fromEntries(["src/agent-runner.ts", "src/index.ts", ...(expectedPatched ? ["src/session-context.ts"] : [])].map((file) => [file, digest(path.join(source, file))])),
		adapterHash: digest(path.join(plugin, "extensions/index.ts")), stanceHash: digest(path.join(plugin, "hooks/subagent-stance.sh")),
		sessions, controls: trace.filter((entry) => ["control", "barrier"].includes(entry.type)) };
	console.log(JSON.stringify(report));
} finally {
	await runtime?.dispose();
	fs.rmSync(home, { recursive: true, force: true });
}
