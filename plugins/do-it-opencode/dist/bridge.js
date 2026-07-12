import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
const EDIT_TOOLS = new Set(["edit", "write", "multiedit"]);
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
    const trimmed = stdout.trim();
    if (!trimmed)
        return {};
    for (const line of trimmed.split("\n")) {
        const candidate = line.trim();
        if (!candidate.startsWith("{"))
            continue;
        try {
            const parsed = JSON.parse(candidate);
            if (parsed.decision === "block" && parsed.reason) {
                return { blockReason: parsed.reason };
            }
            const ctx = parsed.hookSpecificOutput?.additionalContext;
            if (ctx)
                return { additionalContext: ctx };
        }
        catch {
            // ignore malformed JSON lines
        }
    }
    return {};
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
            // fall through
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
    if (process.env.OPENCODE_DATA) {
        bases.push(path.join(process.env.OPENCODE_DATA, "sessions"));
    }
    if (process.env.DO_IT_HOOK_DATA) {
        bases.push(path.join(process.env.DO_IT_HOOK_DATA, "sessions"));
    }
    const repoRuntime = path.join(cwd, ".do-it", "runtime", "sessions");
    bases.push(repoRuntime);
    bases.push(path.join(process.env.TMPDIR ?? "/tmp", "do-it-sessions"));
    for (const base of bases) {
        const dir = path.join(base, sessionId);
        if (fs.existsSync(path.join(dir, "state.json")) || fs.existsSync(path.join(dir, "state.kv"))) {
            return dir;
        }
    }
    return null;
}
export function readSessionTier(sessionId, cwd) {
    const dir = resolveSessionStateDir(sessionId, cwd);
    if (!dir)
        return "";
    return readTierFromStateDir(dir);
}
export function spawnHook(hooksDir, scriptName, payload) {
    const scriptPath = path.join(hooksDir, scriptName);
    if (!fs.existsSync(scriptPath)) {
        return {
            exitCode: 1,
            stdout: "",
            stderr: `hook script missing: ${scriptPath}`
        };
    }
    const stdin = JSON.stringify(payload);
    const result = spawnSync("bash", [scriptPath], {
        input: stdin,
        encoding: "utf8",
        env: {
            ...process.env,
            OPENCODE_DATA: process.env.OPENCODE_DATA ?? path.join(payload.cwd, ".opencode")
        }
    });
    const stdout = result.stdout ?? "";
    const stderr = result.stderr ?? "";
    const parsed = parseHookOutput(stdout);
    return {
        exitCode: result.status ?? 1,
        stdout,
        stderr,
        ...parsed
    };
}
