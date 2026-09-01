#!/usr/bin/env node

// Behavior eval runner. Fixture replay is the default and the only
// path npm test may execute. Live Cursor/Pi adapters require explicit
// --backend live plus host credentials, and must not fake a model run.

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";

import { judgeRun } from "./judge.mjs";
import {
  assertNoComposite,
  renderSuiteMarkdown,
  summarizeFaces,
  writeRunArtifacts
} from "./report.mjs";
import {
  defaultLiveHosts,
  executeLiveJob,
  parseHosts,
  probeHost
} from "./hosts/live-run.mjs";
import {
  CONDITIONS,
  FAMILIES,
  SEED_SCENARIO_IDS,
  behaviorRootFrom,
  isMain,
  loadScenarios,
  resolveFixtureDir
} from "./validate.mjs";

const CONDITION_ALIASES = Object.freeze({ candidate: "kernel" });

export const BACKENDS = Object.freeze({
  fixture: {
    id: "fixture",
    runnable: true,
    description: "Replay canned fixture trajectories; no network model."
  },
  live: {
    id: "live",
    runnable: true,
    description: "Cursor Grok 4.6 / Pi deepseek-v4-flash adapters; requires credentials"
  }
});

function nowStamp(date = new Date()) {
  return date.toISOString().replace(/[:.]/g, "-");
}

export function gitHead(cwd) {
  const result = spawnSync("git", ["rev-parse", "HEAD"], {
    cwd,
    encoding: "utf8"
  });
  if (result.status !== 0) return "UNKNOWN";
  return result.stdout.trim();
}

export function parseArgs(argv) {
  const out = {
    dryRun: false,
    scenarios: [],
    conditions: [],
    families: [],
    suite: null,
    samples: 1,
    backend: null,
    hosts: [],
    blind: false,
    outDir: null,
    writeBaseline: null,
    json: false,
    help: false
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = () => {
      i += 1;
      return argv[i];
    };
    if (arg === "--help" || arg === "-h") out.help = true;
    else if (arg === "--dry-run") out.dryRun = true;
    else if (arg === "--json") out.json = true;
    else if (arg === "--blind" || arg === "--blinded") out.blind = true;
    else if (arg === "--scenario" || arg === "--scenarios") {
      out.scenarios = String(next() ?? "")
        .split(",")
        .map((id) => id.trim())
        .filter(Boolean);
    } else if (arg === "--condition" || arg === "--conditions") {
      out.conditions = String(next() ?? "")
        .split(",")
        .map((id) => id.trim().toLowerCase())
        .filter(Boolean);
    } else if (arg === "--family" || arg === "--families") {
      out.families = String(next() ?? "")
        .split(",")
        .map((id) => id.trim())
        .filter(Boolean);
    } else if (arg === "--suite") {
      out.suite = String(next() ?? "").trim();
    } else if (arg === "--samples") out.samples = Number(next());
    else if (arg === "--backend") out.backend = String(next() ?? "");
    else if (arg === "--host" || arg === "--hosts") {
      out.hosts = parseHosts(next());
    }
    else if (arg === "--out") out.outDir = next();
    else if (arg === "--write-baseline") out.writeBaseline = next();
    else throw new Error(`unknown argument: ${arg}`);
  }
  if (!Number.isInteger(out.samples) || out.samples < 1) {
    throw new Error("--samples must be a positive integer");
  }
  if (out.backend && !Object.hasOwn(BACKENDS, out.backend)) {
    throw new Error(`unknown backend: ${out.backend}`);
  }
  out.conditions = out.conditions.map((condition) => CONDITION_ALIASES[condition] ?? condition);
  for (const condition of out.conditions) {
    if (!CONDITIONS.includes(condition)) {
      throw new Error(`unknown condition: ${condition}`);
    }
  }
  for (const family of out.families) {
    if (!FAMILIES.includes(family)) {
      throw new Error(`unknown family: ${family}`);
    }
  }
  if (out.suite != null && out.suite !== "" && out.suite !== "release") {
    throw new Error(`unknown suite: ${out.suite}`);
  }
  if (out.suite === "") {
    throw new Error("unknown suite: ");
  }
  if (out.dryRun) out.backend = "fixture";
  if (!out.backend) out.backend = "fixture";
  if (out.conditions.length === 0) out.conditions = ["legacy"];
  if (out.backend === "live" && out.hosts.length === 0) {
    out.hosts = defaultLiveHosts();
  }
  return out;
}

function helpText() {
  return `Usage:
  node evals/behavior/runner.mjs --dry-run --scenario D01
  node evals/behavior/runner.mjs --scenario D01,D02 --condition legacy --dry-run
  node evals/behavior/runner.mjs --dry-run --condition legacy --write-baseline evals/behavior/baselines/0.16.0.json

Options:
  --dry-run            Fixture backend only; never call a network model
  --scenario ID[,ID]   Subset of scenarios (default: nine seed ids)
  --family NAME[,NAME] Filter by family (decision|build|review-verify|recovery|cost|adaptive)
  --suite release      Seed plus extra corpus (all loaded scenarios)
  --condition NAME     vanilla | legacy | kernel | adaptive (candidate aliases kernel)
  --samples N          Fresh workspace per sample (default 1)
  --backend NAME       fixture | live (Cursor Grok 4.6 / Pi deepseek-v4-flash)
  --host NAME[,NAME]   live hosts: cursor, pi (default both). Missing creds → NOT_RUN
  --blind              Hide condition from the judge input
  --out DIR            Run output directory
  --write-baseline PATH
  --json               Print suite JSON to stdout
`;
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

function copyWorkspace(src, dest) {
  fs.cpSync(src, dest, { recursive: true });
}

function resolveIn(root, rel) {
  const abs = path.resolve(root, rel);
  const rootAbs = path.resolve(root);
  const prefix = rootAbs.endsWith(path.sep) ? rootAbs : `${rootAbs}${path.sep}`;
  if (abs !== rootAbs && !abs.startsWith(prefix)) {
    throw new Error(`path escapes workspace: ${rel}`);
  }
  return abs;
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

export function loadTrajectory(fixtureDir, condition) {
  const dir = path.join(fixtureDir, "trajectories");
  const specific = path.join(dir, `${condition}.json`);
  if (fs.existsSync(specific)) {
    return {
      trajectory: JSON.parse(fs.readFileSync(specific, "utf8")),
      source: path.relative(fixtureDir, specific).replace(/\\/g, "/")
    };
  }
  // default.json is the 0.16-style canned replay, not a fake kernel/adaptive run.
  if (condition === "legacy") {
    const fallback = path.join(dir, "default.json");
    if (fs.existsSync(fallback)) {
      return {
        trajectory: JSON.parse(fs.readFileSync(fallback, "utf8")),
        source: path.relative(fixtureDir, fallback).replace(/\\/g, "/")
      };
    }
  }
  return { trajectory: null, source: null };
}

export function applyTrajectory(workspaceDir, fixtureDir, trajectory) {
  const executed = [];
  for (const step of trajectory.steps ?? []) {
    if (step.type === "write") {
      const abs = resolveIn(workspaceDir, step.path);
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      let content = step.content;
      if (content == null && step.from) {
        content = fs.readFileSync(path.join(fixtureDir, step.from), "utf8");
      }
      if (content == null) {
        throw new Error(`write step missing content: ${step.path}`);
      }
      fs.writeFileSync(abs, content);
      executed.push({ ...step, content });
      continue;
    }
    if (step.type === "command" && step.execute) {
      const result = spawnSync(step.argv[0], step.argv.slice(1), {
        cwd: workspaceDir,
        encoding: "utf8",
        env: { ...process.env, ...(trajectory.env ?? {}), ...(step.env ?? {}) }
      });
      executed.push({
        ...step,
        exit: result.status,
        stdout: result.stdout,
        stderr: result.stderr
      });
      continue;
    }
    executed.push(step);
  }
  return { ...trajectory, steps: executed };
}

function countFixtureTests(trajectory) {
  let passed = 0;
  let failed = 0;
  for (const step of trajectory.steps ?? []) {
    if (step.type !== "command" || !step.execute) continue;
    if (step.exit === 0) passed += 1;
    else failed += 1;
  }
  return { passed, failed };
}

export class FixtureBackend {
  constructor(options) {
    this.id = "fixture";
    this.runnable = true;
    this.behaviorRoot = options.behaviorRoot;
    this.fixturesRoot = options.fixturesRoot;
    this.repoRoot = options.repoRoot;
  }

  async run(job) {
    const fixture = loadFixture(this.fixturesRoot, job.scenario.repo_fixture);
    const loaded = loadTrajectory(fixture.dir, job.condition);
    if (!loaded.trajectory) {
      return {
        status: "NOT_RUN",
        reason: `no canned trajectory for condition ${job.condition}`,
        fixture
      };
    }
    const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), `do-it-eval-${job.scenario.id}-`));
    copyWorkspace(fixture.workspace, workspaceDir);
    const originalFiles = readTreeFiles(workspaceDir);
    const applied = applyTrajectory(workspaceDir, fixture.dir, loaded.trajectory);
    const workspaceFiles = readTreeFiles(workspaceDir);
    const fixtureTests = countFixtureTests(applied);
    const judgeInput = {
      scenario: job.scenario,
      fixtureMeta: fixture.meta,
      workspaceFiles,
      originalFiles,
      trajectory: applied,
      fixtureTests,
      condition: job.condition,
      blinded: job.blinded
    };
    const judge = judgeRun(judgeInput);
    fs.rmSync(workspaceDir, { recursive: true, force: true });
    return {
      status: "ran",
      backend: "fixture",
      model: applied.model ?? "fixture-replay",
      trajectory: applied,
      trajectory_source: loaded.source,
      judge,
      fixtureTests
    };
  }
}

export class LiveBackend {
  constructor(options = {}) {
    this.id = "live";
    this.runnable = true;
    this.repoRoot = options.repoRoot;
    this.fixturesRoot = options.fixturesRoot;
    this.adapters = options.adapters ?? {};
    this.env = options.env ?? process.env;
  }

  async run(job) {
    return executeLiveJob({
      ...job,
      repoRoot: this.repoRoot,
      fixturesRoot: this.fixturesRoot,
      adapters: this.adapters,
      env: this.env
    });
  }
}

export function createBackend(name, options) {
  if (name === "fixture") return new FixtureBackend(options);
  if (name === "live") return new LiveBackend(options);
  throw new Error(`unknown backend: ${name}`);
}

const HOST_PROBE_SECRETS = Object.freeze(["apiKey", "sdk", "record", "authPath"]);

// Live probes may carry in-process credentials; suite JSON, aggregates,
// --json, and --write-baseline must not.
export function publicHostProbe(probe) {
  if (probe == null || typeof probe !== "object" || Array.isArray(probe)) {
    return probe;
  }
  const publicProbe = { ...probe };
  let stripped = false;
  for (const key of HOST_PROBE_SECRETS) {
    if (Object.hasOwn(publicProbe, key)) {
      delete publicProbe[key];
      stripped = true;
    }
  }
  if (publicProbe.ok && stripped) publicProbe.credential = "present";
  return publicProbe;
}

function costFrom(result) {
  const fromTraj = result.trajectory?.cost ?? {};
  const metrics = result.judge?.metrics ?? {};
  return {
    tokens: fromTraj.tokens ?? metrics.tokens ?? 0,
    tool_calls: fromTraj.tool_calls ?? metrics.tool_calls ?? 0,
    wall_ms: fromTraj.wall_ms ?? metrics.wall_ms ?? 0,
    injected_tokens: fromTraj.injected_tokens ?? metrics.injected_tokens ?? 0,
    user_questions: metrics.user_questions ?? 0,
    subagent_count: metrics.subagent_count ?? 0
  };
}

export async function runSuite(options) {
  const behaviorRoot = options.behaviorRoot ?? behaviorRootFrom(import.meta.url);
  const repoRoot = options.repoRoot ?? path.resolve(behaviorRoot, "..", "..");
  const fixturesRoot = options.fixturesRoot ?? path.join(behaviorRoot, "fixtures");
  const loaded = loadScenarios(behaviorRoot, {
    scenariosDir: options.scenariosDir ?? path.join(behaviorRoot, "scenarios"),
    fixturesRoot,
    requireSeed: options.requireSeed ?? true
  });
  if (loaded.errors.length) {
    const error = new Error(`scenario validation failed:\n- ${loaded.errors.join("\n- ")}`);
    error.validationErrors = loaded.errors;
    throw error;
  }

  const byId = new Map(loaded.scenarios.map((scenario) => [scenario.id, scenario]));
  let wanted;
  if (options.suite === "release") {
    wanted = loaded.scenarios.map((scenario) => scenario.id);
  } else if (options.scenarios?.length) {
    wanted = [...options.scenarios];
  } else if (options.families?.length) {
    wanted = loaded.scenarios
      .filter((scenario) => options.families.includes(scenario.family))
      .map((scenario) => scenario.id);
  } else {
    wanted = [...SEED_SCENARIO_IDS];
  }
  if (options.families?.length && (options.suite === "release" || options.scenarios?.length)) {
    wanted = wanted.filter((id) => options.families.includes(byId.get(id)?.family));
  }
  const selected = wanted.map((id) => byId.get(id)).filter(Boolean);
  const missing = wanted.filter((id) => !byId.has(id));
  if (missing.length) {
    throw new Error(`unknown scenario id(s): ${missing.join(", ")}`);
  }

  const conditions = options.conditions?.length ? options.conditions : ["legacy"];
  const backendName = options.backend ?? "fixture";
  const backendInfo = BACKENDS[backendName];
  const hosts = backendName === "live" ? defaultLiveHosts(options.hosts) : [null];
  const backend = createBackend(backendName, {
    behaviorRoot,
    fixturesRoot,
    repoRoot,
    adapters: options.adapters,
    env: options.env
  });
  const repoCommit = options.repoCommit ?? gitHead(repoRoot);
  const capturedUtc = options.capturedUtc ?? new Date().toISOString();
  const outDir = options.outDir ?? path.join(behaviorRoot, "runs", nowStamp());

  const hostProbes = {};
  if (backendName === "live") {
    for (const host of hosts) {
      const adapter = options.adapters?.[host];
      const probe = adapter?.probe
        ? await adapter.probe({ repoRoot, env: options.env ?? process.env, host })
        : await probeHost(host, {
            repoRoot,
            env: options.env ?? process.env,
            importSdk: adapter?.importSdk
          });
      hostProbes[host] = publicHostProbe(probe);
    }
  }
  const liveRunnable = Object.values(hostProbes).some((probe) => probe?.ok);
  const modelRuns = {
    status:
      backendName === "live"
        ? liveRunnable
          ? "live"
          : "NOT_RUN"
        : backendInfo.runnable
          ? "ran-fixture"
          : "NOT_RUN",
    reason:
      backendName === "live"
        ? liveRunnable
          ? "live host adapter executed (missing hosts stay NOT_RUN)"
          : Object.values(hostProbes)
              .map((probe) => probe?.reason)
              .filter(Boolean)
              .join("; ") || "no live host has credentials"
        : "fixture backend executed canned trajectories",
    hosts: backendName === "live" ? hostProbes : undefined,
    backends: {
      fixture: BACKENDS.fixture.runnable ? "runnable" : "unimplemented",
      live: BACKENDS.live.runnable ? "runnable" : "unimplemented"
    }
  };

  const runs = [];
  for (const scenario of selected) {
    for (const condition of conditions) {
      for (const host of hosts) {
      for (let sample = 0; sample < (options.samples ?? 1); sample += 1) {
        const result = await backend.run({
          scenario,
          condition,
          host,
          blinded: options.blind === true,
          sample
        });
        const runId = host
          ? `${scenario.id}-${condition}-${host}-${sample}`
          : `${scenario.id}-${condition}-${sample}`;
        const trajectoryRef = result.trajectory
          ? `trajectories/${runId}.json`
          : null;
        const run = {
          scenario_id: scenario.id,
          family: scenario.family,
          condition,
          host: result.host ?? host,
          sample,
          backend: result.backend ?? backendName,
          status: result.status,
          reason: result.reason,
          unimplemented: result.unimplemented === true,
          model: result.model ?? (result.status === "ran" ? "fixture-replay" : "NOT_RUN"),
          thinking: result.thinking ?? null,
          repo_commit: repoCommit,
          permissions: {
            writes: scenario.authorized_actions.writes,
            external: scenario.authorized_actions.external
          },
          cost: result.status === "ran" ? costFrom(result) : {
            tokens: 0,
            tool_calls: 0,
            wall_ms: 0,
            injected_tokens: 0,
            user_questions: 0,
            subagent_count: 0
          },
          trajectory_ref: trajectoryRef,
          trajectory: result.trajectory,
          judge: result.judge ?? null,
          blinded: options.blind === true
        };
        if (result.status === "ran") {
          writeRunArtifacts(path.join(outDir, runId), run);
        } else {
          fs.mkdirSync(path.join(outDir, runId), { recursive: true });
          fs.writeFileSync(
            path.join(outDir, runId, "manifest.json"),
            `${JSON.stringify(
              {
                schema: "do-it/behavior-run-manifest/v1",
                model: run.model,
                condition: run.condition,
                host: run.host,
                thinking: run.thinking,
                repo_commit: run.repo_commit,
                permissions: run.permissions,
                cost: run.cost,
                trajectory_ref: run.trajectory_ref,
                scenario_id: run.scenario_id,
                backend: run.backend,
                status: run.status,
                reason: run.reason,
                unimplemented: run.unimplemented === true
              },
              null,
              2
            )}\n`
          );
        }
        const stored = { ...run };
        delete stored.trajectory;
        runs.push(stored);
      }
      }
    }
  }

  const suite = {
    schema: "do-it/behavior-suite/v1",
    captured_utc: capturedUtc,
    worktree: repoRoot,
    repo_commit: repoCommit,
    backend: backendName,
    dry_run: options.dryRun === true,
    blinded: options.blind === true,
    samples: options.samples ?? 1,
    hosts: backendName === "live" ? hosts : [],
    conditions,
    model_runs: modelRuns,
    runs,
    faces_summary: summarizeFaces(runs.filter((run) => run.judge))
  };
  assertNoComposite(suite, "suite");
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, "aggregates.json"), `${JSON.stringify(suite, null, 2)}\n`);
  fs.writeFileSync(path.join(outDir, "report.md"), renderSuiteMarkdown(suite));

  if (options.writeBaseline) {
    const baseline = {
      schema: "do-it/behavior-baseline/v1",
      card: "S01",
      version: "0.16.0",
      distinct_from: "evals/behavior/baselines/0.16.0-repo.json",
      captured_utc: capturedUtc,
      worktree: repoRoot,
      repo_commit: repoCommit,
      conditions: [...CONDITIONS],
      model_runs: {
        status: modelRuns.status,
        reason:
          backendName === "live"
            ? modelRuns.reason
            : "Fixture dry-run results are not promotion evidence. Live A/B requires --backend live and host credentials.",
        backends: modelRuns.backends,
        hosts: modelRuns.hosts
      },
      notes: [
        "A single run is not promotion evidence.",
        "R03/R04/R06 default trajectories are canned honesty failures so stale/irrelevant/false-verified gates execute without a model."
      ],
      dry_run: {
        backend: "fixture",
        command: options.command ?? "node evals/behavior/runner.mjs --dry-run",
        samples: options.samples ?? 1,
        out_dir: path.resolve(outDir).startsWith(path.resolve(repoRoot) + path.sep)
          ? path.relative(repoRoot, outDir).replace(/\\/g, "/")
          : "evals/behavior/runs/ (gitignored; this capture used an ephemeral --out)",
        runs
      },
      faces_summary: suite.faces_summary
    };
    assertNoComposite(baseline, "baseline");
    fs.mkdirSync(path.dirname(options.writeBaseline), { recursive: true });
    fs.writeFileSync(options.writeBaseline, `${JSON.stringify(baseline, null, 2)}\n`);
    suite.baseline_path = options.writeBaseline;
  }

  return suite;
}

export async function main(argv = process.argv.slice(2), options = {}) {
  let args;
  try {
    args = parseArgs(argv);
  } catch (error) {
    console.error(error.message);
    if (options.exit !== false) process.exit(2);
    return 2;
  }
  if (args.help) {
    process.stdout.write(helpText());
    if (options.exit !== false) process.exit(0);
    return 0;
  }

  const behaviorRoot = options.behaviorRoot ?? behaviorRootFrom(import.meta.url);
  const repoRoot = options.repoRoot ?? path.resolve(behaviorRoot, "..", "..");
  try {
    const suite = await runSuite({
      behaviorRoot,
      repoRoot,
      scenarios: args.scenarios,
      families: args.families,
      suite: args.suite,
      conditions: args.conditions,
      samples: args.samples,
      backend: args.backend,
      hosts: args.hosts,
      dryRun: args.dryRun || args.backend === "fixture",
      blind: args.blind,
      env: options.env,
      adapters: options.adapters,
      outDir: args.outDir ? path.resolve(args.outDir) : undefined,
      writeBaseline: args.writeBaseline ? path.resolve(args.writeBaseline) : undefined,
      command: `node evals/behavior/runner.mjs ${argv.join(" ")}`.trim()
    });
    if (args.json) {
      process.stdout.write(`${JSON.stringify(suite, null, 2)}\n`);
    } else {
      process.stdout.write(renderSuiteMarkdown(suite));
      process.stdout.write(`\nWrote ${suite.runs.length} run(s). Hard gates do not share a composite score.\n`);
    }
    const liveRequested = args.backend === "live" && !args.dryRun;
    const anyLive = suite.runs.some((run) => run.status === "ran");
    if (liveRequested && !anyLive) {
      const reason = suite.model_runs?.reason || "live backend produced no runs";
      process.stderr.write(`${reason}\n`);
      if (options.exit !== false) process.exit(2);
      return 2;
    }
    const failed = suite.runs.some((run) => run.judge && run.judge.hard_gate === "fail");
    const code = failed ? 1 : 0;
    if (options.exit !== false) process.exit(code);
    return code;
  } catch (error) {
    console.error(error.message);
    if (options.exit !== false) process.exit(1);
    return 1;
  }
}

if (isMain(import.meta.url)) {
  await main();
}
