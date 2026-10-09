import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { parseAgentToml } from "../../scripts/lib/agent-source.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const bundle = path.join(root, "plugins/do-it-grok");
const adapter = path.join(bundle, "hooks/grok-adapter.sh");
function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: "utf8", timeout: 30000, ...options });
  assert.equal(result.status, 0, result.stderr || String(result.error));
  return result.stdout;
}
function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "do-it-grok-test-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const workspace = path.join(dir, "workspace with spaces");
  fs.mkdirSync(workspace);
  const env = { ...process.env, TMPDIR: dir, GROK_PLUGIN_ROOT: bundle, GROK_PLUGIN_DATA: path.join(dir, "data"),
    CLAUDE_PLUGIN_ROOT: bundle, CLAUDE_PLUGIN_DATA: path.join(dir, "data"),
    CURSOR_PLUGIN_DATA: "", PLUGIN_DATA: "", DO_IT_HOOK_DATA: "" };
  delete env.CODEX_HOME;
  const payload = { hookEventName: "post_tool_use", hook_event_name: "PostToolUse",
    sessionId: "grok-fixture", cwd: workspace, workspaceRoot: workspace,
    toolName: "read_file", toolInput: { file_path: "sample.ts" } };
  const hook = (mode, input = payload, overrides = {}) => run("bash", [adapter, mode], {
    cwd: dir, env: { ...env, ...overrides }, input: typeof input === "string" ? input : JSON.stringify(input)
  });
  return { dir, workspace, env, payload, hook };
}

test("Grok specialists render canonical bodies with only native name/description metadata", () => {
  const files = fs.readdirSync(path.join(bundle, "agents"));
  assert.equal(files.length, 10);
  for (const file of files) {
    const agent = parseAgentToml(fs.readFileSync(path.join(root, "agents", file.replace(/\.md$/, ".toml")), "utf8"));
    const text = fs.readFileSync(path.join(bundle, "agents", file), "utf8");
    assert.equal(text, `---\nname: ${JSON.stringify(agent.name)}\ndescription: ${JSON.stringify(agent.description)}\n---\n\n${agent.developer_instructions.trim()}\n`);
  }
  const hooks = JSON.parse(fs.readFileSync(path.join(bundle, "hooks/hooks.json"), "utf8"));
  assert.deepEqual(Object.keys(hooks.hooks), ["UserPromptSubmit", "PostToolUse"]);
  assert.match(hooks.hooks.UserPromptSubmit[0].hooks[0].command, /grok-adapter\.sh" user-turn$/);
});

for (const noJq of [false, true]) {
  test(`Core uses native PostToolUse context once per session (no jq: ${noJq})`, t => {
    const { hook, payload } = fixture(t);
    const env = { DO_IT_FORCE_NO_JQ: noJq ? "1" : "0" };
    const prompt = { ...payload, hookEventName: "user_prompt_submit", hook_event_name: "UserPromptSubmit" };
    assert.equal(hook("user-turn", prompt, env), "");
    assert.equal(hook("core", prompt, env), "");
    const output = JSON.parse(hook("core", payload, env));
    assert.equal(output.hookSpecificOutput.hookEventName, "PostToolUse");
    assert.equal(output.hookSpecificOutput.additionalContext, fs.readFileSync(path.join(root, "hooks/data/core-context.txt"), "utf8").trimEnd());
    assert.equal(hook("core", payload, env), "");
    assert.ok(hook("core", { ...payload, sessionId: "another-session" }, env));
  });
  test(`camelCase search_replace reaches real canonical lint and preserves turn dedup (no jq: ${noJq})`, t => {
    const { hook, payload, workspace } = fixture(t);
    run("git", ["init", "--quiet", workspace]);
    const file = path.join(workspace, "sample.ts");
    fs.writeFileSync(file, "export const value = 1;\n");
    run("git", ["-C", workspace, "add", "sample.ts"]);
    run("git", ["-C", workspace, "-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "--quiet", "-m", "fixture"]);
    fs.appendFileSync(file, "export function load() { console.log('debug'); return 1; }\n");
    const edit = { ...payload, toolName: "search_replace", toolInput: { file_path: "sample.ts", old_string: "", new_string: "export function load() { console.log('debug'); return 1; }" } };
    const env = { DO_IT_FORCE_NO_JQ: noJq ? "1" : "0" };
    const prompt = { ...payload, hookEventName: "user_prompt_submit", hook_event_name: "UserPromptSubmit" };
    assert.equal(hook("user-turn", prompt, env), "");
    const output = JSON.parse(hook("write-quality", edit, env));
    assert.equal(output.hookSpecificOutput.hookEventName, "PostToolUse");
    assert.match(output.hookSpecificOutput.additionalContext, /write-quality-lint.*sample\.ts/);
    assert.equal(hook("write-quality", edit, env), "");
    assert.equal(hook("user-turn", prompt, env), "");
    assert.ok(hook("write-quality", { ...edit, toolInput: { path: file } }, env));
    assert.equal(hook("write-quality", { ...edit, toolName: "read_file" }, env), "");
  });
}

test("user-turn accepts camelCase and environment fallbacks without emitting context", t => {
  const { hook, payload, workspace } = fixture(t);
  assert.equal(hook("user-turn", { hookEventName: "user_prompt_submit", sessionId: payload.sessionId, workspaceRoot: workspace }), "");
  assert.equal(hook("user-turn", {}, { GROK_HOOK_EVENT: "user_prompt_submit", GROK_SESSION_ID: payload.sessionId, GROK_WORKSPACE_ROOT: workspace }), "");
  assert.ok(hook("core", payload));
  assert.equal(hook("user-turn", { hookEventName: "user_prompt_submit", cwd: workspace }, { GROK_SESSION_ID: "" }), "");
  assert.equal(hook("user-turn", { hookEventName: "user_prompt_submit", sessionId: payload.sessionId, cwd: "/nonexistent" }), "");
  assert.equal(hook("user-turn", { ...payload, hook_event_name: "UserPromptSubmit" }, { GROK_PLUGIN_DATA: "/dev/null/unwritable" }), "");
});

test("registered command handles a plugin root containing spaces", t => {
  const { dir, env, payload } = fixture(t);
  const copied = path.join(dir, "plugin with spaces");
  fs.cpSync(bundle, copied, { recursive: true });
  const hooks = JSON.parse(fs.readFileSync(path.join(copied, "hooks/hooks.json"), "utf8"));
  const command = hooks.hooks.PostToolUse[0].hooks[0].command;
  const result = run("bash", ["-c", command], { env: { ...env, GROK_PLUGIN_ROOT: copied }, input: JSON.stringify(payload) });
  assert.equal(JSON.parse(result).hookSpecificOutput.hookEventName, "PostToolUse");
});

test("malformed input, missing identity/workspace, and ignored lifecycle events fail open", t => {
  const { hook, payload } = fixture(t);
  for (const input of ["{broken", {}, { ...payload, sessionId: "" }, { ...payload, cwd: "/nonexistent" },
    { ...payload, hook_event_name: "PreToolUse" }, { ...payload, hook_event_name: "UserPromptSubmit" }]) {
    assert.equal(hook("core", input, { GROK_SESSION_ID: "", GROK_WORKSPACE_ROOT: "", GROK_HOOK_EVENT: "" }), "");
  }
  const result = hook("core", payload, { GROK_PLUGIN_DATA: "/dev/null/unwritable", DO_IT_SESSION_TTL_DAYS: "invalid" });
  assert.equal(JSON.parse(result).hookSpecificOutput.hookEventName, "PostToolUse");
});

test("native Grok validates manifest and discovers 12 skills and 10 agents in an isolated home", {
  skip: !process.env.DO_IT_GROK_BINARY
}, t => {
  const { dir, workspace } = fixture(t);
  const grokHome = path.join(dir, ".grok");
  fs.mkdirSync(grokHome);
  fs.cpSync(bundle, path.join(grokHome, "plugins/do-it-grok"), { recursive: true });
  fs.writeFileSync(path.join(grokHome, "config.toml"), '[plugins]\nenabled = ["do-it-grok"]\n');
  const options = { cwd: workspace, env: { ...process.env, HOME: dir, GROK_HOME: grokHome,
    XDG_CONFIG_HOME: path.join(dir, "config") } };
  const binary = process.env.DO_IT_GROK_BINARY;
  assert.match(run(binary, ["plugin", "validate", bundle], options), /manifest is valid/);
  const report = JSON.parse(run(binary, ["inspect", "--json"], options));
  const fromPlugin = item => item.source?.plugin_name === "do-it-grok";
  assert.equal(report.skills.filter(fromPlugin).length, 12);
  assert.equal(report.agents.filter(fromPlugin).length, 10);
  assert.equal(report.hooks.filter(fromPlugin).length, 1);
  assert.ok(report.plugins.some(plugin => plugin.name === "do-it-grok" && plugin.enabled));
});
