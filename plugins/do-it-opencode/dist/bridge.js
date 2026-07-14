import { spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
const activeProcesses = new Set();
export function terminateActiveProcesses() {
    for (const child of activeProcesses) {
        try {
            terminateProcessTree(child, process.platform, process.env);
        }
        catch { }
    }
    activeProcesses.clear();
}
const EDIT_TOOLS = new Set(["edit", "write", "multiedit"]);
const DEFAULT_HOOK_TIMEOUT_MS = 15_000;
const MAX_HOOK_OUTPUT_BYTES = 1024 * 1024;
/** Map OpenCode tool ids to do-it hook tool_name values. */
export function normalizeToolName(tool) {
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
export function isEditTool(tool) {
    return EDIT_TOOLS.has(tool.toLowerCase());
}
export function buildHookPayload(input) {
    const toolName = input.tool ? normalizeToolName(input.tool) ?? input.tool : undefined;
    const filePath = extractFilePath(input.args);
    return {
        session_id: input.sessionID,
        cwd: input.cwd,
        tool_name: toolName,
        file_path: filePath,
        transcript_path: input.transcriptPath ?? "",
        tool_input: input.args,
        ...(input.stopHookActive ? { stop_hook_active: "true" } : {})
    };
}
export function extractFilePath(args) {
    if (!args)
        return undefined;
    for (const key of ["file_path", "path", "filePath"]) {
        const value = args[key];
        if (typeof value === "string" && value.length > 0)
            return value;
    }
    return undefined;
}
/** Parse hook stdout for block decisions or PostToolUse context reminders. */
export function parseHookOutput(stdout) {
    const result = {};
    const trimmed = stdout.trim();
    if (!trimmed)
        return result;
    for (const line of trimmed.split("\n")) {
        const candidate = line.trim();
        if (!candidate.startsWith("{"))
            continue;
        try {
            const parsed = JSON.parse(candidate);
            if (parsed.decision === "block" && parsed.reason) {
                result.blockReason = parsed.reason;
            }
            const ctx = parsed.hookSpecificOutput?.additionalContext;
            if (ctx) {
                result.additionalContext = ctx;
            }
        }
        catch {
            // Hook diagnostics may be mixed with JSON protocol lines.
        }
    }
    return result;
}
function executableFile(candidate, platform) {
    try {
        const stat = fs.statSync(candidate);
        if (!stat.isFile())
            return false;
        fs.accessSync(candidate, platform === "win32" ? fs.constants.F_OK : fs.constants.X_OK);
        return true;
    }
    catch {
        return false;
    }
}
function findOnPath(command, env, platform) {
    const searchPath = env.PATH ?? env.Path ?? env.path ?? "";
    const delimiter = platform === "win32" ? ";" : ":";
    const extensions = platform === "win32"
        ? (env.PATHEXT ?? ".EXE;.CMD;.BAT;.COM").split(";").filter(Boolean)
        : [""];
    for (const directory of searchPath.split(delimiter).filter(Boolean)) {
        for (const extension of extensions) {
            const candidate = path.join(directory, `${command}${extension}`);
            if (executableFile(candidate, platform))
                return candidate;
        }
    }
    return null;
}
function resolveOverride(value, env, platform) {
    const hasSeparator = value.includes("/") || value.includes("\\");
    if (path.isAbsolute(value) || hasSeparator) {
        return executableFile(value, platform) ? value : null;
    }
    return findOnPath(value, env, platform);
}
/** Resolve a Bash capable of running the shared POSIX hooks. */
export function resolveBash(env = process.env, platform = process.platform) {
    if (env.DO_IT_BASH) {
        return resolveOverride(env.DO_IT_BASH, env, platform);
    }
    const fromPath = findOnPath("bash", env, platform);
    if (fromPath)
        return fromPath;
    if (platform !== "win32") {
        for (const candidate of ["/bin/bash", "/usr/bin/bash"]) {
            if (executableFile(candidate, platform))
                return candidate;
        }
        return null;
    }
    const win = path.win32;
    const roots = [
        env.ProgramFiles,
        env["ProgramFiles(x86)"],
        env.LOCALAPPDATA ? win.join(env.LOCALAPPDATA, "Programs") : undefined
    ].filter((value) => Boolean(value));
    for (const root of roots) {
        for (const relative of [win.join("Git", "bin", "bash.exe"), win.join("Git", "usr", "bin", "bash.exe")]) {
            const candidate = win.join(root, relative);
            if (executableFile(candidate, platform))
                return candidate;
        }
    }
    return null;
}
function safeStateSessionKey(sessionId) {
    const unsafe = sessionId.length === 0 ||
        sessionId === "." ||
        sessionId === ".." ||
        sessionId.includes("..") ||
        /[\\/\x00-\x1f\x7f]/.test(sessionId);
    if (!unsafe)
        return sessionId;
    return crypto.createHash("sha256").update(sessionId).digest("hex").slice(0, 12);
}
function containedStateFile(base, sessionKey) {
    const resolvedBase = path.resolve(base);
    const candidate = path.resolve(resolvedBase, sessionKey);
    if (candidate !== resolvedBase && !candidate.startsWith(`${resolvedBase}${path.sep}`))
        return null;
    for (const filename of ["state.json", "state.kv"]) {
        const statePath = path.join(candidate, filename);
        if (!fs.existsSync(statePath))
            continue;
        try {
            const realBase = fs.realpathSync(resolvedBase);
            const realState = fs.realpathSync(statePath);
            if (realState.startsWith(`${realBase}${path.sep}`))
                return candidate;
        }
        catch {
            // Ignore disappearing or unreadable state files.
        }
    }
    return null;
}
function readTierFromStateDir(stateDir) {
    const jsonPath = path.join(stateDir, "state.json");
    if (fs.existsSync(jsonPath)) {
        try {
            const state = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
            if (typeof state.tier === "string")
                return state.tier;
        }
        catch {
            // Fall through to the jq-less state format.
        }
    }
    const kvPath = path.join(stateDir, "state.kv");
    if (fs.existsSync(kvPath)) {
        const text = fs.readFileSync(kvPath, "utf8");
        const match = text.match(/^tier=(.*)$/m);
        if (match?.[1])
            return match[1].trim();
    }
    return "";
}
export function resolveSessionStateDir(sessionId, cwd) {
    const bases = [];
    if (process.env.DO_IT_HOOK_DATA) {
        bases.push(path.join(process.env.DO_IT_HOOK_DATA, "sessions"));
    }
    if (process.env.OPENCODE_DATA) {
        bases.push(path.join(process.env.OPENCODE_DATA, "sessions"));
    }
    else {
        bases.push(path.join(cwd, ".opencode", "sessions"));
    }
    bases.push(path.join(cwd, ".do-it", "runtime", "sessions"));
    bases.push(path.join(process.env.TMPDIR ?? "/tmp", "do-it-sessions"));
    const sessionKey = safeStateSessionKey(sessionId);
    for (const base of bases) {
        const dir = containedStateFile(base, sessionKey);
        if (dir)
            return dir;
    }
    return null;
}
export function readSessionTier(sessionId, cwd) {
    const dir = resolveSessionStateDir(sessionId, cwd);
    if (!dir)
        return "";
    return readTierFromStateDir(dir);
}
function configuredTimeout(env) {
    const value = Number(env.DO_IT_HOOK_TIMEOUT_MS);
    if (!Number.isFinite(value) || value <= 0)
        return DEFAULT_HOOK_TIMEOUT_MS;
    return Math.min(value, 120_000);
}
function unavailableDiagnostic(env) {
    if (env.DO_IT_BASH) {
        return `do-it hooks skipped: DO_IT_BASH does not resolve to an executable Bash (${env.DO_IT_BASH}). Set DO_IT_BASH to a valid POSIX Bash executable.`;
    }
    return "do-it hooks skipped: Bash is unavailable. Install POSIX Bash/Git for Windows Bash or set DO_IT_BASH to its executable.";
}
export function windowsTaskkill(env) {
    const systemRoot = env.SystemRoot ?? env.SYSTEMROOT ?? env.systemroot;
    return systemRoot
        ? path.win32.join(systemRoot, "System32", "taskkill.exe")
        : "taskkill.exe";
}
function terminateProcessTree(child, platform, env) {
    if (!child.pid)
        return;
    if (platform === "win32") {
        // Node's child.kill only targets Bash; taskkill /T also terminates Git Bash descendants.
        try {
            const killer = spawn(windowsTaskkill(env), ["/PID", String(child.pid), "/T", "/F"], {
                env,
                stdio: "ignore",
                windowsHide: true
            });
            killer.once("error", () => child.kill("SIGKILL"));
            killer.once("close", (code) => {
                if (code !== 0)
                    child.kill("SIGKILL");
            });
        }
        catch {
            child.kill("SIGKILL");
        }
        return;
    }
    try {
        process.kill(-child.pid, "SIGKILL");
        return;
    }
    catch {
        // Fall back to terminating the direct child.
    }
    child.kill("SIGKILL");
}
/** Run a shared shell hook without blocking the OpenCode host event loop. */
export async function spawnHook(hooksDir, scriptName, payload, options = {}) {
    const scriptPath = path.join(hooksDir, scriptName);
    if (!fs.existsSync(scriptPath)) {
        const diagnostic = `do-it hook skipped: script missing (${scriptPath}).`;
        return { exitCode: 0, stdout: "", stderr: diagnostic, diagnostic, unavailable: true };
    }
    const env = options.env ? { ...process.env, ...options.env } : { ...process.env };
    const platform = options.platform ?? process.platform;
    const bash = resolveBash(env, platform);
    if (!bash) {
        const diagnostic = unavailableDiagnostic(env);
        return { exitCode: 0, stdout: "", stderr: diagnostic, diagnostic, unavailable: true };
    }
    const timeoutMs = options.timeoutMs ?? configuredTimeout(env);
    const child = spawn(bash, [scriptPath], {
        cwd: payload.cwd,
        env: {
            ...env,
            OPENCODE_DATA: env.OPENCODE_DATA ?? path.join(payload.cwd, ".opencode")
        },
        detached: platform !== "win32",
        stdio: ["pipe", "pipe", "pipe"],
        windowsHide: true
    });
    activeProcesses.add(child);
    return await new Promise((resolve) => {
        const stdoutChunks = [];
        let stdoutBytes = 0;
        const stderrChunks = [];
        let stderrBytes = 0;
        let timedOut = false;
        let outputExceeded = false;
        let spawnError;
        const terminate = () => {
            terminateProcessTree(child, platform, env);
        };
        child.stdout.on("data", (chunk) => {
            if (stdoutBytes >= MAX_HOOK_OUTPUT_BYTES)
                return;
            const remaining = MAX_HOOK_OUTPUT_BYTES - stdoutBytes;
            const piece = chunk.subarray(0, remaining);
            stdoutChunks.push(piece);
            stdoutBytes += piece.byteLength;
            if (stdoutBytes >= MAX_HOOK_OUTPUT_BYTES) {
                outputExceeded = true;
                terminate();
            }
        });
        child.stderr.on("data", (chunk) => {
            if (stderrBytes >= MAX_HOOK_OUTPUT_BYTES)
                return;
            const remaining = MAX_HOOK_OUTPUT_BYTES - stderrBytes;
            const piece = chunk.subarray(0, remaining);
            stderrChunks.push(piece);
            stderrBytes += piece.byteLength;
            if (stderrBytes >= MAX_HOOK_OUTPUT_BYTES) {
                outputExceeded = true;
                terminate();
            }
        });
        child.once("error", (error) => {
            spawnError = error;
        });
        const timer = setTimeout(() => {
            timedOut = true;
            terminate();
        }, timeoutMs);
        timer.unref();
        child.once("close", (code) => {
            activeProcesses.delete(child);
            clearTimeout(timer);
            const stdout = Buffer.concat(stdoutChunks).toString("utf8");
            const stderr = Buffer.concat(stderrChunks).toString("utf8");
            let diagnostic;
            let exitCode = code ?? 1;
            if (timedOut) {
                exitCode = 124;
                diagnostic = `do-it hook ${scriptName} timed out after ${timeoutMs}ms and was terminated.`;
            }
            else if (outputExceeded) {
                exitCode = 1;
                diagnostic = `do-it hook ${scriptName} exceeded the ${MAX_HOOK_OUTPUT_BYTES}-byte output limit and was terminated.`;
            }
            else if (spawnError) {
                diagnostic = `do-it hook ${scriptName} could not start: ${spawnError.message}`;
            }
            const parsed = parseHookOutput(stdout);
            resolve({
                exitCode,
                stdout,
                stderr,
                ...(diagnostic ? { diagnostic } : {}),
                ...(timedOut ? { timedOut: true } : {}),
                ...parsed
            });
        });
        child.stdin.on("error", () => undefined);
        child.stdin.end(JSON.stringify(payload));
    });
}
