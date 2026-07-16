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
  extractFilePath,
  isEditTool,
  normalizeToolName,
  parseHookOutput,
  readSessionTier,
  resolveBash,
  resolveSessionStateDir,
  spawnHook,
  windowsTaskkill
} = await import(bridgeUrl);
const {
  cleanupStaleVerificationTemps,
  createVerificationTranscript,
  safeSessionKey
} = await import(indexUrl);

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

test("buildHookPayload extracts file_path from args", () => {
  const result = buildHookPayload({
    sessionID: "sess-1",
    cwd: "/tmp/project",
    tool: "edit",
    args: { file_path: "src/index.ts", new_string: "x" }
  });

  assert.equal(result.session_id, "sess-1");
  assert.equal(result.cwd, "/tmp/project");
  assert.equal(result.tool_name, "Edit");
  assert.equal(result.file_path, "src/index.ts");
  assert.deepEqual(result.tool_input, { file_path: "src/index.ts", new_string: "x" });
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
    assert.equal(readSessionTier(sessionID, cwd), "Heavy");
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
    assert.equal(readSessionTier(sessionID, cwd), "Standard");
  } finally {
    if (previousOpenCodeData === undefined) delete process.env.OPENCODE_DATA;
    else process.env.OPENCODE_DATA = previousOpenCodeData;
    if (previousHookData === undefined) delete process.env.DO_IT_HOOK_DATA;
    else process.env.DO_IT_HOOK_DATA = previousHookData;
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

test("verification transcript keeps shell details private and does not satisfy an advisory reminder", () => {
  const tempParent = fs.mkdtempSync(path.join(os.tmpdir(), "doit-opencode-evidence-"));
  const transcript = createVerificationTranscript("evidence", {
    data: [
      { info: { role: "user" }, parts: [{ type: "text", text: "change it" }] },
      { info: { role: "assistant" }, parts: [
        { type: "tool", callID: "edit-1", tool: "edit", state: { status: "completed", input: {} } },
        { type: "tool", callID: "echo-1", tool: "bash", state: { status: "completed", input: { command: "echo npm test" } } },
        { type: "tool", callID: "secret-1", tool: "bash", state: { status: "completed", input: { command: "API_TOKEN=supersecret npm test" } } },
        { type: "text", text: "Done." }
      ] }
    ]
  }, { tempParent });

  try {
    assert.ok(transcript);
    const rows = fs.readFileSync(transcript.path, "utf8");
    assert.doesNotMatch(rows, /echo npm test|supersecret|API_TOKEN/);
    assert.match(rows, /"command":"npm test"/);

    const gate = spawnSync("bash", [path.join(repoRoot, "hooks", "verification-gate.sh")], {
      cwd: repoRoot,
      encoding: "utf8",
      input: JSON.stringify({
        session_id: "opencode-wrapper-evidence",
        cwd: repoRoot,
        transcript_path: transcript.path,
        stop_hook_active: "false"
      }),
      env: { ...process.env, DO_IT_HOOK_DATA: path.join(tempParent, "hook-data") }
    });
    assert.equal(gate.status, 0, gate.stderr);
    assert.match(gate.stdout, /do-it verify \(advisory\)/);
    assert.match(gate.stdout, /does not infer verification from command names/);
  } finally {
    transcript?.cleanup();
    fs.rmSync(tempParent, { recursive: true, force: true });
  }
});

test("verification transcript keeps only current-turn fields and remains advisory", () => {
  const tempParent = fs.mkdtempSync(path.join(os.tmpdir(), "doit-opencode-private-"));
  const sessionID = "../../outside/secret-session";
  const transcript = createVerificationTranscript(sessionID, {
    data: [
      {
        info: { role: "user" },
        parts: [{ type: "text", text: "old private project prompt" }]
      },
      {
        info: { role: "assistant" },
        parts: [{ type: "text", text: "old assistant transcript" }]
      },
      {
        info: { role: "user" },
        parts: [{ type: "text", text: "current private project prompt" }]
      },
      {
        info: { role: "assistant" },
        parts: [
          {
            type: "tool",
            callID: "edit-1",
            tool: "edit",
            state: {
              status: "completed",
              input: { file_path: "src/private.ts", new_string: "private source" },
              output: "private edit output"
            }
          },
          {
            type: "tool",
            callID: "bash-1",
            tool: "bash",
            state: {
              status: "completed",
              input: { command: "npm test" },
              output: "private passing output"
            }
          },
          {
            type: "tool",
            callID: "bash-2",
            tool: "bash",
            state: {
              status: "error",
              input: { command: "npm test -- --secret-token", description: "private metadata" },
              error: "private test output"
            }
          },
          { type: "text", text: "Done with the requested change." }
        ]
      }
    ]
  }, { tempParent });

  try {
    assert.ok(transcript);
    assert.match(path.basename(path.dirname(transcript.path)), new RegExp(`^do-it-opencode-${safeSessionKey(sessionID)}-`));
    assert.equal(path.dirname(path.dirname(transcript.path)), tempParent);
    const rows = fs.readFileSync(transcript.path, "utf8");
    const records = rows.trimEnd().split("\n").map((row) => JSON.parse(row));
    const frameIndex = (type, idKey, id) => records.findIndex((record) =>
      record.message?.content?.some((block) => block.type === type && block[idKey] === id)
    );
    assert.ok(frameIndex("tool_result", "tool_use_id", "edit-1") > frameIndex("tool_use", "id", "edit-1"));
    assert.ok(frameIndex("tool_result", "tool_use_id", "bash-1") > frameIndex("tool_use", "id", "bash-1"));

    const gate = spawnSync("bash", [path.join(repoRoot, "hooks", "verification-gate.sh")], {
      cwd: repoRoot,
      encoding: "utf8",
      input: JSON.stringify({
        session_id: "opencode-paired-evidence",
        cwd: repoRoot,
        transcript_path: transcript.path,
        stop_hook_active: "false"
      }),
      env: {
        ...process.env,
        DO_IT_HOOK_DATA: path.join(tempParent, "hook-data")
      }
    });
    assert.equal(gate.status, 0, gate.stderr);
    assert.match(gate.stdout, /do-it verify \(advisory\)/);
    assert.match(gate.stdout, /does not infer verification from command names/);

    assert.match(rows, /"type":"user"/);
    assert.match(rows, /"name":"Edit"/);
    assert.match(rows, /"name":"Bash"/);
    assert.match(rows, /"command":"npm test"/);
    assert.match(rows, /"type":"tool_result".*"status":"completed"/);
    assert.match(rows, /"type":"tool_result".*"status":"error"/);
    assert.match(rows, /"text":"Done\."/);
    assert.doesNotMatch(rows, /old private|current private|private source|private edit output|private metadata|private test output|secret-token|src\/private/);
    if (process.platform !== "win32") {
      assert.equal(fs.statSync(path.dirname(transcript.path)).mode & 0o777, 0o700);
      assert.equal(fs.statSync(transcript.path).mode & 0o777, 0o600);
    }
  } finally {
    transcript?.cleanup();
    assert.equal(transcript ? fs.existsSync(path.dirname(transcript.path)) : false, false);
    fs.rmSync(tempParent, { recursive: true, force: true });
  }
});

test("verification temp cleanup prunes only stale adapter directories", () => {
  const tempParent = fs.mkdtempSync(path.join(os.tmpdir(), "doit-opencode-ttl-"));
  const staleTranscript = createVerificationTranscript("stale", { data: [
    { info: { role: "user" }, parts: [{ type: "text", text: "change it" }] },
    { info: { role: "assistant" }, parts: [{ type: "text", text: "Done." }] }
  ] }, { tempParent });
  const freshTranscript = createVerificationTranscript("fresh", { data: [
    { info: { role: "user" }, parts: [{ type: "text", text: "change it" }] },
    { info: { role: "assistant" }, parts: [{ type: "text", text: "Done." }] }
  ] }, { tempParent });
  assert.ok(staleTranscript);
  assert.ok(freshTranscript);
  const stale = path.dirname(staleTranscript.path);
  const fresh = path.dirname(freshTranscript.path);
  const forged = fs.mkdtempSync(path.join(tempParent, `do-it-opencode-${safeSessionKey("forged")}-`));
  fs.writeFileSync(path.join(forged, "keep.txt"), "not owned by the adapter\n");
  const unrelated = fs.mkdtempSync(path.join(tempParent, "unrelated-"));
  const now = Date.now();
  fs.utimesSync(stale, new Date(now - 60_000), new Date(now - 60_000));
  fs.utimesSync(forged, new Date(now - 60_000), new Date(now - 60_000));

  try {
    cleanupStaleVerificationTemps(tempParent, now, 10_000);
    assert.equal(fs.existsSync(stale), false);
    assert.equal(fs.existsSync(fresh), true);
    assert.equal(fs.existsSync(forged), true, "prefix and age alone must not authorize recursive deletion");
    assert.equal(fs.readFileSync(path.join(forged, "keep.txt"), "utf8"), "not owned by the adapter\n");
    assert.equal(fs.existsSync(unrelated), true);
  } finally {
    fs.rmSync(tempParent, { recursive: true, force: true });
  }
});
