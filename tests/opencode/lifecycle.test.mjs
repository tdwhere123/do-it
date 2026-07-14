import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const indexJs = path.join(repoRoot, "plugins/do-it-opencode/dist/index.js");
assert.ok(fs.existsSync(indexJs), "build plugins/do-it-opencode before running these tests");
const { DoItOpencodePlugin, injectedSessions, safeSessionKey } = await import(pathToFileURL(indexJs).href);

function message(info, parts) {
  return { info, parts };
}

test("template does not auto-allow edit, write, or bash", () => {
  const template = JSON.parse(
    fs.readFileSync(path.join(repoRoot, "plugins/do-it-opencode/opencode.json.template"), "utf8")
  );
  assert.equal(template.permission.skill, "allow");
  assert.equal(Object.hasOwn(template.permission, "edit"), false);
  assert.equal(Object.hasOwn(template.permission, "write"), false);
  assert.equal(Object.hasOwn(template.permission, "bash"), false);
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
        messages: async (input) => {
          calls.messages.push(input);
          return {
            data: [
              message({ role: "user", sessionID }, [{ type: "text", text: "private current prompt" }]),
              message({ role: "assistant", sessionID }, [
                {
                  type: "tool",
                  callID: "edit-1",
                  tool: "edit",
                  state: { status: "completed", input: { file_path: "src/a.ts", new_string: "secret" }, output: "edited" }
                },
                { type: "text", text: "Done with the implementation." }
              ])
            ]
          };
        }
      },
      tui: {
        showToast: async (input) => {
          calls.toasts.push(input);
        }
      }
    }
  };

  try {
    const hooks = await DoItOpencodePlugin(host);
    const config = {
      agent: {
        reviewer: { description: "user reviewer", prompt: "keep me", model: "user/model" }
      }
    };
    await hooks.config(config);
    assert.ok(config.skills.paths.some((entry) => entry.endsWith("plugins/do-it-opencode/skills")));
    assert.deepEqual(config.agent.reviewer, { description: "user reviewer", prompt: "keep me", model: "user/model" });
    assert.match(config.agent["code-mapper"].prompt, /Operate as the do-it path map/);
    assert.equal(config.agent["code-mapper"].description.includes("token-bounded map"), true);
    assert.equal(config.agent["code-mapper"].mode, "subagent");
    assert.equal("model" in config.agent["code-mapper"], false);

    const messages = [message({ role: "user", sessionID }, [{ type: "text", text: "implement this" }])];
    await hooks["experimental.chat.messages.transform"]({}, { messages });
    assert.match(messages[0].parts[0].text, /<do-it-bootstrap>/);
    await hooks["experimental.chat.messages.transform"]({}, { messages });
    assert.equal(messages[0].parts[0].text.match(/<do-it-bootstrap>/g).length, 1);

    const promptOutput = { parts: [{ type: "text", text: "Design a migration across packages with several architecture tradeoffs" }] };
    await hooks["chat.message"]({ sessionID }, promptOutput);
    assert.match(promptOutput.parts[0].text, /Design a migration across packages/);

    const editOutput = { title: "Edit", output: "edited", metadata: {} };
    await hooks["tool.execute.after"]({ sessionID, callID: "edit-1", tool: "edit", args: { file_path: "src/a.ts" } }, editOutput);
    assert.equal(typeof editOutput.output, "string");

    injectedSessions.add(sessionID);
    await hooks.event({ event: { type: "session.idle", properties: { sessionID } } });
    assert.deepEqual(calls.messages, [{ path: { id: sessionID }, query: { directory: cwd, limit: 400 } }]);
    assert.equal(calls.toasts.length, 1);
    assert.match(calls.toasts[0].body.message, /verification-gate/);
    assert.equal(calls.toasts[0].body.variant, "warning");
    assert.deepEqual(calls.toasts[0].query, { directory: cwd });
    const verificationPrefix = `do-it-opencode-${safeSessionKey(sessionID)}-`;
    assert.deepEqual(fs.readdirSync(os.tmpdir()).filter((name) => name.startsWith(verificationPrefix)), []);

    await hooks.event({ event: { type: "session.deleted", properties: { info: { id: sessionID } } } });
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

test("idle notifies when session payload cannot synthesize a transcript", async () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "doit-opencode-bad-idle-"));
  const calls = { toasts: [] };
  const sessionID = "session/bad-shape";
  const host = {
    directory: cwd,
    worktree: cwd,
    client: {
      session: {
        messages: async () => ({
          data: [
            // Assistant-only window: edits + completion, but no user boundary.
            message({ role: "assistant", sessionID }, [
              {
                type: "tool",
                callID: "edit-1",
                tool: "edit",
                state: { status: "completed", input: { file_path: "src/a.ts" }, output: "edited" }
              },
              { type: "text", text: "Done with the implementation." }
            ])
          ]
        })
      },
      tui: {
        showToast: async (input) => {
          calls.toasts.push(input);
        }
      }
    }
  };

  try {
    const hooks = await DoItOpencodePlugin(host);
    await hooks.event({ event: { type: "session.idle", properties: { sessionID } } });
    assert.equal(calls.toasts.length, 1);
    assert.match(calls.toasts[0].body.message, /could not synthesize transcript|NOT_VERIFIED/);
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});
