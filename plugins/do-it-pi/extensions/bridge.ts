import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

export type HookPayload = {
	session_id: string;
	cwd: string;
	prompt?: string;
	tool_name?: string;
	tool_input?: Record<string, unknown>;
	tool_result?: string;
	file_path?: string;
	transcript_path?: string;
	stop_hook_active?: string;
};

export type HookResult = {
	exitCode: number;
	stdout: string;
	stderr: string;
	additionalContext?: string;
	blockReason?: string;
	diagnostic?: string;
	unavailable?: boolean;
	timedOut?: boolean;
	aborted?: boolean;
};

export type HookRunnerOptions = {
	timeoutMs?: number;
	env?: NodeJS.ProcessEnv;
	platform?: NodeJS.Platform;
	signal?: AbortSignal;
};

type ContentPart = { type?: unknown; text?: unknown };

const EDIT_TOOLS = new Set(["edit", "write", "multiedit"]);
const DEFAULT_HOOK_TIMEOUT_MS = 15_000;
const MAX_HOOK_OUTPUT_BYTES = 256 * 1024;
const MAX_ADDITIONAL_CONTEXT_BYTES = 64 * 1024;
const MAX_BLOCK_REASON_BYTES = 8 * 1024;
const TERMINATION_GRACE_MS = 250;
const activeProcesses = new Map<ReturnType<typeof spawn>, () => void>();

export function normalizeToolName(tool: string): string | null {
	switch (tool.toLowerCase()) {
		case "edit":
			return "Edit";
		case "write":
			return "Write";
		case "multiedit":
			return "MultiEdit";
		default:
			return null;
	}
}

export function isEditTool(tool: string): boolean {
	return EDIT_TOOLS.has(tool.toLowerCase());
}

export function extractFilePath(
	input?: Record<string, unknown>,
): string | undefined {
	if (!input) return undefined;
	for (const key of ["file_path", "path", "filePath"]) {
		const value = input[key];
		if (typeof value === "string" && value.length > 0) return value;
	}
	return undefined;
}

function contentText(content?: readonly ContentPart[]): string | undefined {
	if (!content) return undefined;
	const text = content
		.filter((part) => part?.type === "text" && typeof part.text === "string")
		.map((part) => part.text as string)
		.join("\n")
		.trim();
	return text || undefined;
}

export function buildHookPayload(input: {
	sessionId: string;
	cwd: string;
	prompt?: string;
	toolName?: string;
	input?: Record<string, unknown>;
	content?: readonly ContentPart[];
	transcriptPath?: string;
	stopHookActive?: boolean;
}): HookPayload {
	return {
		session_id: input.sessionId,
		cwd: input.cwd,
		prompt: input.prompt,
		tool_name: input.toolName
			? (normalizeToolName(input.toolName) ?? input.toolName)
			: undefined,
		tool_input: input.input,
		tool_result: contentText(input.content),
		file_path: extractFilePath(input.input),
		transcript_path: input.transcriptPath ?? "",
		...(input.stopHookActive ? { stop_hook_active: "true" } : {}),
	};
}

function boundedProtocolText(
	value: unknown,
	maxBytes: number,
	label: string,
): string | undefined {
	if (typeof value !== "string" || value.length === 0) return undefined;
	const encoded = Buffer.from(value, "utf8");
	if (encoded.byteLength <= maxBytes) return value;
	return `${encoded.subarray(0, maxBytes).toString("utf8")}\n[do-it: ${label} truncated at ${maxBytes} bytes]`;
}

export function parseHookOutput(
	stdout: string,
): Pick<HookResult, "blockReason" | "additionalContext"> {
	const result: Pick<HookResult, "blockReason" | "additionalContext"> = {};
	const trimmed = stdout.trim();
	if (!trimmed) return result;

	for (const line of trimmed.split("\n")) {
		const candidate = line.trim();
		if (!candidate.startsWith("{")) continue;
		try {
			const parsed = JSON.parse(candidate) as Record<string, unknown>;
			const reason = boundedProtocolText(
				parsed.reason,
				MAX_BLOCK_REASON_BYTES,
				"block reason",
			);
			if (parsed.decision === "block" && reason) result.blockReason = reason;

			const hookSpecificOutput = parsed.hookSpecificOutput;
			if (
				hookSpecificOutput &&
				typeof hookSpecificOutput === "object" &&
				!Array.isArray(hookSpecificOutput)
			) {
				const additionalContext = boundedProtocolText(
					(hookSpecificOutput as Record<string, unknown>).additionalContext,
					MAX_ADDITIONAL_CONTEXT_BYTES,
					"additional context",
				);
				if (additionalContext) result.additionalContext = additionalContext;
			}
		} catch {
			// Advisory hooks may mix diagnostics with JSON protocol lines.
		}
	}

	return result;
}

function executableFile(candidate: string, platform: NodeJS.Platform): boolean {
	try {
		const stat = fs.statSync(candidate);
		if (!stat.isFile()) return false;
		fs.accessSync(
			candidate,
			platform === "win32" ? fs.constants.F_OK : fs.constants.X_OK,
		);
		return true;
	} catch {
		return false;
	}
}

function findOnPath(
	command: string,
	env: NodeJS.ProcessEnv,
	platform: NodeJS.Platform,
): string | null {
	const searchPath = env.PATH ?? env.Path ?? env.path ?? "";
	const delimiter = platform === "win32" ? ";" : ":";
	const extensions =
		platform === "win32"
			? (env.PATHEXT ?? ".EXE;.CMD;.BAT;.COM").split(";").filter(Boolean)
			: [""];

	for (const directory of searchPath.split(delimiter).filter(Boolean)) {
		for (const extension of extensions) {
			const candidate = path.join(directory, `${command}${extension}`);
			if (executableFile(candidate, platform)) return candidate;
		}
	}
	return null;
}

function resolveOverride(
	value: string,
	env: NodeJS.ProcessEnv,
	platform: NodeJS.Platform,
): string | null {
	const hasSeparator = value.includes("/") || value.includes("\\");
	if (path.isAbsolute(value) || hasSeparator)
		return executableFile(value, platform) ? value : null;
	return findOnPath(value, env, platform);
}

/** Resolve a POSIX Bash, including standard Git-for-Windows locations. */
export function resolveBash(
	env: NodeJS.ProcessEnv = process.env,
	platform: NodeJS.Platform = process.platform,
): string | null {
	if (env.DO_IT_BASH) return resolveOverride(env.DO_IT_BASH, env, platform);

	const fromPath = findOnPath("bash", env, platform);
	if (fromPath) return fromPath;

	if (platform !== "win32") {
		for (const candidate of ["/bin/bash", "/usr/bin/bash"]) {
			if (executableFile(candidate, platform)) return candidate;
		}
		return null;
	}

	const win = path.win32;
	const roots = [
		env.ProgramFiles,
		env["ProgramFiles(x86)"],
		env.LOCALAPPDATA ? win.join(env.LOCALAPPDATA, "Programs") : undefined,
	].filter((value): value is string => Boolean(value));
	for (const root of roots) {
		for (const relative of [
			win.join("Git", "bin", "bash.exe"),
			win.join("Git", "usr", "bin", "bash.exe"),
		]) {
			const candidate = win.join(root, relative);
			if (executableFile(candidate, platform)) return candidate;
		}
	}

	return null;
}

function configuredTimeout(env: NodeJS.ProcessEnv): number {
	const value = Number(env.DO_IT_HOOK_TIMEOUT_MS);
	if (!Number.isFinite(value) || value <= 0) return DEFAULT_HOOK_TIMEOUT_MS;
	return Math.min(value, 120_000);
}

function unavailableDiagnostic(env: NodeJS.ProcessEnv): string {
	if (env.DO_IT_BASH) {
		return `do-it hooks skipped: DO_IT_BASH does not resolve to an executable Bash (${env.DO_IT_BASH}).`;
	}
	return "do-it hooks skipped: Bash is unavailable. Install POSIX Bash/Git for Windows Bash or set DO_IT_BASH.";
}

export function windowsTaskkill(env: NodeJS.ProcessEnv): string {
	const systemRoot = env.SystemRoot ?? env.SYSTEMROOT ?? env.systemroot;
	return systemRoot
		? path.win32.join(systemRoot, "System32", "taskkill.exe")
		: "taskkill.exe";
}

function terminateProcessTree(
	child: ReturnType<typeof spawn>,
	platform: NodeJS.Platform,
	env: NodeJS.ProcessEnv,
): void {
	if (!child.pid) return;
	if (platform === "win32") {
		try {
			const killer = spawn(
				windowsTaskkill(env),
				["/PID", String(child.pid), "/T", "/F"],
				{
					env,
					stdio: "ignore",
					windowsHide: true,
				},
			);
			killer.once("error", () => child.kill("SIGKILL"));
			killer.once("close", (code) => {
				if (code !== 0) child.kill("SIGKILL");
			});
		} catch {
			child.kill("SIGKILL");
		}
		return;
	}

	try {
		process.kill(-child.pid, "SIGKILL");
	} catch {
		child.kill("SIGKILL");
	}
}

export function terminateActiveProcesses(): void {
	for (const requestTermination of activeProcesses.values())
		requestTermination();
	activeProcesses.clear();
}

/** Run a shared advisory shell hook without blocking Pi's event loop. */
export async function spawnHook(
	hooksDir: string,
	scriptName: string,
	payload: HookPayload,
	options: HookRunnerOptions = {},
): Promise<HookResult> {
	const scriptPath = path.join(hooksDir, scriptName);
	if (!fs.existsSync(scriptPath)) {
		const diagnostic = `do-it hook skipped: script missing (${scriptPath}).`;
		return {
			exitCode: 0,
			stdout: "",
			stderr: diagnostic,
			diagnostic,
			unavailable: true,
		};
	}

	const env = options.env
		? { ...process.env, ...options.env }
		: { ...process.env };
	const platform = options.platform ?? process.platform;
	const bash = resolveBash(env, platform);
	if (!bash) {
		const diagnostic = unavailableDiagnostic(env);
		return {
			exitCode: 0,
			stdout: "",
			stderr: diagnostic,
			diagnostic,
			unavailable: true,
		};
	}
	if (options.signal?.aborted) {
		const diagnostic = `do-it hook ${scriptName} aborted before launch.`;
		return {
			exitCode: 130,
			stdout: "",
			stderr: diagnostic,
			diagnostic,
			aborted: true,
		};
	}

	const timeoutMs = options.timeoutMs ?? configuredTimeout(env);
	const child = spawn(bash, [scriptPath], {
		cwd: payload.cwd,
		env,
		detached: platform !== "win32",
		stdio: ["pipe", "pipe", "pipe"],
		windowsHide: true,
	});
	return await new Promise<HookResult>((resolve) => {
		const stdoutChunks: Buffer[] = [];
		const stderrChunks: Buffer[] = [];
		let retainedOutputBytes = 0;
		let observedOutputBytes = 0;
		let terminationReason:
			| "timeout"
			| "abort"
			| "output"
			| "shutdown"
			| undefined;
		let spawnError: Error | undefined;
		let settled = false;
		let forcedCleanup = false;
		let terminationTimer: ReturnType<typeof setTimeout> | undefined;

		const collect = (chunk: Buffer, chunks: Buffer[]): void => {
			observedOutputBytes += chunk.byteLength;
			if (retainedOutputBytes < MAX_HOOK_OUTPUT_BYTES) {
				const remaining = MAX_HOOK_OUTPUT_BYTES - retainedOutputBytes;
				const piece = chunk.subarray(0, remaining);
				chunks.push(piece);
				retainedOutputBytes += piece.byteLength;
			}
		};

		let timer: ReturnType<typeof setTimeout>;
		const abort = (): void => requestTermination("abort");
		const settle = (code: number | null, forced = false): void => {
			if (settled) return;
			settled = true;
			forcedCleanup = forcedCleanup || forced;
			activeProcesses.delete(child);
			clearTimeout(timer);
			if (terminationTimer) clearTimeout(terminationTimer);
			options.signal?.removeEventListener("abort", abort);

			const stdout = Buffer.concat(stdoutChunks).toString("utf8");
			const stderr = Buffer.concat(stderrChunks).toString("utf8");
			let exitCode = code ?? 1;
			let diagnostic: string | undefined;
			const cleanupStatus = forcedCleanup
				? ` Hook pipes were closed after a ${TERMINATION_GRACE_MS}ms cleanup grace; descendant cleanup could not be confirmed.`
				: " Process-tree termination was requested.";

			if (terminationReason === "abort" || terminationReason === "shutdown") {
				exitCode = 130;
				diagnostic = `do-it hook ${scriptName} aborted.${cleanupStatus}`;
			} else if (terminationReason === "timeout") {
				exitCode = 124;
				diagnostic = `do-it hook ${scriptName} timed out after ${timeoutMs}ms.${cleanupStatus}`;
			} else if (terminationReason === "output") {
				exitCode = 1;
				diagnostic = `do-it hook ${scriptName} exceeded the ${MAX_HOOK_OUTPUT_BYTES}-byte aggregate stdout/stderr output limit.${cleanupStatus}`;
			} else if (spawnError) {
				diagnostic = `do-it hook ${scriptName} could not start: ${spawnError.message}`;
			} else if (exitCode !== 0) {
				diagnostic = `do-it hook ${scriptName} exited with code ${exitCode}.`;
			}

			resolve({
				exitCode,
				stdout,
				stderr,
				...(diagnostic ? { diagnostic } : {}),
				...(terminationReason === "timeout" ? { timedOut: true } : {}),
				...(terminationReason === "abort" || terminationReason === "shutdown"
					? { aborted: true }
					: {}),
				...parseHookOutput(stdout),
			});
		};

		function requestTermination(
			reason: "timeout" | "abort" | "output" | "shutdown",
		): void {
			if (settled || terminationReason) return;
			terminationReason = reason;
			terminateProcessTree(child, platform, env);
			terminationTimer = setTimeout(() => {
				forcedCleanup = true;
				child.stdin.destroy();
				child.stdout.destroy();
				child.stderr.destroy();
				child.kill("SIGKILL");
				settle(null, true);
			}, TERMINATION_GRACE_MS);
		}

		activeProcesses.set(child, () => requestTermination("shutdown"));
		child.stdout.on("data", (chunk: Buffer) => {
			collect(chunk, stdoutChunks);
			if (observedOutputBytes > MAX_HOOK_OUTPUT_BYTES)
				requestTermination("output");
		});
		child.stderr.on("data", (chunk: Buffer) => {
			collect(chunk, stderrChunks);
			if (observedOutputBytes > MAX_HOOK_OUTPUT_BYTES)
				requestTermination("output");
		});
		child.once("error", (error) => {
			spawnError = error;
		});
		child.once("close", (code) => settle(code));

		timer = setTimeout(() => requestTermination("timeout"), timeoutMs);
		timer.unref();
		options.signal?.addEventListener("abort", abort, { once: true });

		child.stdin.on("error", () => undefined);
		child.stdin.end(JSON.stringify(payload));
	});
}
