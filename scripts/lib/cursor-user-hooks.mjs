/**
 * Merge do-it Cursor hook commands into the user-level ~/.cursor/hooks.json.
 *
 * Cursor's Hooks service currently scans enterprise / user / project hooks.json
 * and does not register plugin-local hooks/hooks.json. Writing (or merging)
 * the user-level file is the reliable fallback so Customize → Hooks shows
 * entries and the Hooks service actually runs them.
 *
 * On Windows, commands MUST go through hooks/run-hook.cmd (never a bare .sh
 * path) — otherwise Cursor opens the script in the editor / "Open with" dialog
 * instead of executing it.
 */

import fs from "node:fs";
import crypto from "node:crypto";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { looksLikeWindowsPath } from "./user-home.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "../..");
const cursorHooksTemplate = path.join(repoRoot, "install", "cursor-hooks.json");

export const DO_IT_HOOK_PATH_MARKER = "do-it-cursor/hooks/";
export const DO_IT_RUN_HOOK_CMD = "run-hook.cmd";

/** Owned by do-it only when the path includes the plugin hooks marker. */
export function isDoItHookCommand(command) {
  if (typeof command !== "string" || command.length === 0) return false;
  const normalized = command.replace(/\\/g, "/");
  return normalized.includes(DO_IT_HOOK_PATH_MARKER);
}

/** True when a command still points at a bare .sh entry (unsafe on Windows). */
export function isBareShellHookCommand(command) {
  if (typeof command !== "string") return false;
  const normalized = command.replace(/\\/g, "/").trim();
  if (normalized.includes(DO_IT_RUN_HOOK_CMD)) return false;
  return /\.sh(?:\s|$|")/.test(normalized);
}

function readJsonIfPresent(filePath) {
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (err) {
    throw new Error(`invalid JSON in ${filePath}: ${err.message}`);
  }
}

function readJsonWithFileState(filePath) {
  if (!fs.existsSync(filePath)) {
    return { value: null, fileState: { exists: false } };
  }
  try {
    const content = fs.readFileSync(filePath, "utf8");
    return {
      value: JSON.parse(content),
      fileState: { exists: true, content }
    };
  } catch (err) {
    throw new Error(`invalid JSON in ${filePath}: ${err.message}`);
  }
}

/**
 * Extract the hook script basename (without .sh) from a template command.
 * Accepts both modern `run-hook.cmd router` and legacy `.../router.sh` forms.
 */
export function scriptBasenameFromTemplateCommand(raw) {
  const cleaned = String(raw ?? "")
    .replace(/\$\{CURSOR_PLUGIN_ROOT\}\/?/g, "")
    .replace(/^\.\//, "")
    .trim();

  const runHookMatch = /run-hook\.cmd(?:\.exe)?\s+(\S+)/i.exec(cleaned);
  if (runHookMatch) {
    return runHookMatch[1].replace(/\.sh$/i, "");
  }

  const base = path.basename(cleaned.split(/\s+/)[0] ?? "");
  return base.replace(/\.sh$/i, "").replace(/\.cmd$/i, "");
}

function quoteCommandPath(filePath) {
  // Quote Windows paths and any path with shell / CMD metacharacters (including
  // $ and backticks so Unix shells cannot expand untrusted segments).
  // CMD escapes embedded quotes by doubling them.
  if (
    process.platform === "win32" ||
    looksLikeWindowsPath(filePath) ||
    /[\s&|()<>^"$`\\;]/.test(filePath)
  ) {
    return `"${String(filePath).replace(/"/g, '""')}"`;
  }
  return filePath;
}

export function commandForRunHook(pluginRoot, scriptBasename) {
  // When installing from WSL into /mnt/<drive>/Users/..., Windows Cursor reads
  // the same hooks.json and must see a native Windows path — not the mount.
  const winRoot = toWindowsPathIfWslMount(pluginRoot);
  const runnerPath =
    winRoot !== pluginRoot
      ? path.win32.join(winRoot, "hooks", DO_IT_RUN_HOOK_CMD)
      : path.join(pluginRoot, "hooks", DO_IT_RUN_HOOK_CMD);
  const name = String(scriptBasename).replace(/\.sh$/i, "");
  return `${quoteCommandPath(runnerPath)} ${name}`;
}

/**
 * Convert WSL `/mnt/<drive>/...` or Git Bash `/<drive>/Users/...` paths to
 * `<DRIVE>:\...` for Windows-hosted Cursor. Other Unix paths stay unchanged.
 */
export function toWindowsPathIfWslMount(p) {
  const normalized = String(p).replace(/\\/g, "/");
  const mnt = /^\/mnt\/([a-zA-Z])\/(.*)$/.exec(normalized);
  if (mnt) {
    return `${mnt[1].toUpperCase()}:\\${mnt[2].replace(/\//g, "\\")}`;
  }
  const msys = /^\/([a-zA-Z])\/(Users\/.*)$/i.exec(normalized);
  if (msys) {
    return `${msys[1].toUpperCase()}:\\${msys[2].replace(/\//g, "\\")}`;
  }
  return p;
}

export function buildDoItUserHookDefs(pluginRoot) {
  const source = JSON.parse(fs.readFileSync(cursorHooksTemplate, "utf8"));
  const hooks = {};
  for (const [event, defs] of Object.entries(source.hooks ?? {})) {
    hooks[event] = (defs ?? []).map((def) => {
      const basename = scriptBasenameFromTemplateCommand(def.command ?? "");
      if (!basename) {
        throw new Error(`cursor hooks template missing script basename for ${event}`);
      }
      return { ...def, command: commandForRunHook(pluginRoot, basename) };
    });
  }
  return hooks;
}

/**
 * Merge do-it managed hook defs into an existing user hooks.json object.
 * Preserves non-do-it entries; replaces prior do-it entries for known events.
 */
export function mergeDoItUserHooks(existing, pluginRoot) {
  const desired = buildDoItUserHookDefs(pluginRoot);
  const base =
    existing && typeof existing === "object"
      ? structuredClone(existing)
      : { version: 1, hooks: {} };

  if (base.version == null) base.version = 1;
  if (!base.hooks || typeof base.hooks !== "object") base.hooks = {};

  for (const [event, defs] of Object.entries(desired)) {
    const current = Array.isArray(base.hooks[event]) ? base.hooks[event] : [];
    const kept = current.filter((entry) => !isDoItHookCommand(entry?.command));
    base.hooks[event] = [...kept, ...defs];
  }

  for (const [event, list] of Object.entries(base.hooks)) {
    if (!Array.isArray(list)) continue;
    if (Object.prototype.hasOwnProperty.call(desired, event)) continue;
    const filtered = list.filter((entry) => !isDoItHookCommand(entry?.command));
    if (filtered.length === 0) {
      delete base.hooks[event];
    } else {
      base.hooks[event] = filtered;
    }
  }

  return base;
}

export function userHooksPathForHome(home) {
  return path.join(home, ".cursor", "hooks.json");
}

function writeJsonAtomic(filePath, value) {
  const content = `${JSON.stringify(value, null, 2)}\n`;
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tempPath = path.join(
    path.dirname(filePath),
    `.do-it-hooks.${process.pid}.${crypto.randomUUID()}.tmp`
  );
  try {
    fs.writeFileSync(tempPath, content);
    try {
      fs.renameSync(tempPath, filePath);
    } catch (err) {
      // Windows often cannot rename over an existing destination (EPERM/EEXIST).
      // Fall back to replace-in-place so reinstall/merge stays idempotent.
      if (process.platform === "win32" || err.code === "EEXIST" || err.code === "EPERM") {
        fs.copyFileSync(tempPath, filePath);
        fs.rmSync(tempPath, { force: true });
      } else {
        throw err;
      }
    }
  } finally {
    fs.rmSync(tempPath, { force: true });
  }
}

export function prepareUserHooksForPlugin(home, pluginRoot) {
  const hooksPath = userHooksPathForHome(home);
  const { value: existing, fileState } = readJsonWithFileState(hooksPath);
  return {
    hooksPath,
    value: mergeDoItUserHooks(existing, pluginRoot),
    fileState
  };
}

export function syncUserHooksForPlugin(home, pluginRoot) {
  const prepared = prepareUserHooksForPlugin(home, pluginRoot);
  writeJsonAtomic(prepared.hooksPath, prepared.value);
  return prepared.hooksPath;
}

export function userHooksWiredForPlugin(home, pluginRoot) {
  const hooksPath = userHooksPathForHome(home);
  const existing = readJsonIfPresent(hooksPath);
  if (!existing?.hooks || typeof existing.hooks !== "object") {
    return { ok: false, reason: `missing or empty ${hooksPath}` };
  }

  const desired = buildDoItUserHookDefs(pluginRoot);
  const missing = [];
  const bareSh = [];
  for (const [event, defs] of Object.entries(desired)) {
    const current = Array.isArray(existing.hooks[event]) ? existing.hooks[event] : [];
    for (const def of defs) {
      const found = current.some((entry) => entry?.command === def.command);
      if (!found) missing.push(`${event}:${def.command}`);
    }
  }

  for (const list of Object.values(existing.hooks)) {
    if (!Array.isArray(list)) continue;
    for (const entry of list) {
      if (isDoItHookCommand(entry?.command) && isBareShellHookCommand(entry.command)) {
        bareSh.push(entry.command);
      }
    }
  }

  if (bareSh.length > 0) {
    return {
      ok: false,
      reason: `user hooks still point at bare .sh (Windows will open them as files): ${bareSh[0]}`
    };
  }

  if (missing.length > 0) {
    return {
      ok: false,
      reason: `user hooks missing do-it entries: ${missing.slice(0, 3).join(", ")}`
    };
  }
  return { ok: true, hooksPath };
}

/** Resolve a usable Git Bash on Windows (skip WSL System32 / Sysnative stubs). */
export function resolveGitBash() {
  const candidates = [
    "C:\\Program Files\\Git\\bin\\bash.exe",
    "C:\\Program Files (x86)\\Git\\bin\\bash.exe"
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }

  if (process.platform === "win32") {
    try {
      const result = spawnSync("where.exe", ["bash"], { encoding: "utf8" });
      const lines = (result.stdout || "")
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);
      for (const line of lines) {
        const lower = line.toLowerCase();
        if (
          lower.endsWith("\\system32\\bash.exe") ||
          lower.endsWith("\\syswow64\\bash.exe") ||
          lower.endsWith("\\sysnative\\bash.exe")
        ) {
          continue;
        }
        if (fs.existsSync(line)) return line;
      }
    } catch {
      // ignore
    }
  }
  return null;
}
