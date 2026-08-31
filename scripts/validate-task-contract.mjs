#!/usr/bin/env node

// Structural checks for Task Contract v1. Does not judge whether a file
// should have been persisted. Schema: skills/do-it/references/task-contract.md

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

export const REQUIRED_HEADINGS = Object.freeze([
  "Goal",
  "Decisions",
  "Boundary",
  "Acceptance"
]);

export const OPTIONAL_HEADINGS = Object.freeze([
  "Change Map",
  "Units",
  "Open",
  "Rejected"
]);

const KNOWN_HEADINGS = new Set([...REQUIRED_HEADINGS, ...OPTIONAL_HEADINGS]);
const PROGRESS_CHECKBOX = /^\s*[-*+]\s+\[[ xX]\]/;
const ACCEPTANCE_ID = /^\s*[-*+]\s+(A\d+)\b/;
const PROVENANCE_TAG = /\[(user|evidence|choice|assumption)\]/;

/**
 * @param {string} source
 * @returns {{ heading: string, start: number, level: number }[]}
 */
export function parseContractHeadings(source) {
  const headings = [];
  const lines = String(source).replace(/\r\n/g, "\n").split("\n");
  for (let i = 0; i < lines.length; i++) {
    const match = /^(#{2,6})\s+(.+?)\s*$/.exec(lines[i]);
    if (!match) continue;
    headings.push({
      heading: match[2].trim(),
      start: i,
      level: match[1].length
    });
  }
  return headings;
}

/**
 * @param {string} source
 * @param {string} [label]
 * @returns {string[]}
 */
export function validateTaskContract(source, label = "contract") {
  const errors = [];
  const text = String(source).replace(/\r\n/g, "\n");
  const lines = text.split("\n");
  const headings = parseContractHeadings(text);
  const h2 = headings.filter((row) => row.level === 2);

  const seen = new Map();
  for (const row of h2) {
    seen.set(row.heading, (seen.get(row.heading) ?? 0) + 1);
  }

  for (const required of REQUIRED_HEADINGS) {
    const count = seen.get(required) ?? 0;
    if (count === 0) {
      errors.push(`${label}: missing required heading ## ${required}`);
    } else if (count > 1) {
      errors.push(`${label}: duplicate heading ## ${required}`);
    }
  }

  for (const row of h2) {
    if (!KNOWN_HEADINGS.has(row.heading)) {
      errors.push(`${label}: unknown heading ## ${row.heading}`);
    }
  }

  for (let i = 0; i < lines.length; i++) {
    if (PROGRESS_CHECKBOX.test(lines[i])) {
      errors.push(`${label}:${i + 1}: progress checkbox is not allowed`);
    }
  }

  const acceptance = sectionBody(lines, h2, "Acceptance");
  if (acceptance) {
    const ids = [];
    for (const line of acceptance.lines) {
      const match = ACCEPTANCE_ID.exec(line);
      if (match) ids.push(match[1]);
    }
    if (ids.length === 0) {
      errors.push(`${label}: Acceptance has no A-ID items`);
    }
    const counted = new Map();
    for (const id of ids) {
      counted.set(id, (counted.get(id) ?? 0) + 1);
    }
    for (const [id, count] of counted) {
      if (count > 1) {
        errors.push(`${label}: duplicate acceptance id ${id}`);
      }
    }
  }

  const goal = sectionBody(lines, h2, "Goal");
  if (goal && isEmptySection(goal.lines)) {
    errors.push(`${label}: Goal section is empty`);
  }

  const boundary = sectionBody(lines, h2, "Boundary");
  if (boundary && isEmptySection(boundary.lines)) {
    errors.push(`${label}: Boundary section is empty`);
  }

  const decisions = sectionBody(lines, h2, "Decisions");
  if (decisions && !isEmptySection(decisions.lines)) {
    const tagged = decisions.lines.some((line) => PROVENANCE_TAG.test(line));
    if (!tagged) {
      errors.push(`${label}: Decisions items need a provenance tag`);
    }
  }

  return errors;
}

/**
 * @param {string[]} lines
 * @param {{ heading: string, start: number }[]} h2
 * @param {string} heading
 */
function sectionBody(lines, h2, heading) {
  const index = h2.findIndex((row) => row.heading === heading);
  if (index < 0) return null;
  const start = h2[index].start + 1;
  const end = index + 1 < h2.length ? h2[index + 1].start : lines.length;
  return { lines: lines.slice(start, end) };
}

function isEmptySection(sectionLines) {
  return sectionLines.every((line) => {
    const trimmed = line.trim();
    return trimmed === "" || trimmed.startsWith("<!--");
  });
}

/**
 * @param {string} filePath
 * @returns {string[]}
 */
export function validateTaskContractFile(filePath) {
  const source = fs.readFileSync(filePath, "utf8");
  return validateTaskContract(source, path.basename(filePath));
}

function main() {
  const args = process.argv.slice(2).filter((arg) => arg !== "--");
  if (args.length === 0) {
    console.error("usage: node scripts/validate-task-contract.mjs <file> [<file>...]");
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
    const errors = validateTaskContractFile(resolved);
    if (errors.length === 0) {
      console.log(`validate-task-contract: ${arg} ok`);
      continue;
    }
    failed += 1;
    console.error(`validate-task-contract: ${arg} (${errors.length} failure(s))`);
    for (const error of errors) console.error(`- ${error}`);
  }
  if (failed > 0) process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
