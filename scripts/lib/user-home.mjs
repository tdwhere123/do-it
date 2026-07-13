/**
 * Portable user-home resolution for installers.
 *
 * On native Windows, prefer %USERPROFILE% and never treat Git Bash MSYS homes
 * like /c/Users/... as install roots (Node resolves those under the current
 * drive, e.g. C:\c\Users\..., which Cursor never reads).
 */

import os from "node:os";
import path from "node:path";
import process from "node:process";

export function looksLikeWindowsPath(value) {
  return typeof value === "string" && /^[A-Za-z]:[\\/]/.test(value);
}

export function looksLikeMsysUnixHome(value) {
  if (typeof value !== "string") return false;
  const normalized = value.replace(/\\/g, "/");
  return (
    /^\/[a-zA-Z]\//.test(normalized) ||
    normalized.startsWith("/home/") ||
    normalized.startsWith("/Users/")
  );
}

export function toWslMountPath(winPath) {
  return winPath
    .replace(/^([A-Za-z]):[\\/]/, (_, d) => `/mnt/${d.toLowerCase()}/`)
    .replace(/\\/g, "/");
}

/**
 * Resolve the home directory Cursor / installers should use.
 * win32: USERPROFILE (or native Windows HOME) first; skip MSYS-style HOME.
 * others: HOME || USERPROFILE || os.homedir().
 */
export function resolveUserHome(env = process.env) {
  if (process.platform === "win32") {
    const profile = env.USERPROFILE || os.homedir() || "";
    if (profile) return path.resolve(profile);
    if (env.HOME && looksLikeWindowsPath(env.HOME)) return path.resolve(env.HOME);
    return "";
  }

  if (env.HOME && !looksLikeMsysUnixHome(env.HOME)) {
    return env.HOME;
  }
  // On Linux/macOS, plain HOME is expected; MSYS-style only matters on win32.
  return env.HOME || env.USERPROFILE || os.homedir() || "";
}
