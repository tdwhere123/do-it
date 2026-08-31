#!/usr/bin/env node

// Four independent faces. Never emit a composite that could hide a
// hard-gate failure behind a high rubric average.

import fs from "node:fs";
import path from "node:path";
import process from "node:process";

import { FACES, hasCompositeScore } from "./judge.mjs";
import { isMain } from "./validate.mjs";

function faceTitle(name) {
  if (name === "locality") return "Locality (Maintainability)";
  return name.charAt(0).toUpperCase() + name.slice(1);
}

function formatFailures(hits) {
  if (!hits?.length) return "none";
  return hits.map((hit) => `${hit.id}: ${hit.detail}`).join("; ");
}

function formatAcceptance(acceptance) {
  if (!acceptance) return "n/a";
  return Object.entries(acceptance)
    .map(([id, item]) => `${id}=${item.reached}`)
    .join(", ");
}

export function renderRunMarkdown(run) {
  const judge = run.judge ?? run;
  const faces = judge.faces ?? {};
  const lines = [
    `# Behavior eval — ${judge.scenario_id ?? run.scenario_id} / ${run.condition ?? judge.condition}`,
    "",
    `Hard gates: **${(judge.hard_gate ?? "unknown").toUpperCase()}**`,
    "",
    judge.hard_failures?.length
      ? `Hard failures: ${formatFailures(judge.hard_failures)}`
      : "Hard failures: none",
    "",
    "Faces are independent. A pass on one face does not offset a hard failure on another.",
    ""
  ];

  lines.push(`## ${faceTitle("correctness")}`, "");
  lines.push(`Status: ${faces.correctness?.status ?? "n/a"}`);
  lines.push(`Acceptance: ${formatAcceptance(faces.correctness?.acceptance)}`);
  lines.push(
    `Fixture tests: passed=${faces.correctness?.fixture_tests?.passed ?? 0} failed=${faces.correctness?.fixture_tests?.failed ?? 0}`
  );
  lines.push(`Hard failures on this face: ${formatFailures(faces.correctness?.hard_failures)}`);
  lines.push("");

  lines.push(`## ${faceTitle("integrity")}`, "");
  lines.push(`Status: ${faces.integrity?.status ?? "n/a"}`);
  lines.push(`Claim: ${faces.integrity?.claim ?? "n/a"}`);
  lines.push(`Fresh relevant evidence: ${faces.integrity?.fresh_relevant_evidence ?? "n/a"}`);
  lines.push(`Hard failures on this face: ${formatFailures(faces.integrity?.hard_failures)}`);
  lines.push("");

  lines.push(`## ${faceTitle("cost")}`, "");
  lines.push(`Status: ${faces.cost?.status ?? "n/a"}`);
  lines.push(
    `tokens=${faces.cost?.tokens ?? 0} tool_calls=${faces.cost?.tool_calls ?? 0} wall_ms=${faces.cost?.wall_ms ?? 0} injected_tokens=${faces.cost?.injected_tokens ?? 0}`
  );
  lines.push(
    `user_questions=${faces.cost?.user_questions ?? 0} subagent_count=${faces.cost?.subagent_count ?? 0} artifact_count=${faces.cost?.artifact_count ?? 0}`
  );
  lines.push(`Hard failures on this face: ${formatFailures(faces.cost?.hard_failures)}`);
  lines.push("");

  lines.push(`## ${faceTitle("locality")}`, "");
  lines.push(`Status: ${faces.locality?.status ?? "n/a"}`);
  lines.push(`Authority locality: ${faces.locality?.authority_locality ?? "unscored"}`);
  lines.push(`Changed paths: ${(faces.locality?.changed_paths ?? []).join(", ") || "none"}`);
  lines.push(
    `Paths outside cone: ${(faces.locality?.paths_outside_cone ?? []).join(", ") || "none"}`
  );
  lines.push(`Hard failures on this face: ${formatFailures(faces.locality?.hard_failures)}`);
  lines.push("");

  lines.push("## Record", "");
  lines.push(`- model: ${run.model ?? "n/a"}`);
  lines.push(`- condition: ${run.condition ?? "n/a"}`);
  lines.push(`- repo_commit: ${run.repo_commit ?? "n/a"}`);
  lines.push(`- permissions: ${JSON.stringify(run.permissions ?? {})}`);
  lines.push(`- cost: ${JSON.stringify(run.cost ?? {})}`);
  lines.push(`- trajectory_ref: ${run.trajectory_ref ?? "n/a"}`);
  lines.push("");
  return lines.join("\n");
}

export function normalizeSuite(source) {
  const runs = source.runs ?? source.dry_run?.runs ?? [];
  return {
    ...source,
    backend: source.backend ?? source.dry_run?.backend ?? "n/a",
    runs
  };
}

export function renderSuiteMarkdown(suite) {
  const normalized = normalizeSuite(suite);
  const lines = [
    "# Behavior eval report",
    "",
    `Captured: ${normalized.captured_utc ?? ""}`,
    `Backend: ${normalized.backend ?? "n/a"}`,
    `Model runs: ${normalized.model_runs?.status ?? "n/a"}`,
    "",
    "Four independent faces. There is no overall score.",
    ""
  ];
  const summary = normalized.faces_summary ?? summarizeFaces(normalized.runs);
  for (const face of FACES) {
    const item = summary[face] ?? {};
    lines.push(`## ${faceTitle(face)}`, "");
    lines.push(`Runs: pass=${item.pass ?? 0} fail=${item.fail ?? 0} other=${item.other ?? 0}`);
    if (item.notes?.length) {
      for (const note of item.notes) lines.push(`- ${note}`);
    }
    lines.push("");
  }
  lines.push("## Runs", "");
  for (const run of normalized.runs) {
    const judge = run.judge ?? {};
    lines.push(
      `- ${run.scenario_id} / ${run.condition}: hard_gate=${judge.hard_gate} correctness=${judge.faces?.correctness?.status} integrity=${judge.faces?.integrity?.status} cost=${judge.faces?.cost?.status} locality=${judge.faces?.locality?.status}`
    );
  }
  lines.push("");
  return lines.join("\n");
}

export function summarizeFaces(runs) {
  const summary = {};
  for (const face of FACES) {
    summary[face] = { pass: 0, fail: 0, other: 0, notes: [] };
  }
  for (const run of runs) {
    const faces = run.judge?.faces ?? run.faces ?? {};
    for (const face of FACES) {
      const status = faces[face]?.status;
      if (status === "pass") summary[face].pass += 1;
      else if (status === "fail") summary[face].fail += 1;
      else summary[face].other += 1;
    }
    if ((run.judge?.hard_failures ?? []).length) {
      summary.integrity.notes.push(
        `${run.scenario_id}: ${formatFailures(run.judge.hard_failures)}`
      );
    }
  }
  return summary;
}

export function assertNoComposite(value, label = "report") {
  if (hasCompositeScore(value)) {
    throw new Error(`${label}: composite/overall score is forbidden`);
  }
  return value;
}

export function writeRunArtifacts(runDir, run) {
  assertNoComposite(run, "run");
  fs.mkdirSync(runDir, { recursive: true });
  fs.writeFileSync(
    path.join(runDir, "manifest.json"),
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
        blinded: run.blinded === true,
        sample: run.sample ?? 0
      },
      null,
      2
    )}\n`
  );
  fs.writeFileSync(
    path.join(runDir, "deterministic.json"),
    `${JSON.stringify(
      {
        hard_gate: run.judge.hard_gate,
        hard_failures: run.judge.hard_failures,
        metrics: run.judge.metrics,
        faces: run.judge.faces
      },
      null,
      2
    )}\n`
  );
  fs.writeFileSync(
    path.join(runDir, "rubric.json"),
    `${JSON.stringify(run.judge.rubric, null, 2)}\n`
  );
  fs.writeFileSync(path.join(runDir, "costs.json"), `${JSON.stringify(run.cost, null, 2)}\n`);
  fs.writeFileSync(path.join(runDir, "report.md"), renderRunMarkdown(run));
  if (run.trajectory && run.write_trajectory !== false) {
    const trajDir = path.join(runDir, "trajectories");
    fs.mkdirSync(trajDir, { recursive: true });
    const trajName = path.basename(run.trajectory_ref ?? "trajectory.json");
    fs.writeFileSync(path.join(trajDir, trajName), `${JSON.stringify(run.trajectory, null, 2)}\n`);
  }
}

export function loadReportSource(targetPath) {
  const stat = fs.statSync(targetPath);
  if (stat.isDirectory()) {
    const aggregate = path.join(targetPath, "aggregates.json");
    if (fs.existsSync(aggregate)) {
      return JSON.parse(fs.readFileSync(aggregate, "utf8"));
    }
    const manifest = JSON.parse(fs.readFileSync(path.join(targetPath, "manifest.json"), "utf8"));
    const deterministic = JSON.parse(
      fs.readFileSync(path.join(targetPath, "deterministic.json"), "utf8")
    );
    const rubric = fs.existsSync(path.join(targetPath, "rubric.json"))
      ? JSON.parse(fs.readFileSync(path.join(targetPath, "rubric.json"), "utf8"))
      : {};
    const costs = fs.existsSync(path.join(targetPath, "costs.json"))
      ? JSON.parse(fs.readFileSync(path.join(targetPath, "costs.json"), "utf8"))
      : {};
    return {
      runs: [
        {
          ...manifest,
          cost: costs,
          judge: { ...deterministic, rubric }
        }
      ]
    };
  }
  return JSON.parse(fs.readFileSync(targetPath, "utf8"));
}

export function main(argv = process.argv.slice(2), options = {}) {
  const target = argv[0];
  if (!target) {
    console.error("usage: node evals/behavior/report.mjs <run-dir-or-baseline.json>");
    if (options.exit !== false) process.exit(2);
    return 2;
  }
  const source = normalizeSuite(loadReportSource(path.resolve(target)));
  assertNoComposite(source, target);
  const markdown = source.faces_summary || source.runs?.length !== 1
    ? renderSuiteMarkdown(source)
    : renderRunMarkdown(source.runs[0]);
  process.stdout.write(markdown.endsWith("\n") ? markdown : `${markdown}\n`);
  if (options.exit !== false) process.exit(0);
  return 0;
}

if (isMain(import.meta.url)) {
  main();
}
