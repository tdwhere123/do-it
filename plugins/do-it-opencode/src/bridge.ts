import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

export type HookPayload = {
  session_id: string;
  cwd: string;
  tool_name?: string;
  file_path?: string;
  transcript_path?: string;
  tool_input?: Record<string, unknown>;
  stop_hook_active?: string;
};

export type HookResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
  blockReason?: string;
  additionalContext?: string;
};

const EDIT_TOOLS = new Set(["edit", "write", "multiedit"]);

/** Map OpenCode tool ids to do-it hook tool_name values. */
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

export function buildHookPayload(input: {
  sessionID: string;
  cwd: string;
  tool?: string;
  args?: Record<string, unknown>;
  transcriptPath?: string;
  stopHookActive?: boolean;
}): HookPayload {
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

export function extractFilePath(args?: Record<string, unknown>): string | undefined {
  if (!args) return undefined;
  for (const key of ["file_path", "path", "filePath"]) {
    const value = args[key];
    if (typeof value === "string" && value.length > 0) return value;
  }
  return undefined;
}

/** Parse hook stdout for block decisions or PostToolUse context reminders. */
export function parseHookOutput(stdout: string): Pick<HookResult, "blockReason" | "additionalContext"> {
  const trimmed = stdout.trim();
  if (!trimmed) return {};

  for (const line of trimmed.split("\n")) {
    const candidate = line.trim();
    if (!candidate.startsWith("{")) continue;
    try {
      const parsed = JSON.parse(candidate) as {
        decision?: string;
        reason?: string;
        hookSpecificOutput?: { additionalContext?: string };
      };
      if (parsed.decision === "block" && parsed.reason) {
        return { blockReason: parsed.reason };
      }
      const ctx = parsed.hookSpecificOutput?.additionalContext;
      if (ctx) return { additionalContext: ctx };
    } catch {
      // ignore malformed JSON lines
    }
  }

  return {};
}

function readTierFromStateDir(stateDir: string): string {
  const jsonPath = path.join(stateDir, "state.json");
  if (fs.existsSync(jsonPath)) {
    try {
      const state = JSON.parse(fs.readFileSync(jsonPath, "utf8")) as { tier?: string };
      if (typeof state.tier === "string") return state.tier;
    } catch {
      // fall through
    }
  }

  const kvPath = path.join(stateDir, "state.kv");
  if (fs.existsSync(kvPath)) {
    const text = fs.readFileSync(kvPath, "utf8");
    const match = text.match(/^tier=(.*)$/m);
    if (match?.[1]) return match[1].trim();
  }

  return "";
}

export function resolveSessionStateDir(sessionId: string, cwd: string): string | null {
  const bases: string[] = [];
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

export function readSessionTier(sessionId: string, cwd: string): string {
  const dir = resolveSessionStateDir(sessionId, cwd);
  if (!dir) return "";
  return readTierFromStateDir(dir);
}

export function shouldRunGrillPretool(sessionId: string, cwd: string): boolean {
  const tier = readSessionTier(sessionId, cwd);
  if (tier === "Heavy") return true;

  const dir = resolveSessionStateDir(sessionId, cwd);
  if (!dir) return false;

  const kvPath = path.join(dir, "state.kv");
  if (fs.existsSync(kvPath)) {
    const text = fs.readFileSync(kvPath, "utf8");
    if (/^durable_plan_required=1$/m.test(text)) return true;
  }

  try {
    const state = JSON.parse(fs.readFileSync(path.join(dir, "state.json"), "utf8")) as {
      durable_plan_required?: string | number;
    };
    return state.durable_plan_required === 1 || state.durable_plan_required === "1";
  } catch {
    return false;
  }
}

export function spawnHook(hooksDir: string, scriptName: string, payload: HookPayload): HookResult {
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
