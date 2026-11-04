// Real Pi + Tintinweb lifecycle controls; no model/network provider is contacted.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseAgentToml } from "../../../scripts/lib/agent-source.mjs";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const originalPlugin = path.join(repo, "plugins/do-it-pi");
const source = path.resolve(process.env.DO_IT_TINTINWEB_SOURCE);
const scenario = process.argv[2];
const negative = process.env.DO_IT_PI_PROBE_NEGATIVE;
const home = fs.mkdtempSync(path.join(os.tmpdir(), "do-it-pi-lifecycle-"));
const cwd = path.join(home, "project");
const agentDir = path.join(home, "agent");
for (const dir of [cwd, agentDir]) fs.mkdirSync(dir);
process.chdir(cwd);
Object.assign(process.env, { HOME: home, USERPROFILE: home, PI_CODING_AGENT_DIR: agentDir,
	PI_OFFLINE: "1", DO_IT_PI_PROBE_DIR: home, DO_IT_EVIDENCE_MODE: "observe" });
delete process.env.PI_SUBAGENT_CHILD;
globalThis.fetch = async () => { throw new Error("network is forbidden in the native fixture"); };
const sdk = await import(pathToFileURL(path.join(originalPlugin, "node_modules/@earendil-works/pi-coding-agent/dist/index.js")));
const ai = await import(pathToFileURL(path.join(originalPlugin, "node_modules/@earendil-works/pi-ai/dist/index.js")));
const piVersion = JSON.parse(fs.readFileSync(path.join(originalPlugin, "node_modules/@earendil-works/pi-coding-agent/package.json"))).version;
assert.equal(piVersion, "1.5.0");
const writer = fs.readdirSync(path.join(repo, "agents")).filter((file) => file.endsWith(".toml"))
	.map((file) => parseAgentToml(fs.readFileSync(path.join(repo, "agents", file), "utf8")))
	.find((agent) => agent.sandbox_mode === "workspace-write");
assert.ok(writer);
let plugin = originalPlugin;
if (scenario === "interrupted-resume" || negative) {
	plugin = path.join(home, "plugin");
	fs.cpSync(originalPlugin, plugin, { recursive: true, filter: (file) => !["node_modules", ".test-dist"].includes(path.basename(file)) });
}
if (negative) {
	// Bounded negative controls on a disposable copy, never on shipped sources.
	const mutations = {
		"root-path": ["hooks/lib/common.sh", "root) return 1 ;;", "root) : ;;"],
		"interrupted-resume": ["hooks/subagent-stance.sh", 'if [[ "${DO_IT_EVENT_HOST:-}" != "pi" || "${DO_IT_PI_SESSION_ROLE:-}" != "child" ]]; then', "if true; then"],
		"reopen-root": ["extensions/index.ts", "return !reminder || reminder.role === role;", "return true;"],
	};
	const [file, before, after] = mutations[scenario];
	const target = path.join(plugin, file);
	const original = fs.readFileSync(target, "utf8");
	assert.ok(original.includes(before), "negative control must disable the intended boundary");
	fs.writeFileSync(target, original.replace(before, after));
}
if (scenario === "interrupted-resume") {
	// Instrument only a disposable package copy. The real hook completes, but
	// its stdout is held until the real bridge times out. No shipped wording changes.
	const hooks = path.join(plugin, "hooks");
	fs.renameSync(path.join(hooks, "subagent-stance.sh"), path.join(hooks, "subagent-stance.real.sh"));
	fs.writeFileSync(path.join(hooks, "subagent-stance.sh"), `#!/usr/bin/env bash
result="$(bash "$(dirname "$0")/subagent-stance.real.sh")"
if mkdir "$DO_IT_PI_PROBE_DIR/held-once" 2>/dev/null; then
  printf '%s' "$result" > "$DO_IT_PI_PROBE_DIR/held-output.json"
  sleep 10
fi
printf '%s\\n' "$result"
`);
	process.env.DO_IT_HOOK_TIMEOUT_MS = "1000";
}
fs.writeFileSync(path.join(agentDir, "settings.json"), JSON.stringify({ packages: [plugin, source],
	extensions: [path.join(repo, "tests/pi/fixtures/primary-observer.mjs")], defaultProjectTrust: "always",
	compaction: { enabled: false }, retry: { enabled: false } }));
fs.writeFileSync(path.join(agentDir, "subagents.json"), JSON.stringify({ rememberAgents: true, outputTranscript: false,
	fallbackSubagent: "none", widgetMode: "off", fleetView: false }));
const trace = () => fs.readFileSync(path.join(home, "trace.jsonl"), "utf8").trim().split("\n").map(JSON.parse);
const childId = () => trace().find((entry) => entry.type === "tool" && entry.name === "Agent").agentId;
const fake = ai.fauxProvider();
const turns = new Map();
const requests = [];
const text = (content) => typeof content === "string" ? content : content.filter((part) => part.type === "text").map((part) => part.text).join("\n");
const tool = (name, args) => ai.fauxAssistantMessage(ai.fauxToolCall(name, args), { stopReason: "toolUse" });
const delegate = (label, resume) => tool("Agent", { subagent_type: writer.name, prompt: `PROBE:${label}`,
	description: `probe-${label}`, run_in_background: false, ...(resume ? { resume } : {}) });
const respond = (context) => {
	const texts = context.messages.filter((message) => message.role === "user").map((message) => text(message.content));
	const label = texts.flatMap((value) => [...value.matchAll(/PROBE:([a-z-]+)/g)].map((match) => match[1])).at(-1);
	assert.ok(label);
	requests.push({ label, stance: texts.filter((value) => value.startsWith("<system-reminder>\ndo-it subagent stance:")).length,
		core: texts.filter((value) => value.startsWith("Do-it: Preserve the user's goal,")).length,
		userQuote: texts.some((value) => value.startsWith("USER_QUOTE_DO_NOT_FILTER")),
		timeout: texts.some((value) => value.includes("subagent-stance.sh timed out")) });
	const turn = (turns.get(label) ?? 0) + 1;
	turns.set(label, turn);
	if (label === "root" && scenario !== "root-path") {
		if (turn === 1) return delegate(scenario === "interrupted-resume" ? "interrupted" : "child");
		if (scenario === "interrupted-resume" && turn === 2) return delegate("recovered", childId());
		if (scenario === "interrupted-resume" && turn === 3) return delegate("deduped", childId());
	} else if (label === "restart-root" && turn === 1) return delegate("reopened-child", childId());
	else if (label !== "interrupted") {
		if (turn === 1) return tool("write", { path: `${label}.md`, content: "lifecycle evidence\n" });
		if (turn === 2) return tool("bash", { command: "printf lifecycle-evidence" });
	}
	return ai.fauxAssistantMessage(`fixture ${label} complete`);
};
fake.setResponses(Array.from({ length: 40 }, () => respond));
const models = await sdk.ModelRuntime.create({ authPath: path.join(agentDir, "auth.json"), allowModelNetwork: false });
models.registerNativeProvider(fake.provider);
const errors = [];
const createRuntime = async ({ sessionManager, sessionStartEvent }) => {
	const services = await sdk.createAgentSessionServices({ cwd, agentDir, modelRuntime: models, resourceLoaderOptions: { noThemes: true } });
	assert.deepEqual(services.resourceLoader.getExtensions().errors, []);
	return { ...(await sdk.createAgentSessionFromServices({ services, sessionManager, sessionStartEvent, model: fake.getModel() })), services,
		diagnostics: services.diagnostics };
};
let runtime;
const open = async (sessionManager) => {
	runtime = await sdk.createAgentSessionRuntime(createRuntime, { cwd, agentDir, sessionManager });
	const bind = (session) => session.bindExtensions({ onError: (error) => errors.push(error) });
	runtime.setRebindSession(bind);
	await bind(runtime.session);
};
const proof = {};
try {
	await open(sdk.SessionManager.create(cwd, path.join(home, scenario === "root-path" ? "agents" : "sessions")));
	const rootFile = runtime.session.sessionFile;
	await runtime.session.prompt("PROBE:root");
	if (scenario === "interrupted-resume") {
		proof.heldOutput = JSON.parse(fs.readFileSync(path.join(home, "held-output.json"), "utf8"));
		assert.match(proof.heldOutput.hookSpecificOutput.additionalContext, /do-it subagent stance:/);
		assert.equal((await runtime.switchSession(rootFile)).cancelled, false);
		await runtime.session.prompt("PROBE:restart-root");
	}
	if (["reopen-root", "child-fork"].includes(scenario)) {
		const childFile = trace().find((entry) => entry.type === "start" && entry.parent).file;
		await runtime.dispose();
		runtime = undefined;
		const manager = sdk.SessionManager.open(childFile);
		const stance = manager.getBranch().find((entry) => entry.type === "custom_message" && entry.details?.doIt?.kind === "stance");
		assert.ok(stance);
		// Append a historical untagged reminder and a user quote to the fixture,
		// without editing any existing entry or any live session's storage.
		if (scenario === "reopen-root") {
			manager.appendCustomMessageEntry("do-it", stance.content, false);
			manager.appendMessage({ role: "user", content: `USER_QUOTE_DO_NOT_FILTER\n${stance.content}`, timestamp: Date.now() });
		}
		const historicalBytes = fs.readFileSync(childFile, "utf8");
		const originalEntries = JSON.parse(JSON.stringify(manager.getEntries()));
		await open(manager);
		await runtime.session.prompt("PROBE:reopened-root");
		assert.ok(fs.readFileSync(childFile, "utf8").startsWith(historicalBytes), "source history must be append-only");
		assert.equal((await runtime.fork(runtime.session.sessionManager.getLeafId(), { position: "at" })).cancelled, false);
		await runtime.session.prompt("PROBE:forked-root");
		for (const entry of originalEntries) assert.deepEqual(runtime.session.sessionManager.getEntry(entry.id), entry);
		proof.immutableHistory = true;
		proof.historicalEntries = originalEntries.length;
		proof.historicalHash = createHash("sha256").update(historicalBytes).digest("hex");
		if (scenario === "child-fork") {
			const sourceBytes = fs.readFileSync(childFile, "utf8");
			assert.equal((await runtime.switchSession(rootFile)).cancelled, false);
			assert.equal((await runtime.fork(runtime.session.sessionManager.getLeafId(), { position: "at" })).cancelled, false);
			await runtime.session.prompt("PROBE:restart-root");
			assert.equal(fs.readFileSync(childFile, "utf8"), sourceBytes, "resuming from a new parent forks rather than modifying source child history");
			proof.childForkSourceUnchanged = true;
		}
	}
	await runtime.dispose();
	runtime = undefined;
	assert.deepEqual(errors, []);
	const events = trace();
	const settled = events.filter((entry) => entry.type === "settled");
	const state = (label) => settled.find((entry) => entry.prompt === `PROBE:${label}`);
	const stanceEntries = (entry) => entry.owned.filter((message) => String(message.content).startsWith("<system-reminder>\ndo-it subagent stance:"));
	const childLabels = new Set(["child", "interrupted", "recovered", "deduped", "reopened-child"]);
	for (const request of requests) {
		const child = childLabels.has(request.label);
		assert.equal(request.stance, child && request.label !== "interrupted" ? 1 : 0, `${request.label}: model-visible stance`);
		assert.equal(request.core > 0, !child, `${request.label}: model-visible root Core`);
		if (scenario === "reopen-root" && ["reopened-root", "forked-root"].includes(request.label)) assert.equal(request.userQuote, true);
	}
	for (const entry of settled) {
		const child = childLabels.has(entry.prompt.slice("PROBE:".length));
		assert.equal(entry.identity.role, child ? "child" : "root");
		if (child) {
			assert.equal(entry.state?.kernel_text, undefined);
			assert.equal(entry.state?.hook_invocations?.write_quality_lint, undefined);
			assert.equal(entry.state?.hook_invocations?.evidence_observer, undefined);
		}
	}
	for (const result of events.filter((entry) => entry.type === "tool")) assert.equal(result.error, false);
	if (scenario === "root-path") {
		assert.match(events.find((entry) => entry.type === "start").file, /\/agents\//);
		assert.equal(state("root").state.hook_invocations.write_quality_lint, 1);
		assert.equal(state("root").state.hook_invocations.evidence_observer, 2);
	}
	if (scenario === "interrupted-resume") {
		assert.ok(requests.find((entry) => entry.label === "interrupted").timeout);
		assert.equal(stanceEntries(state("interrupted")).length, 0);
		assert.equal(state("interrupted").state.subagent_stance_seen, undefined);
		for (const label of ["recovered", "deduped", "reopened-child"]) {
			assert.equal(stanceEntries(state(label)).length, 1);
			assert.equal(state(label).state.hook_invocations.subagent_stance, 2, "only failed and recovered attempts launch the hook");
			assert.equal(state(label).sessionId, state("interrupted").sessionId);
		}
		assert.notEqual(state("reopened-child").instance, state("recovered").instance);
	}
	if (scenario === "reopen-root") {
		for (const label of ["reopened-root", "forked-root"]) {
			assert.equal(stanceEntries(state(label)).length, 2, "raw history retains modern and legacy owned reminders");
			assert.ok(state(label).state.hook_invocations.write_quality_lint >= 1);
		}
	}
	if (scenario === "child-fork") {
		assert.ok(state("reopened-child").owned.some((message) => message.details?.doIt?.role === "root"), "child fork history retains the source root reminder");
		assert.equal(stanceEntries(state("reopened-child")).length, 1);
		assert.notEqual(state("reopened-child").sessionId, state("child").sessionId);
	}
	assert.equal(requests.length, fake.state.callCount);
	const digest = (file) => createHash("sha256").update(fs.readFileSync(file)).digest("hex");
	console.log(JSON.stringify({ scenario, pi: piVersion, source, provider: "local faux; network fetch denied", requests, proof,
		hashes: Object.fromEntries(["plugins/do-it-pi/extensions/index.ts", "hooks/lib/common.sh", "hooks/subagent-stance.sh",
			"scripts/lib/pi-agent-adapter.mjs", "tests/pi/fixtures/primary-lifecycle-probe.mjs", "tests/pi/fixtures/primary-observer.mjs"].map((file) => [file, digest(path.join(repo, file))])),
		settled, lifecycle: events.filter((entry) => ["start", "before", "shutdown"].includes(entry.type)),
		tools: events.filter((entry) => entry.type === "tool") }));
} finally {
	await runtime?.dispose();
	fs.rmSync(home, { recursive: true, force: true });
}
