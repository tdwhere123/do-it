#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { resolveFixtureDir } from "../validate.mjs";

export const LEGACY_BASELINE = "8e85add081b2793fb39529e1a57a36155fe03847";

export function posixRel(rel) {
  return String(rel).replace(/\\/g, "/");
}

export function copyWorkspace(src, dest) {
  fs.cpSync(src, dest, { recursive: true });
}

export function readTreeFiles(root) {
  const files = {};
  function walk(dir, rel) {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === ".git") continue;
      const childRel = rel ? `${rel}/${entry.name}` : entry.name;
      const childAbs = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(childAbs, childRel);
      else files[childRel.replace(/\\/g, "/")] = fs.readFileSync(childAbs, "utf8");
    }
  }
  walk(root, "");
  return files;
}

function loadJsonIfExists(filePath) {
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

export function loadFixture(fixturesRoot, repoFixture) {
  const dir = resolveFixtureDir(fixturesRoot, repoFixture);
  const workspace = path.join(dir, "workspace");
  const meta = loadJsonIfExists(path.join(dir, "fixture.json")) ?? {};
  return { dir, workspace, meta };
}

function gitEnv() {
  return {
    ...process.env,
    GIT_CONFIG_GLOBAL: "/dev/null",
    GIT_CONFIG_SYSTEM: "/dev/null"
  };
}

export function gitInitWorkspace(dir) {
  const env = gitEnv();
  const run = (args) => spawnSync("git", args, { cwd: dir, env, encoding: "utf8" });
  const init = run(["init", "-q"]);
  if (init.status !== 0) {
    throw new Error(`git init failed: ${init.stderr || init.stdout}`);
  }
  run(["config", "user.email", "eval@do-it.test"]);
  run(["config", "user.name", "do-it-eval"]);
  run(["add", "-A"]);
  const commit = run(["commit", "-q", "--allow-empty", "-m", "eval fixture"]);
  if (commit.status !== 0) {
    throw new Error(`git commit failed: ${commit.stderr || commit.stdout}`);
  }
}

function extractBaselinePlugin(repoRoot, pluginName, destRoot) {
  const dest = path.join(destRoot, pluginName);
  if (fs.existsSync(path.join(dest, "package.json")) || fs.existsSync(path.join(dest, "skills"))) {
    return dest;
  }
  fs.mkdirSync(dest, { recursive: true });
  const archive = spawnSync("git", ["archive", LEGACY_BASELINE, `plugins/${pluginName}`], {
    cwd: repoRoot,
    encoding: "buffer",
    maxBuffer: 64 * 1024 * 1024
  });
  if (archive.status !== 0) {
    const err = archive.stderr?.toString?.() || "git archive failed";
    throw new Error(`legacy plugin extract failed for ${pluginName}: ${err}`);
  }
  const tar = spawnSync("tar", ["-x", "-C", dest, "--strip-components=2"], {
    cwd: dest,
    input: archive.stdout,
    encoding: "buffer",
    maxBuffer: 64 * 1024 * 1024
  });
  if (tar.status !== 0) {
    throw new Error(`legacy plugin untar failed for ${pluginName}: ${tar.stderr?.toString?.() || ""}`);
  }
  return dest;
}

export function pluginRootsFor(repoRoot, condition, cacheDir) {
  if (condition === "vanilla") return { pi: null, cursor: null, mode: "vanilla" };
  if (condition === "legacy") {
    const root = cacheDir ?? fs.mkdtempSync(path.join(os.tmpdir(), "do-it-eval-legacy-"));
    return {
      pi: extractBaselinePlugin(repoRoot, "do-it-pi", root),
      cursor: extractBaselinePlugin(repoRoot, "do-it-cursor", root),
      mode: "legacy"
    };
  }
  return {
    pi: path.join(repoRoot, "plugins/do-it-pi"),
    cursor: path.join(repoRoot, "plugins/do-it-cursor"),
    mode: "kernel"
  };
}

export function stageCursorProjectPlugin(workspaceDir, cursorPluginRoot) {
  if (!cursorPluginRoot) return;
  const cursorDir = path.join(workspaceDir, ".cursor");
  fs.mkdirSync(cursorDir, { recursive: true });
  const hooksSrc = path.join(cursorPluginRoot, "hooks", "hooks.json");
  if (fs.existsSync(hooksSrc)) {
    const text = fs.readFileSync(hooksSrc, "utf8").split("${CURSOR_PLUGIN_ROOT}").join(cursorPluginRoot);
    fs.writeFileSync(path.join(cursorDir, "hooks.json"), text);
  }
  const skillsSrc = path.join(cursorPluginRoot, "skills");
  if (fs.existsSync(skillsSrc)) {
    fs.cpSync(skillsSrc, path.join(cursorDir, "skills"), { recursive: true });
  }
}

export function runFixtureTests(workspaceDir, fixtureMeta) {
  const commands = [];
  for (const check of Object.values(fixtureMeta?.acceptance ?? {})) {
    if (check?.type === "command_exit0" && Array.isArray(check.argv) && check.argv.length) {
      commands.push(check.argv.map(String));
    }
  }
  if (commands.length === 0) {
    for (const testPath of fixtureMeta?.relevant_tests ?? []) {
      commands.push(["node", "--test", String(testPath)]);
    }
  }
  let passed = 0;
  let failed = 0;
  const results = [];
  for (const argv of commands) {
    const result = spawnSync(argv[0], argv.slice(1), {
      cwd: workspaceDir,
      encoding: "utf8",
      timeout: 60_000
    });
    const exit = result.status;
    if (exit === 0) passed += 1;
    else failed += 1;
    results.push({
      type: "command",
      argv,
      exit,
      stdout: result.stdout,
      stderr: result.stderr,
      source: "harness"
    });
  }
  return { passed, failed, results };
}

export function isHarnessPath(rel) {
  const n = posixRel(rel);
  return (
    n === ".do-it/runtime" ||
    n.startsWith(".do-it/runtime/") ||
    n.startsWith(".pi/") ||
    n.startsWith(".cursor/")
  );
}

export function diffWrites(originalFiles, workspaceFiles) {
  const writes = [];
  const originals = originalFiles ?? {};
  for (const [rel, content] of Object.entries(workspaceFiles ?? {})) {
    if (isHarnessPath(rel)) continue;
    if (originals[rel] !== content) {
      writes.push({ type: "write", path: posixRel(rel), content });
    }
  }
  return writes;
}

export function liveBlockedByCi(env = process.env) {
  return env.CI === "true" && env.DO_IT_EVAL_LIVE !== "1";
}

export function liveTimeoutMs(env = process.env) {
  const raw = Number(env.DO_IT_EVAL_TIMEOUT_MS);
  if (Number.isInteger(raw) && raw >= 10_000) return raw;
  return 15 * 60 * 1000;
}
