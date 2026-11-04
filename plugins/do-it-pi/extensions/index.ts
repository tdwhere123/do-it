import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type {
	ExtensionAPI,
	ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import {
	buildHookPayload,
	createHookProcessOwner,
	isEditTool,
	isEvidenceTool,
	resolveBash,
	spawnHook,
	type HookProcessOwner,
	type HookPayload,
	type HookResult,
	type HookRunnerOptions,
} from "./bridge.ts";

const defaultPluginRoot = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	"..",
);
type MessagePart = { type?: unknown; text?: unknown };
type MessageLike = { role?: unknown; content?: unknown; customType?: unknown; details?: unknown };
type Reminder = { role: "root" | "child"; kind: "stance" | "context" | "diagnostic" };
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

function hasSubagentTool(pi: Pick<ExtensionAPI, "getAllTools">): boolean {
	return pi.getAllTools().some((tool) => tool.name === "Agent" || tool.name === "subagent");
}

export function piSessionRole(
	env: NodeJS.ProcessEnv = process.env,
	pi?: Pick<ExtensionAPI, "events">,
): "child" | "root" | "unmarked" {
	// nicobailon's subprocess contract remains separate from Tintinweb's
	// in-process session identity. Never flip process.env for a child session.
	if (env.PI_SUBAGENT_CHILD === "1") return "child";
	let role: "child" | "root" | "unmarked" = "unmarked";
	pi?.events.emit("subagents:session-context", {
		reply(value: unknown) {
			if (!value || typeof value !== "object") return;
			const context = value as Record<string, unknown>;
			if (context.version === 1 && context.runtime === "@tintinweb/pi-subagents" &&
				(context.role === "child" || context.role === "root")) role = context.role;
		},
	});
	return role;
}

export function isPiSubagent(
	env: NodeJS.ProcessEnv = process.env,
	pi?: Pick<ExtensionAPI, "events">,
): boolean {
	return piSessionRole(env, pi) === "child";
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

// Only extension-owned messages are policy reminders. User text and other
// extensions' messages must survive even when they quote the same wording.
function ownedReminder(message: MessageLike): Reminder | undefined {
	if (message.role !== "custom" || message.customType !== "do-it") return undefined;
	const details = message.details as { doIt?: Record<string, unknown> } | undefined;
	const marker = details?.doIt;
	if (marker?.version === 1 && (marker.role === "root" || marker.role === "child") &&
		(marker.kind === "stance" || marker.kind === "context" || marker.kind === "diagnostic")) {
		return { role: marker.role, kind: marker.kind };
	}
	// Prior adapters persisted a string and no metadata. Recognize only their
	// owned, anchored signatures, not phrases embedded in arbitrary content.
	if (marker !== undefined || typeof message.content !== "string") return undefined;
	const content = message.content.trim();
	if (/^<system-reminder>\s*do-it subagent stance: [\s\S]*<\/system-reminder>$/.test(content)) {
		return { role: "child", kind: "stance" };
	}
	if (content.startsWith("Do-it: Preserve the user's goal,") ||
		content.startsWith("Do-it kernel: read current repository truth")) {
		return { role: "root", kind: "context" };
	}
	return undefined;
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
	const pluginRoot = dependencies.pluginRoot ?? defaultPluginRoot;
	const hooksDir = path.join(pluginRoot, "hooks");
	const runHook = dependencies.runHook ?? spawnHook;

	function currentEnv(): NodeJS.ProcessEnv {
		return dependencies.env ?? process.env;
	}

	function agentDir(): string {
		return resolvePiAgentDir(currentEnv());
	}

	function dataDir(): string {
		return path.join(agentDir(), "do-it-data");
	}

	const anonymousSessions = new WeakMap<object, string>();
	let anonymousSessionSequence = 0;
	let lastDiagnostic: string | undefined;

	function ensureDataDir(): void {
		const dir = dataDir();
		try {
			fs.mkdirSync(dir, { recursive: true });
		} catch (error) {
			lastDiagnostic = `do-it data directory unavailable (${dir}): ${error instanceof Error ? error.message : String(error)}`;
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
		const env = currentEnv();
		const resolvedAgentDir = agentDir();
		const resolvedDataDir = dataDir();
		return {
			...env,
			PI_CODING_AGENT_DIR: resolvedAgentDir,
			DO_IT_HOOK_DATA: resolvedDataDir,
			PLUGIN_DATA: resolvedDataDir,
			CLAUDE_PLUGIN_DATA: resolvedDataDir,
			CLAUDE_PLUGIN_ROOT: pluginRoot,
			PLUGIN_ROOT: pluginRoot,
			DO_IT_EVENT_HOST: "pi",
		};
	}

	function detailsRecord(
		details: unknown,
	): Record<string, unknown> | undefined {
		if (details && typeof details === "object" && !Array.isArray(details)) {
			return details as Record<string, unknown>;
		}
		return undefined;
	}

	async function invokeHook(
		scriptName: string,
		payload: HookPayload,
		ctx: ExtensionContext,
		processOwner: HookProcessOwner,
		role: ReturnType<typeof piSessionRole>,
	): Promise<HookResult> {
		try {
			const result = await runHook(hooksDir, scriptName, payload, {
				// The shell hook also checks child identity. Scope the explicit flag
				// to this invocation; in-process siblings share process.env.
				env: {
					...hookEnvironment(),
					// Unmarked stays explicit in status, but its documented hook
					// default is root. Do not re-infer identity from file paths.
					DO_IT_PI_SESSION_ROLE: role === "child" ? "child" : "root",
					...(role === "child" ? { PI_SUBAGENT_CHILD: "1" } : {}),
				},
				signal: ctx.signal,
				processOwner,
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
			"sessionId" | "cwd" | "model"
		>,
	): HookPayload {
		return buildHookPayload({
			sessionId: sessionId(ctx),
			cwd: ctx.cwd,
			model: ctx.model
				? `${ctx.model.provider}/${ctx.model.id}`
				: undefined,
			transcriptPath: transcriptPath(ctx),
			...values,
		});
	}

	return function doItPiExtension(pi: ExtensionAPI): void {
		const processOwner = createHookProcessOwner();

		pi.registerCommand("do-it-status", {
			description: "Show do-it Pi adapter status and last hook diagnostic.",
			handler: async (_args, ctx) => {
				const hasSubagentRuntime = hasSubagentTool(pi);
				const role = piSessionRole(currentEnv(), pi);
				const status = [
					`do-it Pi adapter: active`,
					`session role: ${role === "child" ? "subagent" : role}`,
					...(role === "unmarked" ? ["runtime identity unavailable: root hooks apply; unpatched Tintinweb children are unsupported"] : []),
					`hooks directory: ${hooksDir}`,
					`data directory: ${dataDir()}`,
					`Bash hook runner: ${resolveBash(currentEnv()) ? "available" : "unavailable"}`,
					hasSubagentRuntime
						? "subagent tool: registered; this command does not verify package-agent discovery or source"
						: "subagent tool: not registered in this session; extension, skills, and prompts remain active",
					`last hook diagnostic: ${lastDiagnostic ?? "none"}`,
				].join("\n");
				if (ctx.hasUI)
					ctx.ui.notify(status, lastDiagnostic ? "warning" : "info");
			},
		});

		pi.on("session_start", async () => {
			ensureDataDir();
		});

		pi.on("context", (event) => {
			const role = piSessionRole(currentEnv(), pi) === "child" ? "child" : "root";
			// Projection only: immutable transcript entries remain available in
			// history/UI and become applicable again if execution role changes.
			return { messages: event.messages.filter((message) => {
				const reminder = ownedReminder(message);
				return !reminder || reminder.role === role;
			}) };
		});

		pi.on("before_agent_start", async (event, ctx) => {
			const role = piSessionRole(currentEnv(), pi);
			let kind: Reminder["kind"] = role === "child" ? "stance" : "context";
			const prompt = "prompt" in event && typeof event.prompt === "string" ? event.prompt : "";
			const contexts: string[] = [];

			if (role === "child") {
				// The SDK's persisted active projection is the receipt, including
				// retained/in-memory sessions. A hook launch or returned-but-lost
				// result never marks delivery; interruption therefore permits retry.
				if (ctx.sessionManager.buildSessionProjection().messages.some((message) =>
					ownedReminder(message)?.kind === "stance")) return undefined;
				const result = await invokeHook(
					"subagent-stance.sh",
					basePayload(ctx, { prompt }),
					ctx,
					processOwner,
					role,
				);
				if (result.exitCode !== 0 || !result.additionalContext?.trim()) kind = "diagnostic";
				const context = resultContext(result);
				if (context) contexts.push(context);
			} else {
				if (prompt.trim()) {
					const payload = basePayload(ctx, { prompt });
          for (const scriptName of ["prompt-submit.sh"]) {
						if (ctx.signal?.aborted) break;
						const result = await invokeHook(scriptName, payload, ctx, processOwner, role);
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
					details: { doIt: { version: 1, role: role === "child" ? "child" : "root", kind } },
					content: contexts.join("\n\n"),
					display: false,
				},
			};
		});

		pi.on("tool_result", async (event, ctx) => {
			const role = piSessionRole(currentEnv(), pi);
			if (role === "child") return undefined;
			if (currentEnv().DO_IT_EVIDENCE_MODE === "observe" && isEvidenceTool(event.toolName)) {
				await invokeHook(
					"evidence-observer.sh",
					basePayload(ctx, {
						toolName: event.toolName,
						input: event.input,
						content: event.content,
						details: detailsRecord(event.details),
					}),
					ctx,
					processOwner,
					role,
				);
			}
			if (!isEditTool(event.toolName)) return undefined;

			const result = await invokeHook(
				"write-quality-lint.sh",
				basePayload(ctx, {
					toolName: event.toolName,
					input: event.input,
					content: event.content,
					details: detailsRecord(event.details),
				}),
				ctx,
				processOwner,
				role,
			);
			const context = resultContext(result);
			if (!context) return undefined;

			return {
				content: appendToolResultContext(event.content, context),
				structuredContent: event.structuredContent,
				details: event.details,
				isError: event.isError,
			};
		});

		pi.on("session_shutdown", async () => {
			processOwner.terminate();
		});
	};
}

export default createDoItPiExtension();
