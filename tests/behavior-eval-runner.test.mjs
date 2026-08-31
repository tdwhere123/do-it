import assert from "node:assert/strict";
import test from "node:test";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { BACKENDS, parseArgs, runSuite } from "../evals/behavior/runner.mjs";
import { hasCompositeScore } from "../evals/behavior/judge.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const runnerCli = path.join(repoRoot, "evals/behavior/runner.mjs");

test("parseArgs defaults dry-run to the fixture backend", () => {
  const args = parseArgs(["--dry-run", "--scenario", "D01,D02", "--condition", "legacy"]);
  assert.equal(args.dryRun, true);
  assert.equal(args.backend, "fixture");
  assert.deepEqual(args.scenarios, ["D01", "D02"]);
  assert.deepEqual(args.conditions, ["legacy"]);
});

test("parseArgs accepts --family, --suite release, and candidate→kernel", () => {
  const args = parseArgs([
    "--dry-run",
    "--family",
    "build",
    "--suite",
    "release",
    "--condition",
    "legacy,candidate"
  ]);
  assert.deepEqual(args.families, ["build"]);
  assert.equal(args.suite, "release");
  assert.deepEqual(args.conditions, ["legacy", "kernel"]);
});

test("parseArgs still throws on unknown flags and unknown suite/family", () => {
  assert.throws(() => parseArgs(["--foo"]), /unknown argument: --foo/);
  assert.throws(() => parseArgs(["--suite", "nightly"]), /unknown suite: nightly/);
  assert.throws(() => parseArgs(["--family", "nope"]), /unknown family: nope/);
  assert.throws(() => parseArgs(["--condition", "candidate-x"]), /unknown condition: candidate-x/);
});

test("live backend is unimplemented and is not faked", () => {
  assert.equal(BACKENDS.live.runnable, false);
  assert.match(BACKENDS.live.reason, /unimplemented/i);
  const result = spawnSync(
    process.execPath,
    [runnerCli, "--backend", "live", "--scenario", "D01"],
    { cwd: repoRoot, encoding: "utf8" }
  );
  assert.equal(result.status, 2, result.stderr);
  assert.match(result.stderr, /unimplemented/i);
  assert.doesNotMatch(result.stdout + result.stderr, /"model": "gpt-/);
});

test("dry-run fixture backend records model, condition, commit, permissions, cost, trajectory ref", async () => {
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "do-it-eval-run-"));
  const suite = await runSuite({
    behaviorRoot: path.join(repoRoot, "evals/behavior"),
    repoRoot,
    scenarios: ["D01"],
    conditions: ["legacy"],
    samples: 1,
    backend: "fixture",
    dryRun: true,
    outDir
  });
  assert.equal(suite.runs.length, 1);
  const run = suite.runs[0];
  assert.equal(run.scenario_id, "D01");
  assert.equal(run.condition, "legacy");
  assert.equal(run.model, "fixture-replay");
  assert.equal(run.repo_commit.length, 40);
  assert.deepEqual(run.permissions, { writes: true, external: false });
  assert.equal(typeof run.cost.tokens, "number");
  assert.equal(run.trajectory_ref, "trajectories/D01-legacy-0.json");
  assert.equal(run.judge.hard_gate, "pass");
  assert.equal(hasCompositeScore(suite), false);

  const manifest = JSON.parse(fs.readFileSync(path.join(outDir, "D01-legacy-0/manifest.json"), "utf8"));
  assert.equal(manifest.model, "fixture-replay");
  assert.equal(manifest.condition, "legacy");
  assert.equal(manifest.repo_commit, run.repo_commit);
  assert.deepEqual(manifest.permissions, run.permissions);
  assert.ok(manifest.cost);
  assert.equal(manifest.trajectory_ref, run.trajectory_ref);
  const report = fs.readFileSync(path.join(outDir, "D01-legacy-0/report.md"), "utf8");
  assert.match(report, /## Correctness/);
  assert.match(report, /## Integrity/);
  assert.match(report, /## Cost/);
  assert.match(report, /## Locality \(Maintainability\)/);
  fs.rmSync(outDir, { recursive: true, force: true });
});

test("dry-run CLI executes D01 without a network model", () => {
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "do-it-eval-cli-"));
  const result = spawnSync(
    process.execPath,
    [runnerCli, "--dry-run", "--scenario", "D01", "--condition", "legacy", "--out", outDir],
    { cwd: repoRoot, encoding: "utf8" }
  );
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /## Correctness/);
  assert.match(result.stdout, /Four independent faces/);
  assert.equal(fs.existsSync(path.join(outDir, "D01-legacy-0/deterministic.json")), true);
  fs.rmSync(outDir, { recursive: true, force: true });
});

test("family and release suite select extra corpus without dropping seeds", async () => {
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "do-it-eval-family-"));
  const family = await runSuite({
    behaviorRoot: path.join(repoRoot, "evals/behavior"),
    repoRoot,
    families: ["adaptive"],
    conditions: ["legacy"],
    backend: "fixture",
    dryRun: true,
    outDir: path.join(outDir, "family")
  });
  const ids = family.runs.map((run) => run.scenario_id).sort();
  assert.ok(ids.includes("C02"), ids.join(","));
  assert.ok(ids.includes("C03"), ids.join(","));
  assert.equal(family.runs.every((run) => run.family === "adaptive"), true);

  const release = await runSuite({
    behaviorRoot: path.join(repoRoot, "evals/behavior"),
    repoRoot,
    suite: "release",
    conditions: ["legacy"],
    backend: "fixture",
    dryRun: true,
    outDir: path.join(outDir, "release")
  });
  const releaseIds = new Set(release.runs.map((run) => run.scenario_id));
  assert.ok(releaseIds.has("D01"));
  assert.ok(releaseIds.has("C02"));
  assert.ok(releaseIds.has("C03"));
  assert.ok(releaseIds.has("A01"));
  fs.rmSync(outDir, { recursive: true, force: true });
});

test("kernel and adaptive without canned trajectories are NOT_RUN, not faked", async () => {
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "do-it-eval-notrun-"));
  const suite = await runSuite({
    behaviorRoot: path.join(repoRoot, "evals/behavior"),
    repoRoot,
    scenarios: ["D01"],
    conditions: ["kernel", "adaptive"],
    backend: "fixture",
    dryRun: true,
    outDir
  });
  assert.equal(suite.runs.length, 2);
  for (const run of suite.runs) {
    assert.equal(run.status, "NOT_RUN");
    assert.equal(run.model, "NOT_RUN");
    assert.match(run.reason, /no canned trajectory/);
  }
  fs.rmSync(outDir, { recursive: true, force: true });
});

test("R03 canned dry-run fails stale evidence even if tests later look green", async () => {
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "do-it-eval-r03-"));
  const suite = await runSuite({
    behaviorRoot: path.join(repoRoot, "evals/behavior"),
    repoRoot,
    scenarios: ["R03"],
    conditions: ["legacy"],
    backend: "fixture",
    dryRun: true,
    outDir
  });
  const run = suite.runs[0];
  assert.equal(run.judge.hard_gate, "fail");
  assert.ok(run.judge.hard_failures.some((hit) => hit.id === "stale_evidence"));
  fs.rmSync(outDir, { recursive: true, force: true });
});
