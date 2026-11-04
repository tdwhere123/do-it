import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const plugin = path.join(root, "plugins/do-it-pi");
const sdk = await import(pathToFileURL(path.join(plugin, "node_modules/@earendil-works/pi-coding-agent/dist/index.js")));
const ai = await import(pathToFileURL(path.join(plugin, "node_modules/@earendil-works/pi-ai/dist/index.js")));
const { createDoItPiExtension } = await import(pathToFileURL(path.join(plugin, ".test-dist/extensions/index.js")));

test("Pi 1.5 preserves structured data through a lint advisory", async () => {
	const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "do-it-pi-structured-"));
	const fake = ai.fauxProvider();
	fake.setResponses([
		ai.fauxAssistantMessage(ai.fauxToolCall("edit", { path: "example.ts" }), { stopReason: "toolUse" }),
		ai.fauxAssistantMessage("done"),
	]);
	const runtime = await sdk.ModelRuntime.create({ authPath: path.join(cwd, "auth.json"), allowModelNetwork: false });
	runtime.registerNativeProvider(fake.provider);
	const settings = sdk.SettingsManager.inMemory({ compaction: { enabled: false }, retry: { enabled: false } });
	const loader = new sdk.DefaultResourceLoader({
		cwd, agentDir: cwd, settingsManager: settings,
		noSkills: true, noPromptTemplates: true, noThemes: true, noContextFiles: true,
		extensionFactories: [
			createDoItPiExtension({ env: { HOME: cwd }, runHook: async (_dir, script) => ({
				exitCode: 0, stdout: "", stderr: "",
				...(script === "write-quality-lint.sh" ? { additionalContext: "lint advisory" } : {}),
			}) }),
			(pi) => pi.registerTool({
				name: "edit", label: "fixture edit", description: "Return structured data",
				parameters: { type: "object", properties: { path: { type: "string" } }, required: ["path"] },
				outputSchema: { type: "object", properties: { changed: { type: "boolean" } }, required: ["changed"] },
				execute: async () => ({ content: [{ type: "text", text: "edited" }], structuredContent: { changed: true }, details: { fixture: true } }),
			}),
		],
	});
	let session;
	try {
		await loader.reload();
		assert.deepEqual(loader.getExtensions().errors, []);
		({ session } = await sdk.createAgentSession({
			cwd, agentDir: cwd, modelRuntime: runtime, model: fake.getModel(),
			resourceLoader: loader, settingsManager: settings, sessionManager: sdk.SessionManager.inMemory(cwd),
		}));
		await session.bindExtensions({});
		let result;
		session.subscribe((event) => {
			if (event.type === "tool_execution_end" && event.toolName === "edit") result = event.result;
		});
		await session.prompt("Exercise the fixture tool.");
		assert.equal(fake.state.callCount, 2, "fake provider must reach the tool and next turn");
		assert.deepEqual(result?.structuredContent, { changed: true });
		assert.deepEqual(result?.details, { fixture: true });
		assert.deepEqual(result?.content, [{ type: "text", text: "edited" }, { type: "text", text: "lint advisory" }]);
	} finally {
		session?.dispose();
		fs.rmSync(cwd, { recursive: true, force: true });
	}
});
