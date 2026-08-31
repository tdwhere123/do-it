#!/usr/bin/env node

// Structural checks for Adaptive Profile v1. Mechanical only: budget, IDs,
// scope, banned tokens, explicit Core-weaken. Schema:
// skills/do-it/references/adaptive-policy.md

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

export const SCHEMA_ID = "do-it/adaptive-profile/v1";
export const MAX_ACTIVE = 8;
export const MAX_STATEMENT_CHARS = 120;
export const SUPPORTED_SCOPES = Object.freeze([
  "all",
  "decide",
  "build",
  "architecture",
  "review",
  "verify",
  "report",
  "delegation"
]);

const SCOPE_SET = new Set(SUPPORTED_SCOPES);
const BULLET_RE = /^- P(\d+) \[([^\]]+)\](?:\s+(.*))?$/;
const ID_RE = /^P\d{3}$/;
const CORE_ID_RE =
  /\br-(?:route|evidence|scope|verify|uncertainty|boundary|report|recovery)\b/;
const WEAKEN_RE =
  /(?:\b(?:weaken|override|bypass|disable|relax|ignore|skip)\b.{0,48}\b(?:core|no-write|verif(?:y|ication)?|not[_-]?verified|boundary|authoriz)|(?:\b(?:core|no-write|verif(?:y|ication)?|not[_-]?verified|boundary)\b.{0,48}\b(?:weaken|override|bypass|disable|relax|ignore|skip)\b)|\bdo not verify\b|\bdon't verify\b|\bwithout evidence\b|\bfake evidence\b|\binvent evidence\b)/i;
const PATH_RE =
  /(?:^|[\s`])(?:~\/|\/|\.{1,2}\/|[A-Za-z]:\\|\\)|\.do-it\b|\b[\w.-]+\.(?:ts|tsx|js|mjs|cjs|sh|bash|md|json|jsonl|py|go|rs|toml|ya?ml|txt)\b/i;
const SECRET_RE =
  /\b(?:password|passwd|api[_-]?key|secret|credential|private[_-]?key|bearer|authorization)\b/i;
const EVENT_RE = /[{}`]|\.jsonl\b|\bevent_id\b|\btask_id\b|\b(?:A|D)\d+\b/;
const SECOND_SENTENCE_RE = /\.\s+\S/;

/**
 * @param {string} source
 * @returns {{ schema: string | null, headings: { heading: string, start: number }[], lines: string[] }}
 */
export function parseAdaptiveProfile(source) {
  const text = String(source).replace(/\r\n/g, "\n");
  const lines = text.split("\n");
  let schema = null;
  let i = 0;
  if (lines[0] === "---") {
    i = 1;
    while (i < lines.length && lines[i] !== "---") {
      const match = /^schema:\s*(\S+)\s*$/.exec(lines[i]);
      if (match) schema = match[1];
      i += 1;
    }
    if (i < lines.length && lines[i] === "---") i += 1;
  }
  const headings = [];
  for (let index = 0; index < lines.length; index += 1) {
    const match = /^(#{2,6})\s+(.+?)\s*$/.exec(lines[index]);
    if (!match) continue;
    headings.push({
      heading: match[2].trim(),
      start: index,
      level: match[1].length
    });
  }
  return { schema, headings, lines, bodyStart: i };
}

/**
 * @param {string} id
 * @param {string} scope
 * @param {string} statement
 * @returns {string | null} reason code, or null when the bullet is legal
 */
export function classifyActiveBullet(id, scope, statement) {
  if (!ID_RE.test(id)) return "bad-id";
  if (!SCOPE_SET.has(scope)) return "illegal-scope";
  const stmt = String(statement ?? "").trim();
  if (stmt.length === 0) return "empty";
  if (stmt.length > MAX_STATEMENT_CHARS) return "overlong";
  if (CORE_ID_RE.test(stmt) || WEAKEN_RE.test(stmt)) return "core-weaken";
  if (PATH_RE.test(stmt) || SECRET_RE.test(stmt) || EVENT_RE.test(stmt)) {
    return "banned-content";
  }
  if (SECOND_SENTENCE_RE.test(stmt)) return "banned-content";
  return null;
}

/**
 * @param {string} source
 * @param {string} [label]
 * @returns {string[]}
 */
export function validateAdaptiveProfile(source, label = "profile") {
  const errors = [];
  const parsed = parseAdaptiveProfile(source);
  if (parsed.schema !== SCHEMA_ID) {
    errors.push(`${label}: schema must be ${SCHEMA_ID}`);
  }

  const h2 = parsed.headings.filter((row) => row.level === 2);
  const seenHeadings = new Map();
  for (const row of h2) {
    seenHeadings.set(row.heading, (seenHeadings.get(row.heading) ?? 0) + 1);
    if (row.heading.toLowerCase() !== "active") {
      errors.push(`${label}: unknown heading ## ${row.heading}`);
    }
  }
  for (const [heading, count] of seenHeadings) {
    if (count > 1) errors.push(`${label}: duplicate heading ## ${heading}`);
  }

  const activeIndex = h2.findIndex((row) => row.heading.toLowerCase() === "active");
  if (activeIndex < 0) {
    if (parsed.schema === SCHEMA_ID) {
      return errors;
    }
    errors.push(`${label}: missing required heading ## Active`);
    return errors;
  }

  const start = h2[activeIndex].start + 1;
  const end = activeIndex + 1 < h2.length ? h2[activeIndex + 1].start : parsed.lines.length;
  const ids = [];
  let bullets = 0;
  for (let lineNo = start; lineNo < end; lineNo += 1) {
    const raw = parsed.lines[lineNo];
    const trimmed = raw.trim();
    if (trimmed === "" || trimmed.startsWith("<!--")) continue;
    const bullet = BULLET_RE.exec(trimmed);
    if (!bullet) {
      errors.push(`${label}:${lineNo + 1}: Active line is not a P### bullet`);
      continue;
    }
    bullets += 1;
    const id = `P${bullet[1]}`;
    const scope = bullet[2].trim();
    const statement = (bullet[3] ?? "").trim();
    ids.push(id);
    const reason = classifyActiveBullet(id, scope, statement);
    if (reason === "bad-id") {
      errors.push(`${label}:${lineNo + 1}: id ${id} is not a unique P###`);
    } else if (reason === "illegal-scope") {
      errors.push(`${label}:${lineNo + 1}: illegal scope [${scope}]`);
    } else if (reason === "empty") {
      errors.push(`${label}:${lineNo + 1}: empty statement`);
    } else if (reason === "overlong") {
      errors.push(`${label}:${lineNo + 1}: statement exceeds ${MAX_STATEMENT_CHARS} characters`);
    } else if (reason === "core-weaken") {
      errors.push(`${label}:${lineNo + 1}: Core restatement or honesty/boundary weaken`);
    } else if (reason === "banned-content") {
      errors.push(`${label}:${lineNo + 1}: banned path, secret, event, or rationale`);
    }
  }

  if (bullets > MAX_ACTIVE) {
    errors.push(`${label}: Active exceeds ${MAX_ACTIVE} bullets`);
  }

  const counted = new Map();
  for (const id of ids) counted.set(id, (counted.get(id) ?? 0) + 1);
  for (const [id, count] of counted) {
    if (count > 1) errors.push(`${label}: duplicate id ${id}`);
  }

  return errors;
}

/**
 * @param {string} filePath
 * @returns {string[]}
 */
export function validateAdaptiveProfileFile(filePath) {
  const source = fs.readFileSync(filePath, "utf8");
  return validateAdaptiveProfile(source, path.basename(filePath));
}

function main() {
  const args = process.argv.slice(2).filter((arg) => arg !== "--");
  if (args.length === 0) {
    console.error("usage: node scripts/validate-adaptive-profile.mjs <file> [<file>...]");
    process.exitCode = 2;
    return;
  }
  let failed = 0;
  for (const arg of args) {
    const resolved = path.resolve(arg);
    if (!fs.existsSync(resolved)) {
      console.error(`${arg}: file not found`);
      failed += 1;
      continue;
    }
    const errors = validateAdaptiveProfileFile(resolved);
    if (errors.length === 0) {
      console.log(`validate-adaptive-profile: ${arg} ok`);
      continue;
    }
    failed += 1;
    console.error(`validate-adaptive-profile: ${arg} (${errors.length} failure(s))`);
    for (const error of errors) console.error(`- ${error}`);
  }
  if (failed > 0) process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
