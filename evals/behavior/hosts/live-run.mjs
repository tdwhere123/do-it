#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { judgeRun } from "../judge.mjs";
import { runCursorPrompt } from "./cursor-sdk.mjs";
import { probeCursor } from "./cursor-sdk.mjs";
import { probePi, runPiPrompt } from "./pi-sdk.mjs";
import { buildTrajectory } from "./trajectory.mjs";
import {
  copyWorkspace,
  diffWrites,
  gitInitWorkspace,
  installAdaptiveProfile,
  loadFixture,
  pluginRootsFor,
  readTreeFiles,
  runFixtureTests,
  stageCursorProjectPlugin
} from "./workspace.mjs";

export const HOST_IDS = Object.freeze(["cursor", "pi"]);

export function parseHosts(raw) {
  const hosts = String(raw ?? "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
  for (const host of hosts) {
    if (!HOST_IDS.includes(host)) {
      throw new Error(`unknown host: ${host}`);
    }
  }
  return hosts;
}

export function defaultLiveHosts(hosts) {
  if (hosts?.length) return [...hosts];
  return [...HOST_IDS];
}

export async function probeHost(host, options) {
  if (host === "cursor") return probeCursor(options);
  if (host === "pi") return probePi(options);
  return { ok: false, reason: `unknown host: ${host}` };
}

function defaultPrompt(host, job) {
  if (host === "cursor") return runCursorPrompt(job);
  if (host === "pi") return runPiPrompt(job);
  throw new Error(`unknown host: ${host}`);
}

export async function executeLiveJob(job) {
  const {
    scenario,
    condition,
    host,
    blinded,
    repoRoot,
    fixturesRoot,
    adapters,
    env = process.env
  } = job;
  const adapter = adapters?.[host];
  const probe = adapter?.probe
    ? await adapter.probe({ repoRoot, env, host, condition })
    : await probeHost(host, { repoRoot, env });
  if (!probe?.ok) {
    return {
      status: "NOT_RUN",
      backend: "live",
      host,
      model: "NOT_RUN",
      reason: probe?.reason ?? `host ${host} is not runnable`,
      unimplemented: false
    };
  }

  const fixture = loadFixture(fixturesRoot, scenario.repo_fixture);
  const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), `do-it-eval-live-${scenario.id}-`));
  const legacyCache = fs.mkdtempSync(path.join(os.tmpdir(), "do-it-eval-legacy-"));
  copyWorkspace(fixture.workspace, workspaceDir);
  if (condition === "adaptive") {
    installAdaptiveProfile(workspaceDir, repoRoot);
  }
  gitInitWorkspace(workspaceDir);
  const originalFiles = readTreeFiles(workspaceDir);
  const plugins = pluginRootsFor(repoRoot, condition, legacyCache);
  if (host === "cursor") {
    stageCursorProjectPlugin(workspaceDir, plugins.cursor);
  }

  const promptJob = {
    repoRoot,
    cwd: workspaceDir,
    prompt: scenario.prompt,
    condition,
    pluginRoot: host === "cursor" ? plugins.cursor : plugins.pi,
    env,
    importSdk: adapter?.importSdk
  };

  try {
    const raw = adapter?.prompt
      ? await adapter.prompt(promptJob)
      : await defaultPrompt(host, promptJob);
    const workspaceFiles = readTreeFiles(workspaceDir);
    const writes = diffWrites(originalFiles, workspaceFiles);
    const trajectory = buildTrajectory({
      events: raw.events ?? [],
      assistantText: raw.assistantText ?? "",
      injectedTexts: raw.injectedTexts ?? [],
      diffWrites: writes,
      cwd: workspaceDir,
      cost: {
        tokens: raw.tokens ?? 0,
        tool_calls: (raw.events ?? []).length,
        wall_ms: raw.wall_ms ?? 0,
        injected_tokens: raw.injected_tokens
      },
      model: raw.model ?? probe.model ?? "live",
      condition,
      host,
      thinking: raw.thinking ?? probe.thinking ?? null
    });
    const fixtureTests = runFixtureTests(workspaceDir, fixture.meta);
    const judge = judgeRun({
      scenario,
      fixtureMeta: fixture.meta,
      workspaceFiles,
      originalFiles,
      trajectory,
      fixtureTests,
      condition,
      blinded
    });
    return {
      status: "ran",
      backend: "live",
      host,
      model: trajectory.model,
      thinking: trajectory.thinking,
      trajectory,
      judge,
      fixtureTests
    };
  } catch (error) {
    return {
      status: "NOT_RUN",
      backend: "live",
      host,
      model: probe.model ?? "NOT_RUN",
      reason: error.message,
      unimplemented: false
    };
  } finally {
    fs.rmSync(workspaceDir, { recursive: true, force: true });
    fs.rmSync(legacyCache, { recursive: true, force: true });
  }
}
