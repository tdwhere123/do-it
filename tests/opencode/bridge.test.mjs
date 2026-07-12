import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const bridgeJs = path.join(repoRoot, "plugins/do-it-opencode/dist/bridge.js");
const indexJs = path.join(repoRoot, "plugins/do-it-opencode/dist/index.js");
assert.ok(fs.existsSync(bridgeJs), "run npm run build:opencode-plugin before test-opencode");
assert.ok(fs.existsSync(indexJs), "run npm run build:opencode-plugin before test-opencode");
const bridgeUrl = pathToFileURL(bridgeJs).href;
const indexUrl = pathToFileURL(indexJs).href;

const {
  buildHookPayload,
  extractFilePath,
  isEditTool,
  normalizeToolName,
  parseHookOutput
} = await import(bridgeUrl);
const { writeOpenCodeTranscript } = await import(indexUrl);

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
  const payload = buildHookPayload({
    sessionID: "sess-1",
    cwd: "/tmp/project",
    tool: "edit",
    args: { file_path: "src/index.ts", new_string: "x" }
  });

  assert.equal(payload.session_id, "sess-1");
  assert.equal(payload.cwd, "/tmp/project");
  assert.equal(payload.tool_name, "Edit");
  assert.equal(payload.file_path, "src/index.ts");
  assert.deepEqual(payload.tool_input, { file_path: "src/index.ts", new_string: "x" });
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

test("writeOpenCodeTranscript adapts user, edits, shell evidence, and assistant claims", () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "doit-opencode-transcript-"));
  try {
    const output = writeOpenCodeTranscript("sess-1", cwd, {
      data: [
        { type: "user", text: "fix it" },
        { type: "assistant", content: [{ type: "tool", name: "edit", state: { input: { file_path: "x.ts" } } }] },
        { type: "shell", command: "pnpm test" },
        { type: "assistant", content: [{ type: "text", text: "task done" }] }
      ]
    });
    assert.ok(output);
    const rows = fs.readFileSync(output, "utf8");
    assert.match(rows, /"type":"user"/);
    assert.match(rows, /"name":"Edit"/);
    assert.match(rows, /"name":"Bash"/);
    assert.match(rows, /task done/);
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});
