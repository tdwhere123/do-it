#!/usr/bin/env node

// Behavior eval runner. The fixture backend is the one runnable
// implementation: it replays canned trajectories against a fresh
// workspace copy and scores deterministic gates. Live host/model
// backends are declared unimplemented and must not be faked.

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
    runnable: false,
    description: "Live host/model adapter",
    reason: "Live host/model backend is unimplemented"
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
  if (out.dryRun) out.backend = out.backend ?? "fixture";
  if (!out.backend) out.backend = "fixture";
  if (out.conditions.length === 0) out.conditions = ["legacy"];
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
  --backend NAME       fixture (runnable) | live (unimplemented)
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
  constructor() {
    this.id = "live";
    this.runnable = false;
    this.reason = BACKENDS.live.reason;
  }

  async run() {
    return {
      status: "NOT_RUN",
      backend: "live",
      model: "NOT_RUN",
      reason: this.reason,
      unimplemented: true
    };
  }
}

export function createBackend(name, options) {
  if (name === "fixture") return new FixtureBackend(options);
  if (name === "live") return new LiveBackend(options);
  throw new Error(`unknown backend: ${name}`);
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
  const backend = createBackend(backendName, { behaviorRoot, fixturesRoot, repoRoot });
  const repoCommit = options.repoCommit ?? gitHead(repoRoot);
  const capturedUtc = options.capturedUtc ?? new Date().toISOString();
  const outDir = options.outDir ?? path.join(behaviorRoot, "runs", nowStamp());

  const modelRuns = {
    status: backendInfo.runnable ? "ran-fixture" : "NOT_RUN",
    reason: backendInfo.runnable
      ? "fixture backend executed canned trajectories"
      : backendInfo.reason,
    backends: {
      fixture: BACKENDS.fixture.runnable ? "runnable" : "unimplemented",
      live: BACKENDS.live.runnable ? "runnable" : "unimplemented"
    }
  };

  const runs = [];
  for (const scenario of selected) {
    for (const condition of conditions) {
      for (let sample = 0; sample < (options.samples ?? 1); sample += 1) {
        const result = await backend.run({
          scenario,
          condition,
          blinded: options.blind === true,
          sample
        });
        const runId = `${scenario.id}-${condition}-${sample}`;
        const trajectoryRef = result.trajectory
          ? `trajectories/${runId}.json`
          : null;
        const run = {
          scenario_id: scenario.id,
          family: scenario.family,
          condition,
          sample,
          backend: result.backend ?? backendName,
          status: result.status,
          reason: result.reason,
          unimplemented: result.unimplemented === true,
          model: result.model ?? (result.status === "ran" ? "fixture-replay" : "NOT_RUN"),
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

  const suite = {
    schema: "do-it/behavior-suite/v1",
    captured_utc: capturedUtc,
    worktree: repoRoot,
    repo_commit: repoCommit,
    backend: backendName,
    dry_run: options.dryRun === true,
    blinded: options.blind === true,
    samples: options.samples ?? 1,
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
        status: "NOT_RUN",
        reason:
          "No model credentials in this worktree; live host/model backend is unimplemented. Fixture dry-run results below are not promotion evidence.",
        backends: modelRuns.backends
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
  const liveRequested = args.backend === "live" && !args.dryRun;
  if (liveRequested) {
    const note = {
      schema: "do-it/behavior-suite/v1",
      model_runs: {
        status: "NOT_RUN",
        reason: BACKENDS.live.reason,
        backends: { fixture: "runnable", live: "unimplemented" }
      },
      runs: []
    };
    process.stderr.write(`${BACKENDS.live.reason}. Use --dry-run --backend fixture.\n`);
    if (args.json) process.stdout.write(`${JSON.stringify(note, null, 2)}\n`);
    if (options.exit !== false) process.exit(2);
    return 2;
  }

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
      dryRun: args.dryRun || args.backend === "fixture",
      blind: args.blind,
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
