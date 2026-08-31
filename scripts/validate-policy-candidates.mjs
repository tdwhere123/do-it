#!/usr/bin/env node

// Structural checks for Policy Candidate v1 JSONL, plus promotion gates.
// Schema: do-it/policy-candidate/v1 (plan package schemas/policy-candidate-v1.json).
//
// CLI: node scripts/validate-policy-candidates.mjs <file> [<file>...]
// Basename starting with `invalid` must fail validation; every other file
// must pass.

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import {
  MAX_ACTIVE,
  SCHEMA_ID as PROFILE_SCHEMA_ID,
  SUPPORTED_SCOPES,
  classifyActiveBullet,
  parseAdaptiveProfile,
  validateAdaptiveProfile
} from "./validate-adaptive-profile.mjs";

export const CANDIDATE_SCHEMA = 1;
export const SCHEMA_ID = "do-it/policy-candidate/v1";
export const MAX_CANDIDATE_STATEMENT = 300;
export const POLICY_ID_RE = /^P-[0-9A-Za-z_-]+$/;
export const PROFILE_ID_RE = /^P\d{3}$/;
export const STATUSES = Object.freeze([
  "candidate",
  "shadow",
  "active",
  "stable",
  "review-needed",
  "retired",
  "reverted"
]);
export const ORIGINS = Object.freeze([
  "explicit-preference",
  "inferred",
  "core-proposal"
]);
export const EVAL_STATUSES = Object.freeze([
  "pass",
  "fail",
  "NOT_EVALUATED",
  "NOT_RUN"
]);

export const EMPTY_PROFILE = `---
schema: ${PROFILE_SCHEMA_ID}
---

## Active
`;

const STATUS_SET = new Set(STATUSES);
const SCOPE_SET = new Set(SUPPORTED_SCOPES);
const ORIGIN_SET = new Set(ORIGINS);
const EVAL_STATUS_SET = new Set(EVAL_STATUSES);
const ROOT_KEYS = new Set([
  "schema",
  "policy_id",
  "status",
  "scope",
  "statement",
  "target_failure",
  "supporting_events",
  "counterexamples",
  "expected_effect",
  "eval_runs",
  "rollback",
  "created_at",
  "last_evaluated_at"
]);
const DATE_TIME =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;
const ACTIVE_BULLET_RE = /^- (P\d+) \[/;

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isStringArray(value) {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function nonEmptyStringArray(value) {
  return isStringArray(value) && value.every((item) => item.trim() !== "");
}

function nullableDateTime(value) {
  return value === null || (typeof value === "string" && DATE_TIME.test(value));
}

function unique(items) {
  const seen = new Set();
  const out = [];
  for (const item of items) {
    if (seen.has(item)) continue;
    seen.add(item);
    out.push(item);
  }
  return out;
}

/**
 * @param {unknown} effect
 * @param {string} label
 * @returns {string[]}
 */
function validateExpectedEffect(effect, label) {
  const errors = [];
  if (effect === null) return errors;
  if (!isObject(effect)) {
    errors.push(`${label}: expected_effect must be an object or null`);
    return errors;
  }
  if (Object.hasOwn(effect, "origin") && effect.origin != null && !ORIGIN_SET.has(effect.origin)) {
    errors.push(`${label}: origin must be explicit-preference|inferred|core-proposal`);
  }
  if (Object.hasOwn(effect, "eval_status") && effect.eval_status != null && !EVAL_STATUS_SET.has(effect.eval_status)) {
    errors.push(`${label}: eval_status must be pass|fail|NOT_EVALUATED|NOT_RUN`);
  }
  if (Object.hasOwn(effect, "profile_id") && effect.profile_id != null) {
    if (typeof effect.profile_id !== "string" || !PROFILE_ID_RE.test(effect.profile_id)) {
      errors.push(`${label}: profile_id must be P###`);
    }
  }
  if (Object.hasOwn(effect, "wording_confirmed") && typeof effect.wording_confirmed !== "boolean") {
    errors.push(`${label}: wording_confirmed must be a boolean`);
  }
  if (Object.hasOwn(effect, "independent_tasks") && !isStringArray(effect.independent_tasks)) {
    errors.push(`${label}: independent_tasks must be an array of strings`);
  }
  if (Object.hasOwn(effect, "target_scenarios") && !isStringArray(effect.target_scenarios)) {
    errors.push(`${label}: target_scenarios must be an array of strings`);
  }
  if (Object.hasOwn(effect, "hard_gates") && !isStringArray(effect.hard_gates)) {
    errors.push(`${label}: hard_gates must be an array of strings`);
  }
  return errors;
}

/**
 * @param {unknown} candidate
 * @param {string} [label]
 * @returns {string[]}
 */
export function validatePolicyCandidateSchema(candidate, label = "candidate") {
  const errors = [];
  if (!isObject(candidate)) {
    errors.push(`${label}: not an object`);
    return errors;
  }
  for (const key of Object.keys(candidate)) {
    if (!ROOT_KEYS.has(key)) {
      errors.push(`${label}: unexpected property ${key}`);
    }
  }
  if (candidate.schema !== CANDIDATE_SCHEMA) {
    errors.push(`${label}: schema must be ${CANDIDATE_SCHEMA}`);
  }
  if (typeof candidate.policy_id !== "string" || !POLICY_ID_RE.test(candidate.policy_id)) {
    errors.push(`${label}: policy_id must match P-<id>`);
  }
  if (!STATUS_SET.has(candidate.status)) {
    errors.push(`${label}: status is not a known candidate status`);
  }
  if (!SCOPE_SET.has(candidate.scope)) {
    errors.push(`${label}: illegal scope [${candidate.scope}]`);
  }
  if (typeof candidate.statement !== "string" || candidate.statement.trim() === "") {
    errors.push(`${label}: statement must be a non-empty string`);
  } else if (candidate.statement.length > MAX_CANDIDATE_STATEMENT) {
    errors.push(`${label}: statement exceeds ${MAX_CANDIDATE_STATEMENT} characters`);
  }
  if (typeof candidate.target_failure !== "string" || candidate.target_failure.trim() === "") {
    errors.push(`${label}: missing target_failure`);
  }
  if (!Array.isArray(candidate.supporting_events)) {
    errors.push(`${label}: missing supporting_events`);
  } else if (candidate.supporting_events.length === 0) {
    errors.push(`${label}: missing supporting_events`);
  } else if (!nonEmptyStringArray(candidate.supporting_events)) {
    errors.push(`${label}: supporting_events must be non-empty strings`);
  }
  if (Object.hasOwn(candidate, "counterexamples") && !isStringArray(candidate.counterexamples)) {
    errors.push(`${label}: counterexamples must be an array of strings`);
  }
  if (Object.hasOwn(candidate, "eval_runs") && !isStringArray(candidate.eval_runs)) {
    errors.push(`${label}: eval_runs must be an array of strings`);
  }
  if (typeof candidate.rollback !== "string" || candidate.rollback.trim() === "") {
    errors.push(`${label}: missing rollback`);
  }
  if (Object.hasOwn(candidate, "created_at") && !nullableDateTime(candidate.created_at)) {
    errors.push(`${label}: created_at must be an ISO-8601 date-time or null`);
  }
  if (Object.hasOwn(candidate, "last_evaluated_at") && !nullableDateTime(candidate.last_evaluated_at)) {
    errors.push(`${label}: last_evaluated_at must be an ISO-8601 date-time or null`);
  }
  if (Object.hasOwn(candidate, "expected_effect")) {
    errors.push(...validateExpectedEffect(candidate.expected_effect, label));
  }
  return errors;
}

export function originOf(candidate) {
  const origin = candidate?.expected_effect?.origin;
  if (origin == null || origin === "") return "inferred";
  return origin;
}

export function profileIdOf(candidate) {
  const id = candidate?.expected_effect?.profile_id;
  if (typeof id === "string" && PROFILE_ID_RE.test(id)) return id;
  return null;
}

export function shownWording(candidate) {
  const statement = typeof candidate?.statement === "string" ? candidate.statement : "";
  const scope = typeof candidate?.scope === "string" ? candidate.scope : "all";
  const profileId = profileIdOf(candidate);
  return profileId ? `- ${profileId} [${scope}] ${statement}` : `- [${scope}] ${statement}`;
}

export function renderActiveBullet(profileId, scope, statement) {
  return `- ${profileId} [${scope}] ${statement}`;
}

export function independentTaskIds(candidate, events = []) {
  const tasks = new Set();
  const byId = new Map();
  for (const event of events) {
    if (event && typeof event.event_id === "string") byId.set(event.event_id, event);
  }
  for (const id of candidate?.supporting_events ?? []) {
    const event = byId.get(id);
    if (typeof event?.task_id === "string" && event.task_id.trim() !== "") {
      tasks.add(event.task_id);
    }
  }
  const listed = candidate?.expected_effect?.independent_tasks;
  if (Array.isArray(listed)) {
    for (const task of listed) {
      if (typeof task === "string" && task.trim() !== "") tasks.add(task);
    }
  }
  return tasks;
}

export function resolveEvalStatus(candidate, context = {}) {
  const hardHits = context.evalResult?.hard_failures;
  if (Array.isArray(hardHits) && hardHits.length > 0) return "fail";
  const fromResult = context.evalResult?.status;
  if (EVAL_STATUS_SET.has(fromResult)) return fromResult;
  const fromEffect = candidate?.expected_effect?.eval_status;
  if (EVAL_STATUS_SET.has(fromEffect)) return fromEffect;
  if (originOf(candidate) === "explicit-preference" || originOf(candidate) === "core-proposal") {
    return fromEffect ?? "not-required";
  }
  return "NOT_EVALUATED";
}

function confirmationMatches(candidate, confirmation) {
  if (typeof confirmation !== "string" || confirmation.trim() === "") return false;
  const trimmed = confirmation.trim();
  return trimmed === candidate.statement || trimmed === shownWording(candidate);
}

function resolveProfileSource(context) {
  if (typeof context.profileSource === "string") return context.profileSource;
  if (typeof context.profilePath === "string" && fs.existsSync(context.profilePath)) {
    return fs.readFileSync(context.profilePath, "utf8");
  }
  return null;
}

export function countActiveBullets(source) {
  const parsed = parseAdaptiveProfile(String(source ?? ""));
  const h2 = parsed.headings.filter((row) => row.level === 2);
  const activeIndex = h2.findIndex((row) => row.heading.toLowerCase() === "active");
  if (activeIndex < 0) return 0;
  const start = h2[activeIndex].start + 1;
  const end = activeIndex + 1 < h2.length ? h2[activeIndex + 1].start : parsed.lines.length;
  let count = 0;
  for (let i = start; i < end; i += 1) {
    if (ACTIVE_BULLET_RE.test(parsed.lines[i].trim())) count += 1;
  }
  return count;
}

export function applyActiveBullet(source, bulletLine) {
  const bullet = String(bulletLine).trim();
  const idMatch = /^- (P\d{3}) \[/.exec(bullet);
  const newId = idMatch ? idMatch[1] : null;
  let text = String(source ?? "").replace(/\r\n/g, "\n");
  if (!text.includes("schema:") || !/^##\s+Active\s*$/m.test(text)) {
    text = EMPTY_PROFILE;
  }
  const parsed = parseAdaptiveProfile(text);
  const h2 = parsed.headings.filter((row) => row.level === 2);
  const activeIndex = h2.findIndex((row) => row.heading.toLowerCase() === "active");
  const lines = parsed.lines.slice();
  if (activeIndex < 0) {
    const out = [...lines, "", "## Active", bullet];
    let result = out.join("\n");
    if (!result.endsWith("\n")) result += "\n";
    return result;
  }
  const start = h2[activeIndex].start + 1;
  const end = activeIndex + 1 < h2.length ? h2[activeIndex + 1].start : lines.length;
  const head = lines.slice(0, start);
  const section = lines.slice(start, end);
  const tail = lines.slice(end);
  const nextSection = [];
  let replaced = false;
  for (const line of section) {
    const match = ACTIVE_BULLET_RE.exec(line.trim());
    if (newId && match && match[1] === newId) {
      nextSection.push(bullet);
      replaced = true;
    } else {
      nextSection.push(line);
    }
  }
  if (!replaced) {
    while (nextSection.length > 0 && nextSection[nextSection.length - 1].trim() === "") {
      nextSection.pop();
    }
    nextSection.push(bullet);
  }
  const out = [...head, ...nextSection, ...tail];
  let result = out.join("\n");
  if (!result.endsWith("\n")) result += "\n";
  return result;
}

export function removeActiveBullet(source, profileId) {
  const text = String(source ?? "").replace(/\r\n/g, "\n");
  const parsed = parseAdaptiveProfile(text);
  const h2 = parsed.headings.filter((row) => row.level === 2);
  const activeIndex = h2.findIndex((row) => row.heading.toLowerCase() === "active");
  if (activeIndex < 0) return text.endsWith("\n") ? text : `${text}\n`;
  const start = h2[activeIndex].start + 1;
  const end = activeIndex + 1 < h2.length ? h2[activeIndex + 1].start : parsed.lines.length;
  const kept = [];
  for (let i = start; i < end; i += 1) {
    const match = ACTIVE_BULLET_RE.exec(parsed.lines[i].trim());
    if (match && match[1] === profileId) continue;
    kept.push(parsed.lines[i]);
  }
  const out = [...parsed.lines.slice(0, start), ...kept, ...parsed.lines.slice(end)];
  let result = out.join("\n");
  if (!result.endsWith("\n")) result += "\n";
  return result;
}

export function writeProfileAtomic(filePath, source) {
  const errors = validateAdaptiveProfile(source, path.basename(filePath));
  if (errors.length > 0) return { ok: false, errors };
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.tmp-${process.pid}`;
  try {
    fs.writeFileSync(tmp, source, "utf8");
    fs.renameSync(tmp, filePath);
  } catch (error) {
    try {
      fs.unlinkSync(tmp);
    } catch {
      // tmp may already be gone
    }
    return { ok: false, errors: [error.message] };
  }
  return { ok: true, errors: [] };
}

/**
 * @param {object} candidate
 * @param {object} [context]
 */
export function evaluatePromotion(candidate, context = {}) {
  const label = context.label ?? (isObject(candidate) ? candidate.policy_id : null) ?? "candidate";
  const schemaErrors = context.skipSchema ? [] : validatePolicyCandidateSchema(candidate, label);
  const reasons = [...schemaErrors];
  const origin = originOf(candidate);
  const evalStatus = resolveEvalStatus(candidate, context);
  const tasks = independentTaskIds(candidate, context.events ?? []);
  const support = Array.isArray(candidate?.supporting_events) ? candidate.supporting_events : [];
  const counters = Array.isArray(candidate?.counterexamples) ? candidate.counterexamples : [];
  const profileId = profileIdOf(candidate);
  const shown = shownWording(candidate);
  const confirmed =
    candidate?.expected_effect?.wording_confirmed === true ||
    confirmationMatches(candidate, context.confirmation);
  const hardHits = context.evalResult?.hard_failures;
  const hardFail = evalStatus === "fail" || (Array.isArray(hardHits) && hardHits.length > 0);
  const action = context.action ?? "inspect";

  let canActivate = schemaErrors.length === 0;
  const notes = [];

  if (origin === "core-proposal") {
    canActivate = false;
    notes.push("Core promotion is a proposal only");
  }

  if (counters.length > 0 && (candidate?.status === "active" || candidate?.status === "stable" || action === "activate")) {
    canActivate = false;
    notes.push("counterexample marks review-needed");
  }

  if (origin === "inferred") {
    if (support.length < 2) {
      canActivate = false;
      notes.push("single complaint cannot activate");
    } else if (tasks.size < 2) {
      canActivate = false;
      notes.push("inferred rule needs two independent tasks");
    }
    if (hardFail) {
      canActivate = false;
      notes.push("hard gate failure cannot activate");
    } else if (evalStatus === "NOT_EVALUATED") {
      canActivate = false;
      notes.push("shadow eval NOT_EVALUATED");
    } else if (evalStatus === "NOT_RUN") {
      canActivate = false;
      notes.push("shadow eval NOT_RUN");
    } else if (evalStatus !== "pass") {
      canActivate = false;
      notes.push("inferred rule needs shadow eval pass");
    }
  }

  if (!confirmed) {
    canActivate = false;
    notes.push("exact wording not confirmed");
  }

  if (!profileId) {
    canActivate = false;
    notes.push("profile_id must be P###");
  } else if (typeof candidate?.statement === "string" && SCOPE_SET.has(candidate.scope)) {
    const classified = classifyActiveBullet(profileId, candidate.scope, candidate.statement);
    if (classified) {
      canActivate = false;
      notes.push("statement is not a legal Active bullet");
    }
  }

  const profileSource = resolveProfileSource(context);
  if (profileSource != null && profileId) {
    const projected = applyActiveBullet(
      profileSource,
      renderActiveBullet(profileId, candidate.scope, candidate.statement)
    );
    const profileErrors = validateAdaptiveProfile(projected, "profile");
    if (profileErrors.some((error) => error.includes(`Active exceeds ${MAX_ACTIVE} bullets`))) {
      canActivate = false;
      notes.push("Active exceeds 8 bullets");
    } else if (profileErrors.length > 0 && !notes.includes("statement is not a legal Active bullet")) {
      canActivate = false;
      notes.push("statement is not a legal Active bullet");
    }
  }

  reasons.push(...notes);

  const status = candidate?.status;
  let statusAllowed = schemaErrors.length === 0;
  if (status === "active" || status === "stable") {
    statusAllowed = canActivate;
  } else if (status === "review-needed") {
    statusAllowed = schemaErrors.length === 0 && counters.length > 0;
    if (counters.length === 0) {
      reasons.push("review-needed requires a counterexample");
      statusAllowed = false;
    }
  }

  let nextStatus = status;
  if (action === "activate" && canActivate) nextStatus = "active";
  else if (action === "shadow" && schemaErrors.length === 0) nextStatus = "shadow";
  else if (action === "revert") nextStatus = "reverted";
  else if (action === "retire") nextStatus = "retired";
  else if (action === "review-needed") nextStatus = "review-needed";
  else if (counters.length > 0 && (status === "active" || status === "stable")) {
    nextStatus = "review-needed";
  } else if (origin === "inferred" && evalStatus !== "pass" && (status === "active" || status === "stable")) {
    nextStatus = "shadow";
  }

  const ok =
    schemaErrors.length === 0 &&
    (action === "activate" ? canActivate : action === "inspect" ? statusAllowed : true);

  return {
    ok,
    origin,
    eval_status: evalStatus,
    can_activate: canActivate,
    status_allowed: statusAllowed,
    next_status: nextStatus,
    reasons: unique(reasons),
    shown_wording: shown,
    rollback: typeof candidate?.rollback === "string" ? candidate.rollback : "",
    core_write: false,
    independent_tasks: [...tasks],
    profile_id: profileId
  };
}

export function validatePolicyCandidate(candidate, label = "candidate") {
  const errors = validatePolicyCandidateSchema(candidate, label);
  if (errors.length > 0) return errors;
  const verdict = evaluatePromotion(candidate, { label, skipSchema: true, action: "inspect" });
  if (!verdict.status_allowed) {
    for (const reason of verdict.reasons) {
      errors.push(reason.startsWith(label) ? reason : `${label}: ${reason}`);
    }
  }
  return unique(errors);
}

export function parsePolicyCandidateJsonl(source, label = "jsonl") {
  const errors = [];
  const rows = [];
  const lines = String(source).replace(/\r\n/g, "\n").split("\n");
  let index = 0;
  for (const raw of lines) {
    if (raw.trim() === "") continue;
    index += 1;
    try {
      rows.push({ value: JSON.parse(raw), index });
    } catch {
      errors.push(`${label}:${index}: line is not JSON`);
    }
  }
  return { rows, errors };
}

export function validatePolicyCandidateJsonl(source, label = "jsonl") {
  const { rows, errors } = parsePolicyCandidateJsonl(source, label);
  const seen = new Map();
  for (const row of rows) {
    const rowLabel = `${label}:${row.index}`;
    errors.push(...validatePolicyCandidate(row.value, rowLabel));
    const id = row.value?.policy_id;
    if (typeof id === "string") {
      if (seen.has(id)) errors.push(`${rowLabel}: duplicate policy_id ${id}`);
      seen.set(id, row.index);
    }
  }
  return errors;
}

export function validatePolicyCandidateFile(filePath) {
  const source = fs.readFileSync(filePath, "utf8");
  return validatePolicyCandidateJsonl(source, path.basename(filePath));
}

export function expectedInvalidName(filePath) {
  return path.basename(filePath).startsWith("invalid");
}

export function activateCandidate(candidate, context = {}) {
  const verdict = evaluatePromotion(candidate, { ...context, action: "activate" });
  if (!verdict.can_activate) {
    return { ok: false, written: false, candidate, verdict, previous: null };
  }
  const next = {
    ...candidate,
    status: "active",
    expected_effect: {
      ...(isObject(candidate.expected_effect) ? candidate.expected_effect : {}),
      origin: originOf(candidate),
      profile_id: verdict.profile_id,
      wording_confirmed: true
    }
  };
  if (typeof context.profilePath !== "string") {
    return { ok: true, written: false, candidate: next, verdict, previous: null };
  }
  const previous = fs.existsSync(context.profilePath)
    ? fs.readFileSync(context.profilePath, "utf8")
    : "";
  const bullet = renderActiveBullet(verdict.profile_id, candidate.scope, candidate.statement);
  const projected = applyActiveBullet(previous, bullet);
  const written = writeProfileAtomic(context.profilePath, projected);
  if (!written.ok) {
    return {
      ok: false,
      written: false,
      candidate,
      verdict: { ...verdict, reasons: [...verdict.reasons, ...written.errors] },
      previous
    };
  }
  return { ok: true, written: true, candidate: next, verdict, previous };
}

export function revertCandidate(candidate, context = {}) {
  const profileId = profileIdOf(candidate);
  const next = { ...candidate, status: "reverted" };
  if (typeof context.profilePath !== "string") {
    return { ok: true, written: false, candidate: next, previous: null, errors: [] };
  }
  const previous = fs.existsSync(context.profilePath)
    ? fs.readFileSync(context.profilePath, "utf8")
    : "";
  if (!profileId) {
    return { ok: true, written: false, candidate: next, previous, errors: [] };
  }
  const projected = removeActiveBullet(previous || EMPTY_PROFILE, profileId);
  const written = writeProfileAtomic(context.profilePath, projected);
  return {
    ok: written.ok,
    written: written.ok,
    candidate: next,
    previous,
    errors: written.errors
  };
}

export function markReviewNeeded(candidate, counterexample) {
  const counters = Array.isArray(candidate.counterexamples) ? [...candidate.counterexamples] : [];
  if (typeof counterexample === "string" && counterexample.trim() !== "") {
    if (!counters.includes(counterexample.trim())) counters.push(counterexample.trim());
  }
  return { ...candidate, status: "review-needed", counterexamples: counters };
}

export function proposeCorePromotion(candidate) {
  return {
    kind: "core-proposal",
    write: false,
    target: "do-it-core",
    policy_id: candidate?.policy_id ?? null,
    statement: candidate?.statement ?? "",
    evidence: candidate?.supporting_events ?? [],
    note: "Maintainer review and cross-scenario evidence required. Never auto-write Core."
  };
}

function main() {
  const args = process.argv.slice(2).filter((arg) => arg !== "--");
  if (args.length === 0) {
    console.error("usage: node scripts/validate-policy-candidates.mjs <file> [<file>...]");
    process.exitCode = 2;
    return;
  }
  let failed = 0;
  for (const arg of args) {
    const resolved = path.resolve(arg);
    const expectInvalid = expectedInvalidName(arg);
    if (!fs.existsSync(resolved)) {
      console.error(`${arg}: file not found`);
      failed += 1;
      continue;
    }
    const errors = validatePolicyCandidateFile(resolved);
    if (expectInvalid) {
      if (errors.length === 0) {
        failed += 1;
        console.error(`validate-policy-candidates: ${arg} expected invalid but passed`);
        continue;
      }
      console.log(
        `validate-policy-candidates: ${arg} ok (expected invalid, ${errors.length} issue(s))`
      );
      continue;
    }
    if (errors.length === 0) {
      console.log(`validate-policy-candidates: ${arg} ok`);
      continue;
    }
    failed += 1;
    console.error(`validate-policy-candidates: ${arg} (${errors.length} failure(s))`);
    for (const error of errors) console.error(`- ${error}`);
  }
  if (failed > 0) process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
