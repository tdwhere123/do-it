#!/usr/bin/env node

// Read-only Adaptive candidate report. Does not write profile.md or Core.

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import {
  evaluatePromotion,
  originOf,
  parsePolicyCandidateJsonl,
  proposeCorePromotion,
  validatePolicyCandidateJsonl
} from "./validate-policy-candidates.mjs";

function parseArgs(argv) {
  const out = { files: [], events: null, profile: null };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--events") {
      i += 1;
      out.events = argv[i];
    } else if (arg === "--profile") {
      i += 1;
      out.profile = argv[i];
    } else if (arg === "--") {
      continue;
    } else if (arg.startsWith("-")) {
      throw new Error(`unknown argument: ${arg}`);
    } else {
      out.files.push(arg);
    }
  }
  return out;
}

function loadJsonlObjects(filePath) {
  if (!filePath) return [];
  const text = fs.readFileSync(filePath, "utf8");
  const rows = [];
  for (const line of text.split("\n")) {
    if (line.trim() === "") continue;
    try {
      rows.push(JSON.parse(line));
    } catch {
      // report skips malformed event rows
    }
  }
  return rows;
}

function activateReason(verdict) {
  if (verdict.can_activate) return "yes";
  const note =
    verdict.reasons.find((reason) => !/^[^\s]+:(?:\d+:)? /.test(reason) && !reason.includes(": schema")) ??
    verdict.reasons[0] ??
    "blocked";
  return `no — ${note.replace(/^[^:]+:\d+: /, "")}`;
}

export function renderAdaptiveReport(candidates, context = {}) {
  const lines = [];
  lines.push("Adaptive policy report");
  lines.push(`Candidates: ${candidates.length}`);
  const coreIds = [];
  for (const candidate of candidates) {
    const verdict = evaluatePromotion(candidate, context);
    const origin = originOf(candidate);
    lines.push(
      `- ${candidate.policy_id} [${candidate.scope}] ${candidate.status} ${origin}`
    );
    lines.push(`  target: ${candidate.target_failure}`);
    lines.push(`  support: ${(candidate.supporting_events ?? []).join(", ") || "none"}`);
    lines.push(`  eval: ${verdict.eval_status}`);
    lines.push(`  rollback: ${candidate.rollback}`);
    lines.push(`  activate: ${activateReason(verdict)}`);
    if ((candidate.counterexamples ?? []).length > 0 || candidate.status === "review-needed") {
      lines.push(`  counterexamples: ${(candidate.counterexamples ?? []).join(", ") || "none"}`);
    }
    if (origin === "core-proposal") coreIds.push(candidate.policy_id);
  }
  lines.push("Promotion");
  lines.push("- explicit-preference: show the exact Active line, then confirm; eval is not required");
  lines.push("- inferred: at least two independent tasks and a passing shadow eval; one complaint stays candidate");
  lines.push("- hard-gate fail or NOT_EVALUATED/NOT_RUN: cannot activate");
  lines.push("- counterexample: mark Active as review-needed");
  lines.push("- activate is atomic and reversible; Active stays within 8 bullets");
  lines.push("Core promotion");
  if (coreIds.length === 0) {
    lines.push("- none");
  } else {
    for (const id of coreIds) {
      const proposal = proposeCorePromotion(candidates.find((row) => row.policy_id === id));
      lines.push(`- ${id}: proposal only; write=${proposal.write}; do not write ${proposal.target}`);
    }
  }
  lines.push("Writes");
  lines.push("- report does not write adaptive profile or Core");
  return `${lines.join("\n")}\n`;
}

function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(`build-adaptive-report: ${error.message}`);
    process.exitCode = 2;
    return;
  }
  if (args.files.length === 0) {
    console.error("usage: node scripts/build-adaptive-report.mjs <candidates.jsonl> [--events <file>] [--profile <file>]");
    process.exitCode = 2;
    return;
  }

  const events = args.events ? loadJsonlObjects(path.resolve(args.events)) : [];
  const profileSource =
    args.profile && fs.existsSync(path.resolve(args.profile))
      ? fs.readFileSync(path.resolve(args.profile), "utf8")
      : null;
  const context = { events };
  if (profileSource != null) context.profileSource = profileSource;

  let failed = 0;
  const reports = [];
  for (const file of args.files) {
    const resolved = path.resolve(file);
    if (!fs.existsSync(resolved)) {
      console.error(`${file}: file not found`);
      failed += 1;
      continue;
    }
    const source = fs.readFileSync(resolved, "utf8");
    const errors = validatePolicyCandidateJsonl(source, path.basename(file));
    if (errors.length > 0) {
      failed += 1;
      console.error(`build-adaptive-report: ${file} (${errors.length} failure(s))`);
      for (const error of errors) console.error(`- ${error}`);
      continue;
    }
    const { rows } = parsePolicyCandidateJsonl(source, path.basename(file));
    reports.push(renderAdaptiveReport(rows.map((row) => row.value), context));
  }

  if (failed > 0) {
    process.exitCode = 1;
    return;
  }
  process.stdout.write(reports.join("\n"));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
