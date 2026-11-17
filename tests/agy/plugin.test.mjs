import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { parseAgentToml } from "../../scripts/lib/agent-source.mjs";
import { ALL_SKILLS } from "../../scripts/skill-tiers.mjs";
import { installAgyLocal } from "../../scripts/install-agy-local.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const bundle = path.join(root, "plugins/do-it-agy");
const adapter = path.join(bundle, "hooks/agy-adapter.sh");
const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"));
const coreContext = fs.readFileSync(path.join(root, "hooks/data/core-context.txt"), "utf8").trimEnd();

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: "utf8", timeout: 30000, ...options });
  assert.equal(result.status, 0, result.stderr || result.stdout || String(result.error));
  return result.stdout;
}

function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "do-it-agy-test-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const workspace = path.join(dir, "workspace with spaces");
  fs.mkdirSync(workspace, { recursive: true });
  const env = {
    ...process.env,
    TMPDIR: dir,
    HOME: path.join(dir, "home"),
    PLUGIN_ROOT: bundle,
    PLUGIN_DATA: path.join(dir, "data"),
    DO_IT_HOOK_DATA: "",
    CURSOR_PLUGIN_DATA: "",
    CURSOR_PLUGIN_ROOT: "",
    CLAUDE_PLUGIN_DATA: "",
    CLAUDE_PLUGIN_ROOT: ""
  };
  delete env.CODEX_HOME;
  fs.mkdirSync(env.HOME, { recursive: true });

  const rootTranscript = path.join(dir, "root-transcript.jsonl");
  fs.writeFileSync(rootTranscript, `${JSON.stringify({ step_index: 0, source: "USER_EXPLICIT", type: "USER_INPUT", content: "hi" })}\n`);
  const subTranscript = path.join(dir, "subagent-transcript.jsonl");
  fs.writeFileSync(subTranscript, `${JSON.stringify({ step_index: 0, source: "SYSTEM", type: "SYSTEM_MESSAGE", content: "task" })}\n`);

  const invoke = (mode, input, overrides = {}) => {
    const stdout = run("bash", [adapter, mode], {
      cwd: bundle,
      env: { ...env, ...overrides },
      input: typeof input === "string" ? input : JSON.stringify(input)
    });
    return JSON.parse(stdout);
  };

  return { dir, workspace, env, rootTranscript, subTranscript, invoke };
}

test("do-it-agy bundle structure, agent tool scopes, rewritten skill links, and agy validate pass", () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
  const plugin = JSON.parse(fs.readFileSync(path.join(bundle, "plugin.json"), "utf8"));
  assert.equal(plugin.name, "do-it-agy");
  assert.equal(plugin.version, pkg.version);

  const hooks = JSON.parse(fs.readFileSync(path.join(bundle, "hooks.json"), "utf8"))["do-it"];
  assert.ok(Array.isArray(hooks.SessionStart));
  assert.ok(Array.isArray(hooks.PreInvocation));
  assert.ok(Array.isArray(hooks.PostToolUse));
  assert.ok(Array.isArray(hooks.PostInvocation));

  const skillDirs = fs.readdirSync(path.join(bundle, "skills")).sort();
  assert.deepEqual(skillDirs, [...ALL_SKILLS].sort());
  for (const name of skillDirs) {
    const skillText = fs.readFileSync(path.join(bundle, "skills", name, "SKILL.md"), "utf8");
    assert.ok(!skillText.includes("](../references/"), `${name}: unrewritten ../references link`);
  }
  assert.ok(fs.existsSync(path.join(bundle, "references", "host-claude.md")));

  const agentFiles = fs.readdirSync(path.join(bundle, "agents")).sort();
  assert.deepEqual(agentFiles, manifest.agents.map((a) => `${a.name}.md`).sort());
  for (const file of agentFiles) {
    const source = parseAgentToml(fs.readFileSync(path.join(root, "agents", file.replace(/\.md$/, ".toml")), "utf8"));
    const content = fs.readFileSync(path.join(bundle, "agents", file), "utf8");
    const match = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(content);
    assert.ok(match, `${file}: missing frontmatter`);
    assert.match(match[1], /^subagent: true$/m);
    assert.match(match[1], /^mainAgent: false$/m);
    const expectedTools = source.sandbox_mode === "read-only"
      ? "tools: [read_file, run_command, manage_task]"
      : "tools: [read_file, edit_file, write_file, run_command, manage_task]";
    assert.ok(match[1].split("\n").includes(expectedTools), `${file}: wrong tools scope`);
    assert.equal(match[2].trim(), source.developer_instructions.trim());
  }

  const agyCheck = spawnSync("agy", ["plugin", "validate", bundle, "--strict", "--json"], { encoding: "utf8" });
  if (agyCheck.error?.code !== "ENOENT") {
    assert.equal(agyCheck.status, 0, agyCheck.stderr || agyCheck.stdout);
    const parsed = JSON.parse(agyCheck.stdout);
    const bad = (parsed.findings ?? []).filter((f) => f.severity === "error" || f.severity === "warning");
    assert.deepEqual(bad, []);
  }
});

for (const noJq of [false, true]) {
  test(`AGY root SessionStart/PreInvocation Core dedup and turn bump (no jq: ${noJq})`, (t) => {
    const { workspace, rootTranscript, dir, invoke } = fixture(t);
    const overrides = { DO_IT_FORCE_NO_JQ: noJq ? "1" : "0" };
    const emptyTranscript = path.join(dir, "empty.jsonl");
    fs.writeFileSync(emptyTranscript, "");

    assert.deepEqual(invoke("session-start", {
      hookEventName: "SessionStart",
      conversationId: "agy-root-1",
      cwd: workspace,
      transcriptPath: emptyTranscript
    }, overrides), {});

    const first = invoke("session-start", {
      hookEventName: "SessionStart",
      conversationId: "agy-root-1",
      cwd: workspace,
      transcriptPath: rootTranscript,
      lastUserInput: "hello"
    }, overrides);
    assert.equal(first.injectSteps?.[0]?.systemMessage?.systemMessage, coreContext);
    assert.ok(!first.injectSteps[0].systemMessage.systemMessage.includes("<system-reminder>"));

    assert.deepEqual(invoke("pre-invocation", {
      hookEventName: "PreInvocation",
      conversationId: "agy-root-1",
      cwd: workspace,
      transcriptPath: rootTranscript,
      lastUserInput: "turn-one"
    }, overrides), {});

    const readTurn = () => {
      const sessionDir = path.join(dir, "data", "sessions", "agy-root-1");
      if (!noJq) return JSON.parse(fs.readFileSync(path.join(sessionDir, "state.json"), "utf8")).user_turn;
      const kv = fs.readFileSync(path.join(sessionDir, "state.kv"), "utf8");
      const matches = [...kv.matchAll(/^user_turn=(.+)$/gm)];
      return matches.at(-1)?.[1];
    };
    const turnOne = readTurn();
    assert.deepEqual(invoke("pre-invocation", {
      hookEventName: "PreInvocation",
      conversationId: "agy-root-1",
      cwd: workspace,
      transcriptPath: rootTranscript,
      lastUserInput: "turn-one"
    }, overrides), {});
    assert.equal(readTurn(), turnOne);

    invoke("pre-invocation", {
      hookEventName: "PreInvocation",
      conversationId: "agy-root-1",
      cwd: workspace,
      transcriptPath: rootTranscript,
      lastUserInput: "turn-two"
    }, overrides);
    assert.equal(Number(readTurn()), Number(turnOne) + 1);
  });

  test(`AGY subagent SYSTEM_MESSAGE isolation and PostToolUse->PostInvocation lint relay (no jq: ${noJq})`, (t) => {
    const { workspace, rootTranscript, subTranscript, invoke } = fixture(t);
    const overrides = { DO_IT_FORCE_NO_JQ: noJq ? "1" : "0" };

    const sub = invoke("pre-invocation", {
      hookEventName: "PreInvocation",
      conversationId: "agy-child-1",
      cwd: workspace,
      transcriptPath: subTranscript,
      lastUserInput: "audit module"
    }, overrides);
    const stanceText = sub.injectSteps?.[0]?.systemMessage?.systemMessage ?? "";
    assert.match(stanceText, /^do-it subagent stance:/);
    assert.ok(!stanceText.includes("<system-reminder>"));

    assert.deepEqual(invoke("pre-invocation", {
      hookEventName: "PreInvocation",
      conversationId: "agy-child-1",
      cwd: workspace,
      transcriptPath: subTranscript,
      lastUserInput: "follow-up"
    }, overrides), {});

    const parent = invoke("pre-invocation", {
      hookEventName: "PreInvocation",
      conversationId: "agy-parent-1",
      cwd: workspace,
      transcriptPath: rootTranscript,
      lastUserInput: "main task"
    }, overrides);
    assert.equal(parent.injectSteps?.[0]?.systemMessage?.systemMessage, coreContext);

    run("git", ["init", "--quiet", workspace]);
    const file = path.join(workspace, "app.js");
    fs.writeFileSync(file, "export const v = 1;\n");
    run("git", ["-C", workspace, "add", "app.js"]);
    run("git", ["-C", workspace, "-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "--quiet", "-m", "init"]);
    fs.appendFileSync(file, "export function runApp() { console.log('dbg'); return 2; }\n");

    const postTool = invoke("post-tool", {
      hookEventName: "PostToolUse",
      conversationId: "agy-parent-1",
      cwd: workspace,
      transcriptPath: rootTranscript,
      toolCall: { name: "edit_file", args: { Path: "app.js" } }
    }, overrides);
    assert.deepEqual(postTool, {});

    const postInv = invoke("post-invocation", {
      hookEventName: "PostInvocation",
      conversationId: "agy-parent-1",
      cwd: workspace,
      transcriptPath: rootTranscript
    }, overrides);
    const advisory = postInv.injectSteps?.[0]?.systemMessage?.systemMessage ?? "";
    assert.match(advisory, /do-it write-quality-lint/);
    assert.match(advisory, /app\.js/);

    assert.deepEqual(invoke("post-invocation", {
      hookEventName: "PostInvocation",
      conversationId: "agy-parent-1",
      cwd: workspace,
      transcriptPath: rootTranscript
    }, overrides), {});
  });
}

test("AGY adapter fails open on errors, non-write tools, workspacePaths fallback, and malformed payloads", (t) => {
  const { workspace, rootTranscript, invoke } = fixture(t);
  const file = path.join(workspace, "mod.js");
  fs.writeFileSync(file, "export function x() { console.log('dbg'); }\n");

  assert.deepEqual(invoke("post-tool", {
    hookEventName: "PostToolUse",
    conversationId: "agy-failopen",
    cwd: workspace,
    error: "tool failed",
    toolCall: { name: "write_file", args: { Path: file } }
  }), {});
  assert.deepEqual(invoke("post-tool", {
    hookEventName: "PostToolUse",
    conversationId: "agy-failopen",
    cwd: workspace,
    toolCall: { name: "run_command", args: { CommandLine: "ls" } }
  }), {});
  assert.deepEqual(invoke("post-invocation", {
    hookEventName: "PostInvocation",
    conversationId: "agy-failopen",
    cwd: workspace
  }), {});

  assert.deepEqual(invoke("session-start", "{broken json"), {});
  assert.deepEqual(invoke("session-start", { hookEventName: "SessionStart", cwd: workspace }), {});

  const fallback = invoke("session-start", {
    hookEventName: "SessionStart",
    conversationId: "agy-ws-fallback",
    workspacePaths: [workspace],
    transcriptPath: rootTranscript
  });
  assert.equal(fallback.injectSteps?.[0]?.systemMessage?.systemMessage, coreContext);
});

test("installAgyLocal installs into AGY_CONFIG_DIR, preserves .do-it-data, and never touches config.json", (t) => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "do-it-agy-install-"));
  t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
  const agyConfigDir = path.join(temp, "config");

  const first = installAgyLocal({ repoRoot: root, agyConfigDir, skipValidate: true });
  assert.ok(fs.existsSync(path.join(first.targetDir, "plugin.json")));
  assert.ok(fs.existsSync(path.join(first.targetDir, "hooks.json")));

  const sentinel = path.join(first.targetDir, ".do-it-data", "sentinel.txt");
  fs.mkdirSync(path.dirname(sentinel), { recursive: true });
  fs.writeFileSync(sentinel, "keep-me");

  const second = installAgyLocal({ repoRoot: root, agyConfigDir, skipValidate: true });
  assert.equal(fs.readFileSync(path.join(second.targetDir, ".do-it-data", "sentinel.txt"), "utf8"), "keep-me");
  assert.equal(fs.existsSync(path.join(agyConfigDir, "config.json")), false);
});
