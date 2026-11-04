import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { PI_MODEL, runPiPrompt } from "../../evals/behavior/hosts/pi-sdk.mjs";
import { buildTrajectory } from "../../evals/behavior/hosts/trajectory.mjs";
import { diffWrites, readTreeFiles } from "../../evals/behavior/hosts/workspace.mjs";
import { passingNodeTest } from "../../evals/behavior/evidence.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const plugin = path.join(root, "plugins/do-it-pi");
const sdk = await import(pathToFileURL(path.join(plugin, "node_modules/@earendil-works/pi-coding-agent/dist/index.js")));
const ai = await import(pathToFileURL(path.join(plugin, "node_modules/@earendil-works/pi-ai/dist/index.js")));

for (const masked of [false, true]) {
  test(`native Pi evaluation ${masked ? "rejects a masked failure" : "credits a completed write and quoted test glob"}`,
    { skip: process.platform === "win32", timeout: 30_000 }, async () => {
      const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "do-it-pi-evidence-"));
      const home = fs.mkdtempSync(path.join(os.tmpdir(), "do-it-pi-evidence-home-"));
      const authDir = path.join(home, ".pi", "agent");
      const previousEnv = Object.fromEntries(["HOME", "NODE_TEST_CONTEXT", "NODE_OPTIONS"]
        .map(key => [key, process.env[key]]));
      const previousFetch = globalThis.fetch;
      process.env.HOME = home;
      // Nested Node test runners can silently skip execution when they inherit
      // their enclosing runner's context; this fixture must run the real test.
      delete process.env.NODE_TEST_CONTEXT;
      delete process.env.NODE_OPTIONS;
      globalThis.fetch = async () => { throw new Error("Native evidence test must not use the network"); };
      try {
        fs.mkdirSync(authDir, { recursive: true });
        fs.writeFileSync(path.join(authDir, "auth.json"), JSON.stringify({
          deepseek: { type: "api_key", key: "fixture-only-not-a-credential" }
        }));
        fs.mkdirSync(path.join(cwd, "tests"));
        fs.writeFileSync(path.join(cwd, "auth.mjs"), "export const authorized = () => null;\n");
        fs.writeFileSync(path.join(cwd, "tests/auth.test.mjs"), [
          "import test from 'node:test';",
          "import assert from 'node:assert/strict';",
          "import { authorized } from '../auth.mjs';",
          "test('authorization contract', () => assert.equal(authorized(), true));"
        ].join("\n"));
        const original = readTreeFiles(cwd);
        // Only the model provider is scripted. Session, tools, resource loading,
        // hooks, event capture and normalization use their production paths.
        const fake = ai.fauxProvider({
          provider: PI_MODEL.provider,
          models: [{ id: PI_MODEL.id, reasoning: true }]
        });
        fake.setResponses([
          ai.fauxAssistantMessage(ai.fauxToolCall("write", {
            path: "auth.mjs", content: `export const authorized = () => ${!masked};\n`
          }), { stopReason: "toolUse" }),
          ai.fauxAssistantMessage(ai.fauxToolCall("bash", {
            command: `node --test 'tests/*.test.mjs'${masked ? "; echo wrapper-finished" : ""}`
          }), { stopReason: "toolUse" }),
          ai.fauxAssistantMessage("VERIFIED. Tests passed.")
        ]);
        const raw = await runPiPrompt({
          repoRoot: root, cwd, condition: "kernel", pluginRoot: plugin,
          prompt: "Fix the authorization return value and run its test.",
          env: { HOME: home, PI_CODING_AGENT_DIR: authDir },
          importSdk: async () => ({
            ...sdk,
            ModelRuntime: {
              async create(options) {
                assert.equal(options.allowModelNetwork, false);
                const runtime = await sdk.ModelRuntime.create(options);
                runtime.registerNativeProvider(fake.provider);
                return runtime;
              }
            }
          })
        });
        assert.equal(fake.state.callCount, 3);
        assert.equal(raw.injectedTexts.some(text => text.includes("Preserve the user's goal")), true,
          "kernel comparison must actually receive Core context");
        const files = readTreeFiles(cwd);
        const trajectory = buildTrajectory({
          ...raw, cwd, fixtureMeta: { relevant_tests: ["tests/auth.test.mjs"] },
          existingTargets: ["tests/auth.test.mjs"], workspacePaths: Object.keys(files),
          diffWrites: diffWrites(original, files)
        });
        const commands = trajectory.steps.filter(step => step.type === "command");
        assert.equal(commands.length, 1);
        assert.equal(commands[0].exit, 0, "both the good command and masking wrapper exit zero");
        assert.equal(commands[0].evidence.exit_source, "structured_exit_code");
        assert.equal(commands[0].evidence.ordering, "observed");
        assert.equal(passingNodeTest(commands[0], "tests/auth.test.mjs"), !masked);
        assert.equal(trajectory.steps.filter(step => step.type === "write").length, 1,
          "the actual completed full write must explain the final diff without a late phantom write");
        if (masked) {
          const bash = raw.events.find(event => event.name === "bash");
          assert.match(bash.result.structuredContent.output, /(?:ℹ|#)\s+fail\s+1\b/);
          assert.equal(commands[0].evidence.invocation, "unsupported");
          assert.equal(commands[0].evidence.summary, null);
        } else {
          assert.deepEqual(commands[0].evidence.selected_tests, ["tests/auth.test.mjs"]);
          assert.equal(commands[0].evidence.summary.pass, 1);
        }
      } finally {
        globalThis.fetch = previousFetch;
        for (const [key, value] of Object.entries(previousEnv)) {
          if (value === undefined) delete process.env[key];
          else process.env[key] = value;
        }
        fs.rmSync(cwd, { recursive: true, force: true });
        fs.rmSync(home, { recursive: true, force: true });
      }
    });
}
