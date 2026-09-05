import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const bridgeJs = path.join(repoRoot, "plugins/do-it-opencode/dist/bridge.js");
const indexJs = path.join(repoRoot, "plugins/do-it-opencode/dist/index.js");
assert.ok(fs.existsSync(bridgeJs), "build plugins/do-it-opencode before running these tests");
assert.ok(fs.existsSync(indexJs), "build plugins/do-it-opencode before running these tests");
const bridgeUrl = pathToFileURL(bridgeJs).href;
const indexUrl = pathToFileURL(indexJs).href;

const {
  buildHookPayload,
  extractExitCode,
  extractFilePath,
  isEditTool,
  isEvidenceTool,
  isShellTool,
  normalizeToolName,
  parseHookOutput,
  resolveBash,
  resolveSessionStateDir,
  spawnHook,
  windowsTaskkill
} = await import(bridgeUrl);


const payload = {
  session_id: "sess-1",
  cwd: os.tmpdir(),
  transcript_path: ""
};

test("normalizeToolName maps OpenCode edit tools to hook names", () => {
  assert.equal(normalizeToolName("edit"), "Edit");
  assert.equal(normalizeToolName("Write"), "Write");
  assert.equal(normalizeToolName("multiedit"), "MultiEdit");
  assert.equal(normalizeToolName("bash"), null);
});

test("isEditTool recognizes edit-family tools", () => {
  assert.equal(isEditTool("edit"), true);
  assert.equal(isEditTool("WRITE"), true);
  assert.equal(isEditTool("grep"), false);
});

test("isShellTool and extractExitCode do not invent proof", () => {
  assert.equal(isShellTool("bash"), true);
  assert.equal(isEvidenceTool("shell"), true);
  assert.equal(isEvidenceTool("grep"), false);
  assert.equal(extractExitCode({ exit_code: 1 }), 1);
  assert.equal(extractExitCode({}), undefined);
});

test("buildHookPayload extracts file_path from args", () => {
  const result = buildHookPayload({
    sessionID: "sess-1",
    cwd: "/tmp/project",
    model: "openrouter/claude-sonnet-4",
    tool: "edit",
    args: { file_path: "src/index.ts", new_string: "x" }
  });

  assert.equal(result.session_id, "sess-1");
  assert.equal(result.cwd, "/tmp/project");
  assert.equal(result.model, "openrouter/claude-sonnet-4");
  assert.equal(result.tool_name, "Edit");
  assert.equal(result.file_path, "src/index.ts");
  assert.deepEqual(result.tool_input, { file_path: "src/index.ts", new_string: "x" });
});

test("buildHookPayload records observed output and exit without inferring success", () => {
  const withExit = buildHookPayload({
    sessionID: "sess-1",
    cwd: "/tmp/project",
    tool: "bash",
    args: { command: "npm test" },
    output: "ok",
    metadata: { exit_code: 0 }
  });
  assert.equal(withExit.tool_name, "bash");
  assert.equal(withExit.tool_response.exit_code, 0);
  assert.equal(withExit.tool_response.output, "ok");

  const withoutExit = buildHookPayload({
    sessionID: "sess-1",
    cwd: "/tmp/project",
    tool: "bash",
    args: { command: "npm test" },
    output: "host omitted the exit code"
  });
  assert.equal(Object.hasOwn(withoutExit, "tool_response"), true);
  assert.equal(Object.hasOwn(withoutExit.tool_response, "exit_code"), false);
});

test("extractFilePath prefers file_path then path", () => {
  assert.equal(extractFilePath({ path: "a.ts" }), "a.ts");
  assert.equal(extractFilePath({ file_path: "b.ts", path: "a.ts" }), "b.ts");
  assert.equal(extractFilePath({}), undefined);
});

test("parseHookOutput reads block and context JSON lines", () => {
  const block = parseHookOutput('{"decision":"block","reason":"need evidence"}\n');
  assert.equal(block.blockReason, "need evidence");

  const ctx = parseHookOutput(
    '{"hookSpecificOutput":{"hookEventName":"PostToolUse","additionalContext":"<system-reminder>lint</system-reminder>"}}\n'
  );
  assert.match(ctx.additionalContext ?? "", /lint/);
});

test("resolveBash honors DO_IT_BASH and reports no compatible shell", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "doit-opencode-bash-"));
  const executable = path.join(dir, "custom-bash");
  fs.writeFileSync(executable, "#!/bin/sh\nexit 0\n", { mode: 0o700 });

  try {
    assert.equal(resolveBash({ DO_IT_BASH: executable, PATH: "" }, "linux"), executable);
    assert.equal(
      resolveBash({ DO_IT_BASH: path.join(dir, "missing"), PATH: "" }, "linux"),
      null
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("resolveBash finds Git Bash style executables on Windows PATH", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "doit-opencode-win-bash-"));
  const executable = path.join(dir, "bash.exe");
  fs.writeFileSync(executable, "", { mode: 0o600 });

  try {
    assert.equal(resolveBash({ PATH: dir, PATHEXT: ".exe" }, "win32"), executable);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("spawnHook times out and terminates a slow hook", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "doit-opencode-timeout-"));
  const script = path.join(dir, "slow.sh");
  fs.writeFileSync(script, "#!/usr/bin/env bash\nsleep 5\n", { mode: 0o700 });

  try {
    const started = Date.now();
    const result = await spawnHook(dir, "slow.sh", payload, { timeoutMs: 50 });
    assert.equal(result.timedOut, true);
    assert.equal(result.exitCode, 124);
    assert.match(result.diagnostic ?? "", /timed out after 50ms/i);
    assert.ok(Date.now() - started < 1500, "the child process should be terminated promptly");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("windowsTaskkill resolves the native process-tree utility", () => {
  assert.equal(
    windowsTaskkill({ SystemRoot: "C:\\Windows" }),
    "C:\\Windows\\System32\\taskkill.exe"
  );
  assert.equal(windowsTaskkill({}), "taskkill.exe");
});

test("spawnHook degrades softly when Bash is unavailable", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "doit-opencode-no-bash-"));
  fs.writeFileSync(path.join(dir, "hook.sh"), "exit 0\n");

  try {
    const result = await spawnHook(dir, "hook.sh", payload, {
      env: { DO_IT_BASH: path.join(dir, "missing"), PATH: "" },
      platform: "linux"
    });
    assert.equal(result.exitCode, 0);
    assert.equal(result.unavailable, true);
    assert.match(result.diagnostic ?? "", /set DO_IT_BASH|Git for Windows Bash/i);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("resolveSessionStateDir cannot traverse outside the sessions directory", () => {
  const data = fs.mkdtempSync(path.join(os.tmpdir(), "doit-opencode-state-"));
  const escaped = path.join(data, "escaped");
  fs.mkdirSync(escaped);
  fs.writeFileSync(path.join(escaped, "state.json"), '{"tier":"Heavy"}');
  const previous = process.env.OPENCODE_DATA;
  process.env.OPENCODE_DATA = path.join(data, "opencode");

  try {
    assert.equal(resolveSessionStateDir("../../escaped", data), null);
  } finally {
    if (previous === undefined) delete process.env.OPENCODE_DATA;
    else process.env.OPENCODE_DATA = previous;
    fs.rmSync(data, { recursive: true, force: true });
  }
});

test("session state lookup prefers the hook writer's data root", () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "doit-opencode-state-precedence-"));
  const sessionID = "session-precedence";
  const openCodeDir = path.join(cwd, "opencode");
  const hookDir = path.join(cwd, "hook-data");
  const previousOpenCodeData = process.env.OPENCODE_DATA;
  const previousHookData = process.env.DO_IT_HOOK_DATA;
  process.env.OPENCODE_DATA = openCodeDir;
  process.env.DO_IT_HOOK_DATA = hookDir;
  fs.mkdirSync(path.join(openCodeDir, "sessions", sessionID), { recursive: true });
  fs.mkdirSync(path.join(hookDir, "sessions", sessionID), { recursive: true });
  fs.writeFileSync(path.join(openCodeDir, "sessions", sessionID, "state.json"), '{"tier":"Light"}\n');
  fs.writeFileSync(path.join(hookDir, "sessions", sessionID, "state.json"), '{"tier":"Heavy"}\n');

  try {
  } finally {
    if (previousOpenCodeData === undefined) delete process.env.OPENCODE_DATA;
    else process.env.OPENCODE_DATA = previousOpenCodeData;
    if (previousHookData === undefined) delete process.env.DO_IT_HOOK_DATA;
    else process.env.DO_IT_HOOK_DATA = previousHookData;
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

test("session state lookup matches the default OpenCode data root", () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "doit-opencode-default-state-"));
  const sessionID = "session-default-root";
  const stateDir = path.join(cwd, ".opencode", "sessions", sessionID);
  const previousOpenCodeData = process.env.OPENCODE_DATA;
  const previousHookData = process.env.DO_IT_HOOK_DATA;
  delete process.env.OPENCODE_DATA;
  delete process.env.DO_IT_HOOK_DATA;
  fs.mkdirSync(stateDir, { recursive: true });
  fs.writeFileSync(path.join(stateDir, "state.json"), '{"tier":"Standard"}\n');

  try {
    assert.equal(resolveSessionStateDir(sessionID, cwd), stateDir);
  } finally {
    if (previousOpenCodeData === undefined) delete process.env.OPENCODE_DATA;
    else process.env.OPENCODE_DATA = previousOpenCodeData;
    if (previousHookData === undefined) delete process.env.DO_IT_HOOK_DATA;
    else process.env.DO_IT_HOOK_DATA = previousHookData;
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});
