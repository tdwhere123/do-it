import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { userHooksWiredForPlugin, resolveGitBash } from "../../scripts/lib/cursor-user-hooks.mjs";
import { validateCursorPlugin } from "../../scripts/register-cursor-plugin.mjs";
import { resolveUserHome, looksLikeWindowsPath, toWslMountPath } from "../../scripts/lib/user-home.mjs";
import { pathState } from "./fs-transaction.mjs";

export function doctorCursorExtras({ installRoot, manifestVersion, ok, missing, drift }) {
  const pluginJson = path.join(installRoot, ".cursor-plugin", "plugin.json");
  if (fs.existsSync(pluginJson)) {
    ok.push(`cursor:plugin.json at ${path.resolve(pluginJson)}`);
  } else {
    missing.push(`cursor:plugin.json missing at ${path.resolve(pluginJson)}`);
  }

  const home = resolveUserHome();
  if (!home) {
    drift.push("cursor:HOME/USERPROFILE unset — cannot verify user-level ~/.cursor/hooks.json wiring");
    return;
  }

  const localPlugin = path.join(home, ".cursor", "plugins", "local", "do-it-cursor");
  let pluginForHooks = installRoot;
  if (pathState(localPlugin)) {
    try {
      validateCursorPlugin(localPlugin, { requireRuntime: true, expectedVersion: manifestVersion });
      pluginForHooks = localPlugin;
      ok.push(`cursor:discovery-copy valid at ${path.resolve(localPlugin)}`);
    } catch (error) {
      drift.push(`cursor:discovery-copy invalid: ${error.message}`);
    }
  } else {
    missing.push(`cursor:discovery-copy missing at ${path.resolve(localPlugin)}`);
  }

  const runner = path.join(pluginForHooks, "hooks", "run-hook.cmd");
  if (fs.existsSync(runner)) {
    ok.push(`cursor:run-hook.cmd at ${path.resolve(runner)}`);
  } else {
    missing.push(`cursor:run-hook.cmd missing at ${path.resolve(runner)}`);
  }

  const wired = userHooksWiredForPlugin(home, path.resolve(pluginForHooks));
  if (wired.ok) {
    ok.push(`cursor:user-hooks wired at ${path.resolve(wired.hooksPath)}`);
  } else {
    missing.push(`cursor:user-hooks ${wired.reason}`);
  }

  if (process.platform !== "win32") {
    const up = process.env.USERPROFILE;
    if (up && looksLikeWindowsPath(up)) {
      const winHome = toWslMountPath(up);
      const winPlugin = path.join(winHome, ".cursor", "plugins", "local", "do-it-cursor");
      if (pathState(winPlugin)) {
        try {
          validateCursorPlugin(winPlugin, { requireRuntime: true, expectedVersion: manifestVersion });
          const winWired = userHooksWiredForPlugin(winHome, path.resolve(winPlugin));
          if (winWired.ok) {
            ok.push(`cursor:windows-mirror-hooks wired at ${path.resolve(winWired.hooksPath)}`);
          } else {
            missing.push(`cursor:windows-mirror-hooks ${winWired.reason}`);
          }
        } catch (error) {
          drift.push(`cursor:windows-mirror invalid: ${error.message}`);
        }
      }
    }
  }

  if (process.platform === "win32") {
    const bash = resolveGitBash();
    if (bash) {
      ok.push(`cursor:git-bash at ${bash}`);
    } else {
      missing.push(
        "cursor:git-bash not found (install Git for Windows; System32\\bash.exe / WSL stub is not enough)"
      );
    }
  }

  const sample = path.join(pluginForHooks, "hooks", "session-start.sh");
  if (!fs.existsSync(sample)) {
    missing.push(`cursor:sample-hook missing at ${path.resolve(sample)}`);
    return;
  }

  const pluginRootResolved = path.resolve(pluginForHooks);
  const underPluginRoot = (candidate) => {
    const resolved = path.resolve(candidate);
    if (process.platform === "win32") {
      const root = pluginRootResolved.toLowerCase();
      const value = resolved.toLowerCase();
      return value === root || value.startsWith(`${root}${path.sep}`);
    }
    return resolved === pluginRootResolved || resolved.startsWith(`${pluginRootResolved}${path.sep}`);
  };
  const sameDir = (left, right) =>
    process.platform === "win32"
      ? path.resolve(left).toLowerCase() === path.resolve(right).toLowerCase()
      : path.resolve(left) === path.resolve(right);

  let smoke;
  let smokeLabel;
  if (process.platform === "win32" && fs.existsSync(runner)) {
    const runnerPath = path.resolve(runner);
    const hooksDir = path.join(pluginRootResolved, "hooks");
    if (
      path.basename(runnerPath).toLowerCase() !== "run-hook.cmd" ||
      !underPluginRoot(runnerPath) ||
      !sameDir(path.dirname(runnerPath), hooksDir)
    ) {
      missing.push(`cursor:run-hook.cmd rejected outside plugin root: ${runnerPath}`);
      return;
    }
    smokeLabel = `cmd.exe /d /s /c run-hook.cmd session-start (cwd=${hooksDir})`;
    smoke = spawnSync("cmd.exe", ["/d", "/s", "/c", "run-hook.cmd session-start"], {
      cwd: hooksDir,
      encoding: "utf8",
      windowsHide: true,
      shell: false,
      input: '{"session_id":"doctor-smoke","hook_event_name":"sessionStart"}\n',
      env: {
        ...process.env,
        CURSOR_PLUGIN_ROOT: pluginRootResolved,
        CURSOR_PLUGIN_DATA: path.join(pluginRootResolved, ".do-it-data"),
        CURSOR_VERSION: process.env.CURSOR_VERSION || "doctor"
      },
      timeout: 20_000
    });
  } else {
    const args = fs.existsSync(runner)
      ? [path.resolve(runner), "session-start"]
      : [path.resolve(sample)];
    const scriptPath = args[0];
    const scriptBase = path.basename(scriptPath).toLowerCase();
    if (
      (scriptBase !== "run-hook.cmd" && scriptBase !== "session-start.sh") ||
      !underPluginRoot(scriptPath)
    ) {
      missing.push(`cursor:hook-smoke rejected outside plugin root: ${scriptPath}`);
      return;
    }
    smokeLabel = `bash ${args.join(" ")}`;
    smoke = spawnSync("bash", args, {
      encoding: "utf8",
      shell: false,
      input: '{"session_id":"doctor-smoke","hook_event_name":"sessionStart"}\n',
      env: {
        ...process.env,
        CURSOR_PLUGIN_ROOT: pluginRootResolved,
        CURSOR_PLUGIN_DATA: path.join(pluginRootResolved, ".do-it-data"),
        CURSOR_VERSION: process.env.CURSOR_VERSION || "doctor"
      },
      timeout: 20_000
    });
  }
  if (smoke.error) {
    drift.push(`cursor:sample-hook could not run: ${smoke.error.message}`);
  } else if (smoke.status !== 0) {
    drift.push(
      `cursor:sample-hook exited ${smoke.status}: ${(smoke.stderr || smoke.stdout || "").trim().slice(0, 200)}`
    );
  } else if (!String(smoke.stdout || "").includes("additional_context")) {
    drift.push(`cursor:sample-hook produced no additional_context (${smokeLabel})`);
  } else {
    ok.push(`cursor:sample-hook runnable via ${smokeLabel}`);
  }
}

// Canonical order: hooks/lib/common.sh do_it_session_dir (keep in sync).
export function sessionsBaseDir(env = process.env) {
  if (env.CURSOR_PLUGIN_DATA) return path.join(env.CURSOR_PLUGIN_DATA, "sessions");
  if (env.CLAUDE_PLUGIN_DATA) return path.join(env.CLAUDE_PLUGIN_DATA, "sessions");
  if (env.PLUGIN_DATA) return path.join(env.PLUGIN_DATA, "sessions");
  if (env.DO_IT_HOOK_DATA) return path.join(env.DO_IT_HOOK_DATA, "sessions");
  if (env.CODEX_HOME) return path.join(env.CODEX_HOME, "do-it-data", "sessions");
  return path.join(env.TMPDIR || "/tmp", "do-it-sessions");
}

export function printSessionSummary(id, env = process.env) {
  const sessionDir = path.join(sessionsBaseDir(env), id);
  console.log("");
  console.log(`session: ${id}`);
  console.log(`  dir: ${sessionDir}`);

  const jsonPath = path.join(sessionDir, "state.json");
  const kvPath = path.join(sessionDir, "state.kv");

  if (fs.existsSync(jsonPath)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
      console.log(JSON.stringify(parsed, null, 2));
      return;
    } catch (err) {
      console.log(`  (state.json unreadable: ${err.message})`);
    }
  }

  if (fs.existsSync(kvPath)) {
    console.log("(jq unavailable; flat state.kv follows)");
    console.log(fs.readFileSync(kvPath, "utf8"));
    return;
  }

  console.log("  (no state recorded for this session)");
}

export function reportCrossHostVersions({
  targetsConfig,
  manifestVersion,
  expandRootDefault,
  env = process.env
}) {
  const names = Object.keys(targetsConfig);
  if (names.length < 2) return;

  const lines = [];
  for (const name of names) {
    const tConfig = targetsConfig[name];
    const override = env[tConfig.rootEnv];
    let root = null;
    if (override) {
      root = path.resolve(override);
    } else if (env.HOME) {
      root = expandRootDefault(tConfig.rootDefault);
    }
    if (!root) {
      lines.push(`- ${name}: unknown (set ${tConfig.rootEnv} to check)`);
      continue;
    }

    const tStatePath = path.join(root, tConfig.stateFile ?? ".do-it-install-state.json");
    let version = null;
    try {
      version = JSON.parse(fs.readFileSync(tStatePath, "utf8")).version ?? null;
    } catch {
      version = null;
    }

    if (!version) {
      lines.push(`- ${name}: not installed`);
    } else if (version === manifestVersion) {
      lines.push(`- ${name}: ${version} (up to date)`);
    } else {
      lines.push(`- ${name}: ${version} (run \`do-it install --target=${name}\` to update to ${manifestVersion})`);
    }
  }

  const agyConfigDir = env.AGY_CONFIG_DIR
    ? path.resolve(env.AGY_CONFIG_DIR)
    : resolveUserHome(env) ? path.join(resolveUserHome(env), ".gemini", "config") : null;
  if (agyConfigDir) {
    let agyVersion = null;
    try {
      agyVersion = JSON.parse(
        fs.readFileSync(path.join(agyConfigDir, "plugins", "do-it-agy", "plugin.json"), "utf8")
      ).version ?? null;
    } catch {
      agyVersion = null;
    }
    if (!agyVersion) lines.push("- agy: not installed");
    else if (agyVersion === manifestVersion) lines.push(`- agy: ${agyVersion} (up to date)`);
    else lines.push(`- agy: ${agyVersion} (run \`npm run install:agy-local\` to update to ${manifestVersion})`);
  }

  console.log("");
  console.log(`install state by target (manifest ${manifestVersion}):`);
  for (const line of lines) {
    console.log(line);
  }
}
