#!/usr/bin/env node

// Structural checks for Evidence Event v1 JSONL.
// Schema: do-it/evidence-event/v1 (plan package schemas/evidence-event-v1.json).
//
// CLI: node scripts/validate-runtime-events.mjs <file> [<file>...]
// Basename starting with `invalid` must fail validation; every other file
// must pass. That lets `tests/fixtures/runtime-events/*.jsonl` mix both.

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

export const RUNTIME_EVENT_SCHEMA = 1;

export const EVENT_KINDS = Object.freeze([
  "edit",
  "command",
  "test",
  "build",
  "runtime-observation",
  "review",
  "completion-claim"
]);

export const EVENT_SOURCES = Object.freeze(["observed", "reported", "user", "eval"]);

export const WORKTREE_COVERAGES = Object.freeze(["complete", "partial", "unavailable"]);

const KIND_SET = new Set(EVENT_KINDS);
const SOURCE_SET = new Set(EVENT_SOURCES);
const COVERAGE_SET = new Set(WORKTREE_COVERAGES);
const ROOT_KEYS = new Set([
  "schema",
  "event_id",
  "task_id",
  "acceptance_hint",
  "recorded_at",
  "kind",
  "source",
  "host",
  "command",
  "exit_code",
  "summary",
  "worktree"
]);
const WORKTREE_KEYS = new Set(["head", "fingerprint", "coverage", "observed_epoch"]);
const DATE_TIME =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function nullableString(value) {
  return value === null || typeof value === "string";
}

function nullableInteger(value) {
  return value === null || (typeof value === "number" && Number.isInteger(value));
}

/**
 * @param {unknown} event
 * @param {string} [label]
 * @returns {string[]}
 */
export function validateRuntimeEvent(event, label = "event") {
  const errors = [];
  if (!isObject(event)) {
    errors.push(`${label}: not an object`);
    return errors;
  }
  for (const key of Object.keys(event)) {
    if (!ROOT_KEYS.has(key)) {
      errors.push(`${label}: unexpected property ${key}`);
    }
  }
  if (event.schema !== RUNTIME_EVENT_SCHEMA) {
    errors.push(`${label}: schema must be ${RUNTIME_EVENT_SCHEMA}`);
  }
  if (typeof event.event_id !== "string" || event.event_id.length < 1) {
    errors.push(`${label}: event_id must be a non-empty string`);
  }
  if (Object.hasOwn(event, "task_id") && !nullableString(event.task_id)) {
    errors.push(`${label}: task_id must be a string or null`);
  }
  if (Object.hasOwn(event, "acceptance_hint") && !nullableString(event.acceptance_hint)) {
    errors.push(`${label}: acceptance_hint must be a string or null`);
  }
  if (typeof event.recorded_at !== "string" || !DATE_TIME.test(event.recorded_at)) {
    errors.push(`${label}: recorded_at must be an ISO-8601 date-time`);
  }
  if (!KIND_SET.has(event.kind)) {
    errors.push(`${label}: kind is not a known evidence kind`);
  }
  if (!SOURCE_SET.has(event.source)) {
    errors.push(`${label}: source must be observed|reported|user|eval`);
  }
  if (typeof event.host !== "string") {
    errors.push(`${label}: host must be a string`);
  }
  if (Object.hasOwn(event, "command") && !nullableString(event.command)) {
    errors.push(`${label}: command must be a string or null`);
  }
  if (Object.hasOwn(event, "exit_code") && !nullableInteger(event.exit_code)) {
    errors.push(`${label}: exit_code must be an integer or null`);
  }
  if (Object.hasOwn(event, "summary")) {
    if (!nullableString(event.summary)) {
      errors.push(`${label}: summary must be a string or null`);
    } else if (typeof event.summary === "string" && event.summary.length > 1000) {
      errors.push(`${label}: summary exceeds 1000 characters`);
    }
  }
  if (!isObject(event.worktree)) {
    errors.push(`${label}: worktree must be an object`);
    return errors;
  }
  const worktree = event.worktree;
  for (const key of Object.keys(worktree)) {
    if (!WORKTREE_KEYS.has(key)) {
      errors.push(`${label}: unexpected worktree property ${key}`);
    }
  }
  if (!Object.hasOwn(worktree, "head") || !nullableString(worktree.head)) {
    errors.push(`${label}: worktree.head must be a string or null`);
  }
  if (!Object.hasOwn(worktree, "fingerprint") || !nullableString(worktree.fingerprint)) {
    errors.push(`${label}: worktree.fingerprint must be a string or null`);
  }
  if (!COVERAGE_SET.has(worktree.coverage)) {
    errors.push(`${label}: worktree.coverage must be complete|partial|unavailable`);
  }
  if (Object.hasOwn(worktree, "observed_epoch") && !nullableInteger(worktree.observed_epoch)) {
    errors.push(`${label}: worktree.observed_epoch must be an integer or null`);
  }
  return errors;
}

/**
 * @param {string} source
 * @param {string} [label]
 * @returns {string[]}
 */
export function validateRuntimeEventJsonl(source, label = "jsonl") {
  const errors = [];
  const text = String(source).replace(/\r\n/g, "\n");
  const lines = text.split("\n");
  let index = 0;
  for (const raw of lines) {
    if (raw.trim() === "") continue;
    index += 1;
    let event;
    try {
      event = JSON.parse(raw);
    } catch {
      errors.push(`${label}:${index}: line is not JSON`);
      continue;
    }
    errors.push(...validateRuntimeEvent(event, `${label}:${index}`));
  }
  return errors;
}

/**
 * @param {string} filePath
 * @returns {string[]}
 */
export function validateRuntimeEventFile(filePath) {
  const source = fs.readFileSync(filePath, "utf8");
  return validateRuntimeEventJsonl(source, path.basename(filePath));
}

export function expectedInvalidName(filePath) {
  return path.basename(filePath).startsWith("invalid");
}

function main() {
  const args = process.argv.slice(2).filter((arg) => arg !== "--");
  if (args.length === 0) {
    console.error("usage: node scripts/validate-runtime-events.mjs <file> [<file>...]");
    process.exitCode = 2;
    return;
  }
  let failed = 0;
  for (const arg of args) {
    const resolved = path.resolve(arg);
    const label = path.basename(arg);
    const expectInvalid = expectedInvalidName(arg);
    if (!fs.existsSync(resolved)) {
      console.error(`${arg}: file not found`);
      failed += 1;
      continue;
    }
    const errors = validateRuntimeEventFile(resolved);
    if (expectInvalid) {
      if (errors.length === 0) {
        failed += 1;
        console.error(`validate-runtime-events: ${arg} expected invalid but passed`);
        continue;
      }
      console.log(`validate-runtime-events: ${arg} ok (expected invalid, ${errors.length} issue(s))`);
      continue;
    }
    if (errors.length === 0) {
      console.log(`validate-runtime-events: ${arg} ok`);
      continue;
    }
    failed += 1;
    console.error(`validate-runtime-events: ${arg} (${errors.length} failure(s))`);
    for (const error of errors) console.error(`- ${error}`);
  }
  if (failed > 0) process.exitCode = 1;
  else console.log(`validate-runtime-events: ${args.length} file(s)`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
