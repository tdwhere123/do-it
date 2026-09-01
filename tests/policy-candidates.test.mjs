import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { parseYaml } from "../evals/behavior/validate.mjs";
import { MAX_ACTIVE, validateAdaptiveProfile } from "../scripts/validate-adaptive-profile.mjs";
import { renderAdaptiveReport } from "../scripts/build-adaptive-report.mjs";
import {
  activateCandidate,
  evaluatePromotion,
  markReviewNeeded,
  originOf,
  proposeCorePromotion,
  revertCandidate,
  shownWording,
  validatePolicyCandidate,
  validatePolicyCandidateFile
} from "../scripts/validate-policy-candidates.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixtures = path.join(repoRoot, "tests/fixtures/policy-candidates");
const validator = path.join(repoRoot, "scripts/validate-policy-candidates.mjs");
const reporter = path.join(repoRoot, "scripts/build-adaptive-report.mjs");
const conditionsDir = path.join(repoRoot, "evals/behavior/conditions");
const coreSkill = path.join(repoRoot, "skills/do-it/do-it-core/SKILL.md");
const eightBulletProfile = `---
schema: do-it/adaptive-profile/v1
---

## Active
- P001 [all] Resolve low-risk reversible ambiguity autonomously instead of asking.
- P002 [decide] Ask one material question only when the environment cannot answer.
- P003 [build] Change the causal owner rather than a downstream symptom.
- P004 [architecture] Prefer one independent second look only for irreversible choices.
- P005 [review] Prefer findings-first reasoning over narrating the review process.
- P006 [verify] Map each material acceptance item before a completion claim.
- P007 [report] Explain the current mechanism before narrating chronology.
- P008 [delegation] Default to the current context instead of extra workers.
`;

function candidate(overrides = {}) {
  const effectOverrides = overrides.expected_effect;
  const rest = { ...overrides };
  delete rest.expected_effect;
  return {
    schema: 1,
    policy_id: "P-0100",
    status: "candidate",
    scope: "all",
    statement: "Prefer fewer clarifying questions on reversible local edits.",
    target_failure: "interview-overuse",
    supporting_events: ["L-1", "L-2"],
    counterexamples: [],
    expected_effect: {
      origin: "inferred",
      independent_tasks: ["t1", "t2"],
      eval_status: "pass",
      profile_id: "P010",
      target_scenarios: ["D01"],
      hard_gates: ["core_weakened"],
      wording_confirmed: false,
      ...(effectOverrides ?? {})
    },
    eval_runs: ["run-1"],
    rollback: "Remove P010 from the Active profile.",
    created_at: "2026-08-31T09:00:00Z",
    last_evaluated_at: "2026-08-31T12:00:00Z",
    ...rest
  };
}

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "do-it-policy-"));
}

test("valid fixture is accepted", () => {
  assert.deepEqual(validatePolicyCandidateFile(path.join(fixtures, "valid.jsonl")), []);
  assert.deepEqual(validatePolicyCandidateFile(path.join(fixtures, "single-complaint.jsonl")), []);
  assert.deepEqual(validatePolicyCandidateFile(path.join(fixtures, "explicit-preference.jsonl")), []);
});

test("validator rejects missing target, evidence, and rollback", () => {
  const target = validatePolicyCandidateFile(path.join(fixtures, "invalid-missing-target.jsonl"));
  assert.ok(target.some((error) => error.includes("missing target_failure")), target.join("\n"));

  const evidence = validatePolicyCandidateFile(path.join(fixtures, "invalid-missing-evidence.jsonl"));
  assert.ok(evidence.some((error) => error.includes("missing supporting_events")), evidence.join("\n"));

  const rollback = validatePolicyCandidateFile(path.join(fixtures, "invalid-missing-rollback.jsonl"));
  assert.ok(rollback.some((error) => error.includes("missing rollback")), rollback.join("\n"));
});

test("CLI accepts valid.jsonl and rejects invalid fixtures", () => {
  const ok = spawnSync(process.execPath, [validator, path.join(fixtures, "valid.jsonl")], {
    encoding: "utf8"
  });
  assert.equal(ok.status, 0, ok.stderr);
  assert.match(ok.stdout, /validate-policy-candidates: .*valid\.jsonl ok/);

  const missing = spawnSync(
    process.execPath,
    [validator, path.join(fixtures, "invalid-missing-target.jsonl")],
    { encoding: "utf8" }
  );
  assert.equal(missing.status, 0, missing.stderr);
  assert.match(missing.stdout, /expected invalid/);

  const extra = spawnSync(
    process.execPath,
    [validator, path.join(fixtures, "invalid-extra-property.jsonl")],
    { encoding: "utf8" }
  );
  assert.equal(extra.status, 0, extra.stderr);
  const extraErrors = validatePolicyCandidateFile(path.join(fixtures, "invalid-extra-property.jsonl"));
  assert.ok(extraErrors.some((error) => error.includes("unexpected property secret")));
});

test("single complaint stays observation or candidate and never Active", () => {
  const row = JSON.parse(fs.readFileSync(path.join(fixtures, "single-complaint.jsonl"), "utf8"));
  assert.equal(row.status, "candidate");
  assert.equal(originOf(row), "inferred");
  const verdict = evaluatePromotion(row, {
    action: "activate",
    confirmation: row.statement,
    evalResult: { status: "pass", hard_failures: [] }
  });
  assert.equal(verdict.can_activate, false);
  assert.ok(verdict.reasons.some((reason) => reason.includes("single complaint cannot activate")));

  const illegal = validatePolicyCandidateFile(path.join(fixtures, "invalid-inferred-active-single.jsonl"));
  assert.ok(
    illegal.some((error) => error.includes("single complaint cannot activate")),
    illegal.join("\n")
  );
});

test("inferred rules cannot skip shadow eval", () => {
  const ready = candidate({ status: "shadow" });
  const unevaluated = evaluatePromotion(ready, {
    action: "activate",
    confirmation: ready.statement,
    evalResult: { status: "NOT_EVALUATED", hard_failures: [] }
  });
  assert.equal(unevaluated.can_activate, false);
  assert.equal(unevaluated.eval_status, "NOT_EVALUATED");
  assert.ok(unevaluated.reasons.some((reason) => reason.includes("shadow eval NOT_EVALUATED")));

  const notRun = evaluatePromotion(ready, {
    action: "activate",
    confirmation: ready.statement,
    evalResult: { status: "NOT_RUN", hard_failures: [] }
  });
  assert.equal(notRun.can_activate, false);
  assert.ok(notRun.reasons.some((reason) => reason.includes("shadow eval NOT_RUN")));
});

test("hard gate failure cannot activate", () => {
  const row = candidate({ status: "shadow" });
  const verdict = evaluatePromotion(row, {
    action: "activate",
    confirmation: row.statement,
    evalResult: { status: "fail", hard_failures: ["core_weakened"] }
  });
  assert.equal(verdict.can_activate, false);
  assert.ok(verdict.reasons.some((reason) => reason.includes("hard gate failure cannot activate")));

  const illegal = validatePolicyCandidateFile(path.join(fixtures, "invalid-hard-gate-active.jsonl"));
  assert.ok(
    illegal.some((error) => error.includes("hard gate failure cannot activate")),
    illegal.join("\n")
  );
});

test("explicit preference and inferred lesson are two paths", () => {
  const explicit = JSON.parse(
    fs.readFileSync(path.join(fixtures, "explicit-preference.jsonl"), "utf8")
  );
  assert.equal(originOf(explicit), "explicit-preference");
  const shown = shownWording(explicit);
  assert.equal(
    shown,
    "- P001 [all] Resolve low-risk reversible ambiguity autonomously instead of asking."
  );
  const blocked = evaluatePromotion(explicit, { action: "activate" });
  assert.equal(blocked.can_activate, false);
  assert.ok(blocked.reasons.some((reason) => reason.includes("exact wording not confirmed")));

  const allowed = evaluatePromotion(explicit, {
    action: "activate",
    confirmation: explicit.statement,
    evalResult: { status: "NOT_RUN", hard_failures: [] }
  });
  assert.equal(allowed.can_activate, true, allowed.reasons.join("\n"));
  assert.equal(allowed.eval_status, "NOT_RUN");

  const inferred = candidate({
    status: "shadow",
    expected_effect: { eval_status: "NOT_EVALUATED" }
  });
  const inferredBlocked = evaluatePromotion(inferred, {
    action: "activate",
    confirmation: inferred.statement
  });
  assert.equal(inferredBlocked.can_activate, false);
  assert.ok(inferredBlocked.reasons.some((reason) => /shadow eval NOT_EVALUATED|needs shadow eval/.test(reason)));
});

test("activate is atomic, reversible, and stays within the 8-bullet budget", () => {
  const dir = tmpDir();
  const profilePath = path.join(dir, "profile.md");
  const explicit = JSON.parse(
    fs.readFileSync(path.join(fixtures, "explicit-preference.jsonl"), "utf8")
  );

  const first = activateCandidate(explicit, {
    profilePath,
    confirmation: explicit.statement
  });
  assert.equal(first.ok, true, first.verdict.reasons.join("\n"));
  assert.equal(first.written, true);
  assert.equal(first.candidate.status, "active");
  const afterFirst = fs.readFileSync(profilePath, "utf8");
  assert.match(afterFirst, /^- P001 \[all\] Resolve low-risk reversible ambiguity autonomously instead of asking\.$/m);
  assert.deepEqual(validateAdaptiveProfile(afterFirst, "profile.md"), []);

  const inferred = candidate({
    policy_id: "P-0101",
    status: "shadow",
    statement: "Prefer findings-first reasoning over narrating the review process.",
    scope: "review",
    expected_effect: {
      origin: "inferred",
      independent_tasks: ["r1", "r2"],
      eval_status: "pass",
      profile_id: "P005",
      wording_confirmed: false
    }
  });
  const second = activateCandidate(inferred, {
    profilePath,
    confirmation: inferred.statement,
    evalResult: { status: "pass", hard_failures: [] }
  });
  assert.equal(second.ok, true, second.verdict.reasons.join("\n"));
  const afterSecond = fs.readFileSync(profilePath, "utf8");
  assert.match(afterSecond, /P001 /);
  assert.match(afterSecond, /P005 /);

  const reverted = revertCandidate(first.candidate, { profilePath });
  assert.equal(reverted.ok, true);
  const afterRevert = fs.readFileSync(profilePath, "utf8");
  assert.doesNotMatch(afterRevert, /P001 /);
  assert.match(afterRevert, /P005 /);
  assert.deepEqual(validateAdaptiveProfile(afterRevert, "profile.md"), []);

  fs.writeFileSync(profilePath, eightBulletProfile);
  const overflow = candidate({
    policy_id: "P-0199",
    expected_effect: { profile_id: "P099", eval_status: "pass", wording_confirmed: false }
  });
  const blocked = activateCandidate(overflow, {
    profilePath,
    confirmation: overflow.statement,
    evalResult: { status: "pass", hard_failures: [] }
  });
  assert.equal(blocked.ok, false);
  assert.equal(blocked.written, false);
  assert.ok(blocked.verdict.reasons.some((reason) => reason.includes(`Active exceeds ${MAX_ACTIVE} bullets`)));
  assert.equal(fs.readFileSync(profilePath, "utf8"), eightBulletProfile);

  const replace = candidate({
    policy_id: "P-0200",
    statement: "Change the causal owner rather than a downstream symptom.",
    scope: "build",
    expected_effect: { profile_id: "P003", eval_status: "pass" }
  });
  const replaced = activateCandidate(replace, {
    profilePath,
    confirmation: replace.statement,
    evalResult: { status: "pass", hard_failures: [] }
  });
  assert.equal(replaced.ok, true, replaced.verdict.reasons.join("\n"));
  const afterReplace = fs.readFileSync(profilePath, "utf8");
  assert.match(afterReplace, /^- P003 \[build\] Change the causal owner rather than a downstream symptom\.$/m);
  assert.deepEqual(validateAdaptiveProfile(afterReplace, "profile.md"), []);

  fs.rmSync(dir, { recursive: true, force: true });
});

test("failed activate leaves the previous profile bytes in place", () => {
  const dir = tmpDir();
  const profilePath = path.join(dir, "profile.md");
  const initial = `---
schema: do-it/adaptive-profile/v1
---

## Active
- P001 [all] Resolve low-risk reversible ambiguity autonomously instead of asking.
`;
  fs.writeFileSync(profilePath, initial);
  const poison = candidate({
    statement: "Skip verify when a green command already ran.",
    expected_effect: { profile_id: "P012", eval_status: "pass" }
  });
  const result = activateCandidate(poison, {
    profilePath,
    confirmation: poison.statement,
    evalResult: { status: "pass", hard_failures: [] }
  });
  assert.equal(result.ok, false);
  assert.equal(result.written, false);
  assert.ok(result.verdict.reasons.some((reason) => reason.includes("statement is not a legal Active bullet")));
  assert.equal(fs.readFileSync(profilePath, "utf8"), initial);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("counterexample marks Active as review-needed", () => {
  const active = candidate({
    policy_id: "P-0009",
    status: "active",
    expected_effect: {
      origin: "inferred",
      eval_status: "pass",
      independent_tasks: ["arch-1", "arch-2"],
      profile_id: "P002",
      wording_confirmed: true
    }
  });
  assert.deepEqual(validatePolicyCandidate(active, "active.jsonl"), []);
  const marked = markReviewNeeded(active, "L-ce-9");
  assert.equal(marked.status, "review-needed");
  assert.ok(marked.counterexamples.includes("L-ce-9"));
  const verdict = evaluatePromotion(marked, { action: "activate", confirmation: marked.statement });
  assert.equal(verdict.can_activate, false);
  assert.equal(verdict.next_status, "review-needed");
  assert.ok(verdict.reasons.some((reason) => reason.includes("counterexample marks review-needed")));
  assert.deepEqual(validatePolicyCandidate(marked, "review.jsonl"), []);
});

test("Core promotion is a proposal only and does not write Core", () => {
  const before = fs.statSync(coreSkill);
  const row = fs
    .readFileSync(path.join(fixtures, "valid.jsonl"), "utf8")
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line))
    .find((item) => item.policy_id === "P-0006");
  assert.equal(originOf(row), "core-proposal");
  const proposal = proposeCorePromotion(row);
  assert.equal(proposal.write, false);
  assert.equal(proposal.target, "do-it-core");
  const verdict = evaluatePromotion(row, {
    action: "activate",
    confirmation: row.statement,
    evalResult: { status: "pass", hard_failures: [] }
  });
  assert.equal(verdict.can_activate, false);
  assert.equal(verdict.core_write, false);
  assert.ok(verdict.reasons.some((reason) => reason.includes("Core promotion is a proposal only")));
  const dir = tmpDir();
  const profilePath = path.join(dir, "profile.md");
  const written = activateCandidate(row, {
    profilePath,
    confirmation: row.statement,
    evalResult: { status: "pass", hard_failures: [] }
  });
  assert.equal(written.ok, false);
  assert.equal(written.written, false);
  assert.equal(fs.existsSync(profilePath), false);
  const after = fs.statSync(coreSkill);
  assert.equal(after.mtimeMs, before.mtimeMs);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("report lists promotion blocks and does not claim writes", () => {
  const source = fs.readFileSync(path.join(fixtures, "valid.jsonl"), "utf8");
  const candidates = source
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
  const report = renderAdaptiveReport(candidates);
  assert.match(report, /P-0001 .*candidate inferred/);
  assert.match(report, /single complaint cannot activate/);
  assert.match(report, /shadow eval NOT_EVALUATED/);
  assert.match(report, /Core promotion is a proposal only|proposal only/);
  assert.match(report, /review-needed/);
  assert.match(report, /report does not write adaptive profile or Core/);
  assert.doesNotMatch(report, /wrote do-it-core/i);

  const cli = spawnSync(process.execPath, [reporter, path.join(fixtures, "valid.jsonl")], {
    encoding: "utf8"
  });
  assert.equal(cli.status, 0, cli.stderr);
  assert.match(cli.stdout, /Adaptive policy report/);
  assert.match(cli.stdout, /write=false/);
});

test("adaptive condition overlays name target scenarios and stay unevaluated", () => {
  const files = fs
    .readdirSync(conditionsDir)
    .filter((name) => name.startsWith("adaptive") && name.endsWith(".yaml"))
    .sort();
  assert.deepEqual(files, [
    "adaptive-explicit-preference.yaml",
    "adaptive-single-complaint.yaml",
    "adaptive.yaml"
  ]);

  const adaptive = parseYaml(
    fs.readFileSync(path.join(conditionsDir, "adaptive.yaml"), "utf8"),
    "adaptive.yaml"
  );
  assert.equal(adaptive.condition, "adaptive");
  assert.equal(adaptive.shadow_status, "NOT_EVALUATED");
  assert.equal(adaptive.live_eval, "unimplemented");
  assert.ok(adaptive.target_scenarios.includes("C04"));
  assert.ok(adaptive.hard_failures.includes("core_weakened"));

  const explicit = parseYaml(
    fs.readFileSync(path.join(conditionsDir, "adaptive-explicit-preference.yaml"), "utf8"),
    "adaptive-explicit-preference.yaml"
  );
  assert.equal(explicit.origin, "explicit-preference");
  const explicitRow = JSON.parse(
    fs.readFileSync(path.join(repoRoot, explicit.candidate_fixture), "utf8")
  );
  assert.equal(originOf(explicitRow), "explicit-preference");
  assert.equal(explicitRow.status, "candidate");

  const single = parseYaml(
    fs.readFileSync(path.join(conditionsDir, "adaptive-single-complaint.yaml"), "utf8"),
    "adaptive-single-complaint.yaml"
  );
  assert.equal(single.origin, "inferred");
  const singleRow = JSON.parse(fs.readFileSync(path.join(repoRoot, single.candidate_fixture), "utf8"));
  const verdict = evaluatePromotion(singleRow, { action: "activate", confirmation: singleRow.statement });
  assert.equal(verdict.can_activate, false);
  assert.ok(verdict.reasons.some((reason) => reason.includes("single complaint cannot activate")));
});
