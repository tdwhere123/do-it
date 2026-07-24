import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type {
	ExtensionAPI,
	ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { BOOTSTRAP_TEXT } from "./bootstrap.ts";
import {
	buildHookPayload,
	isEditTool,
	resolveBash,
	spawnHook,
	terminateActiveProcesses,
	type HookPayload,
	type HookResult,
	type HookRunnerOptions,
} from "./bridge.ts";

const defaultPluginRoot = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	"..",
);
const COMPLETION_PATTERN =
	/(完成|已修|通过|完工|\bdone\b|\bpassed\b|\bfixed\b|\bimplemented\b|\ball set\b|it works|works now|successfully|\bVERIFIED\b|ready to merge|ship it|ready to (ship|publish))/i;
const VERIFY_REMINDER =
	"<system-reminder>do-it: previous turn used completion language. Before claiming done, cite fresh verification evidence on this worktree (tests/build/diff) or say NOT_VERIFIED.</system-reminder>";

type MessagePart = { type?: unknown; text?: unknown };
type MessageLike = { role?: unknown; content?: unknown };
type HookRunner = (
	hooksDir: string,
	scriptName: string,
	payload: HookPayload,
	options?: HookRunnerOptions,
) => Promise<HookResult>;

export type DoItPiExtensionDependencies = {
	env?: NodeJS.ProcessEnv;
	pluginRoot?: string;
	runHook?: HookRunner;
};

export function resolvePiAgentDir(
	env: NodeJS.ProcessEnv = process.env,
): string {
	const configured = env.PI_CODING_AGENT_DIR?.trim();
	if (configured) return path.resolve(configured);
	const home = env.HOME?.trim() || env.USERPROFILE?.trim() || os.homedir();
	return path.join(home, ".pi", "agent");
}

export function isPiSubagent(env: NodeJS.ProcessEnv = process.env): boolean {
	return env.PI_SUBAGENT_CHILD === "1";
}

export function appendToolResultContext<T>(
	content: readonly T[],
	additionalContext: string,
): Array<T | { type: "text"; text: string }> {
	const context = additionalContext.trim();
	if (!context) return [...content];
	return [...content, { type: "text", text: context }];
}

function textFromContent(content: unknown): string {
	if (typeof content === "string") return content;
	if (!Array.isArray(content)) return "";
	return content
		.filter(
			(part): part is MessagePart => typeof part === "object" && part !== null,
		)
		.filter((part) => part.type === "text" && typeof part.text === "string")
		.map((part) => part.text as string)
		.join("\n");
}

export function assistantTextFromMessages(
	messages: readonly MessageLike[],
): string {
	for (let index = messages.length - 1; index >= 0; index -= 1) {
		const message = messages[index];
		if (message?.role !== "assistant") continue;
		return textFromContent(message.content);
	}
	return "";
}

function transcriptPath(ctx: ExtensionContext): string {
	try {
		return ctx.sessionManager.getSessionFile() ?? "";
	} catch {
		return "";
	}
}

function resultContext(result: HookResult): string | undefined {
	if (result.exitCode === 0 && typeof result.additionalContext === "string") {
		const context = result.additionalContext.trim();
		if (context) return context;
	}
	if (result.diagnostic)
		return `<system-reminder>do-it: ${result.diagnostic}</system-reminder>`;
	return undefined;
}

export function createDoItPiExtension(
	dependencies: DoItPiExtensionDependencies = {},
) {
	const env = { ...(dependencies.env ?? process.env) };
	const pluginRoot = dependencies.pluginRoot ?? defaultPluginRoot;
	const hooksDir = path.join(pluginRoot, "hooks");
	const agentDir = resolvePiAgentDir(env);
	const dataDir = path.join(agentDir, "do-it-data");
	const runHook = dependencies.runHook ?? spawnHook;
	const childProcess = isPiSubagent(env);

	const bootstrappedSessions = new Set<string>();
	const pendingVerifyReminder = new Set<string>();
	const completionText = new Map<string, string>();
	const anonymousSessions = new WeakMap<object, string>();
	let anonymousSessionSequence = 0;
	let lastDiagnostic: string | undefined;

	function ensureDataDir(): void {
		try {
			fs.mkdirSync(dataDir, { recursive: true });
		} catch (error) {
			lastDiagnostic = `do-it data directory unavailable (${dataDir}): ${error instanceof Error ? error.message : String(error)}`;
		}
	}

	function sessionId(ctx: ExtensionContext): string {
		try {
			const id = ctx.sessionManager.getSessionId();
			if (typeof id === "string" && id.length > 0) return id;
		} catch {
			// Fall back to a stable identity for this in-process session manager.
		}
		const manager = ctx.sessionManager as object;
		const existing = anonymousSessions.get(manager);
		if (existing) return existing;
		anonymousSessionSequence += 1;
		const generated = `pi-session-${anonymousSessionSequence}`;
		anonymousSessions.set(manager, generated);
		return generated;
	}

	function hookEnvironment(): NodeJS.ProcessEnv {
		ensureDataDir();
		return {
			...env,
			PI_CODING_AGENT_DIR: agentDir,
			DO_IT_HOOK_DATA: dataDir,
			PLUGIN_DATA: dataDir,
			CLAUDE_PLUGIN_DATA: dataDir,
			CLAUDE_PLUGIN_ROOT: pluginRoot,
			PLUGIN_ROOT: pluginRoot,
		};
	}

	async function invokeHook(
		scriptName: string,
		payload: HookPayload,
		ctx: ExtensionContext,
	): Promise<HookResult> {
		try {
			const result = await runHook(hooksDir, scriptName, payload, {
				env: hookEnvironment(),
				signal: ctx.signal,
			});
			if (result.diagnostic) lastDiagnostic = result.diagnostic;
			return result;
		} catch (error) {
			const diagnostic = `do-it hook ${scriptName} failed: ${error instanceof Error ? error.message : String(error)}`;
			lastDiagnostic = diagnostic;
			return {
				exitCode: 1,
				stdout: "",
				stderr: diagnostic,
				diagnostic,
			};
		}
	}

	function basePayload(
		ctx: ExtensionContext,
		values: Omit<
			Parameters<typeof buildHookPayload>[0],
			"sessionId" | "cwd" | "transcriptPath"
		>,
	): HookPayload {
		return buildHookPayload({
			sessionId: sessionId(ctx),
			cwd: ctx.cwd,
			transcriptPath: transcriptPath(ctx),
			...values,
		});
	}

	return function doItPiExtension(pi: ExtensionAPI): void {
		pi.registerCommand("do-it-status", {
			description: "Show do-it Pi adapter status and last hook diagnostic.",
			handler: async (_args, ctx) => {
				const hasSubagentRuntime = pi
					.getAllTools()
					.some((tool) => tool.name === "subagent");
				const status = [
					`do-it Pi adapter: active`,
					`session role: ${childProcess ? "subagent" : "root"}`,
					`hooks directory: ${hooksDir}`,
					`data directory: ${dataDir}`,
					`Bash hook runner: ${resolveBash(env) ? "available" : "unavailable"}`,
					hasSubagentRuntime
						? "subagent tool: registered; this command does not verify do-it.* package-agent discovery"
						: "subagent tool: not registered (optional pi-subagents missing; extension, skills, and prompts remain active)",
					`last hook diagnostic: ${lastDiagnostic ?? "none"}`,
				].join("\n");
				if (ctx.hasUI)
					ctx.ui.notify(status, lastDiagnostic ? "warning" : "info");
			},
		});

		pi.on("session_start", async () => {
			ensureDataDir();
		});

		pi.on("before_agent_start", async (event, ctx) => {
			const sid = sessionId(ctx);
			const prompt = typeof event.prompt === "string" ? event.prompt : "";
			const contexts: string[] = [];

			if (childProcess) {
				const result = await invokeHook(
					"subagent-stance.sh",
					basePayload(ctx, { prompt }),
					ctx,
				);
				const context = resultContext(result);
				if (context) contexts.push(context);
			} else {
				if (!bootstrappedSessions.has(sid)) {
					contexts.push(BOOTSTRAP_TEXT);
					bootstrappedSessions.add(sid);
				}

				if (pendingVerifyReminder.delete(sid)) contexts.push(VERIFY_REMINDER);

				if (prompt.trim()) {
					const payload = basePayload(ctx, { prompt });
					for (const scriptName of ["router.sh", "grill-prompt.sh"]) {
						if (ctx.signal?.aborted) break;
						const result = await invokeHook(scriptName, payload, ctx);
						const context = resultContext(result);
						if (context) contexts.push(context);
						if (result.unavailable) break;
					}
				}
			}

			if (contexts.length === 0) return undefined;
			return {
				message: {
					customType: "do-it",
					content: contexts.join("\n\n"),
					display: false,
				},
			};
		});

		pi.on("tool_result", async (event, ctx) => {
			if (childProcess || !isEditTool(event.toolName)) return undefined;

			const result = await invokeHook(
				"write-quality-lint.sh",
				basePayload(ctx, {
					toolName: event.toolName,
					input: event.input,
					content: event.content,
				}),
				ctx,
			);
			const context = resultContext(result);
			if (!context) return undefined;

			return {
				content: appendToolResultContext(event.content, context),
				details: event.details,
				isError: event.isError,
			};
		});

		pi.on("agent_end", async (event, ctx) => {
			if (childProcess) return;
			completionText.set(
				sessionId(ctx),
				assistantTextFromMessages(event.messages),
			);
		});

		pi.on("agent_settled", async (_event, ctx) => {
			if (childProcess) return;
			const sid = sessionId(ctx);
			const text = completionText.get(sid) ?? "";
			completionText.delete(sid);
			if (!COMPLETION_PATTERN.test(text) || /\bNOT_VERIFIED\b/i.test(text))
				return;
			pendingVerifyReminder.add(sid);
		});

		pi.on("session_shutdown", async () => {
			bootstrappedSessions.clear();
			pendingVerifyReminder.clear();
			completionText.clear();
			terminateActiveProcesses();
		});
	};
}

export default createDoItPiExtension();
