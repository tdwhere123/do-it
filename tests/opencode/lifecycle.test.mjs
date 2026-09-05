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
const { DoItOpencodePlugin } = await import(
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

test("default OpenCode runtime preserves configuration and delivers compact context without completion scanning", async () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "do-it-oc-default-"));
  const restore = isolateSessionEnv();
  process.env.DO_IT_HOOK_DATA = path.join(cwd, "data");
  delete process.env.DO_IT_EVIDENCE_MODE;
  let calls = 0;
  const host = { directory: cwd, client: { session: { messages: async () => { calls++; return {}; } } } };
  const hooks = await DoItOpencodePlugin(host);
  try {
    const custom = { prompt: "user agent" };
    const config = { agent: { reviewer: custom }, permission: { edit: "ask" } };
    await hooks.config(config);
    assert.equal(config.agent.reviewer, custom);
    assert.equal(config.permission.edit, "ask");
    assert.ok(config.skills.paths.length > 0);
    const output = { parts: [{ type: "text", text: "fix the helper" }] };
    await hooks["chat.message"]({ sessionID: "fresh" }, output);
    assert.match(output.parts[0].text, /causal owner/);
    assert.equal(hooks.event, undefined);
    assert.equal(hooks["experimental.chat.messages.transform"], undefined);
    await hooks["tool.execute.after"]({ sessionID: "fresh", tool: "bash", args: { command: "printf https://example.invalid" } }, { output: "https://example.invalid" });
    assert.equal(fs.existsSync(path.join(cwd, ".do-it")), false);
    assert.equal(calls, 0);
  } finally { await hooks.dispose(); delete process.env.DO_IT_HOOK_DATA; restore(); fs.rmSync(cwd, { recursive: true, force: true }); }
});

test("OpenCode diagnostics require explicit observe and preserve missing exit as unknown", async () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "do-it-oc-observe-"));
  const restore = isolateSessionEnv();
  const prior = process.env.DO_IT_EVIDENCE_MODE;
  process.env.DO_IT_HOOK_DATA = path.join(cwd, "data");
  process.env.DO_IT_EVIDENCE_MODE = "observe";
  spawnSync("git", ["init", "-q", cwd]);
  const hooks = await DoItOpencodePlugin({ directory: cwd });
  try {
    await hooks["tool.execute.after"]({ sessionID: "observed", tool: "bash", args: { command: "npm test" } }, { output: "local test output", metadata: {} });
    const events = path.join(cwd, ".do-it/runtime/events");
    assert.ok(fs.existsSync(events));
    const records = fs.readdirSync(events).filter((name) => name.endsWith(".jsonl")).flatMap((name) => fs.readFileSync(path.join(events, name), "utf8").trim().split("\n").map(JSON.parse));
    assert.ok(records.length > 0);
    assert.ok(records.every((record) => record.exit_code !== 0));
  } finally { await hooks.dispose(); delete process.env.DO_IT_HOOK_DATA; if (prior === undefined) delete process.env.DO_IT_EVIDENCE_MODE; else process.env.DO_IT_EVIDENCE_MODE = prior; restore(); fs.rmSync(cwd, { recursive: true, force: true }); }
});
