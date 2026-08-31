#!/usr/bin/env node

// Advisory size/anchor budgets for main skills. Warnings only: oversize is a
// prompt to move rare detail into references, not to compress into jargon.

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { CORE_SKILLS } from "./skill-tiers.mjs";
import { collectAnchors } from "./validate-skill-contracts.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const defaultRepoRoot = path.resolve(scriptDir, "..");

export const ADVISORY_MAX_LINES = 140;
export const ADVISORY_MAX_BYTES = 8000;
export const ADVISORY_MAX_ANCHORS = 6;

function lineCount(source) {
  return String(source).replace(/\n$/, "").split("\n").length;
}

/**
 * @param {{ repoRoot?: string }} [options]
 * @returns {{ relativePath: string, lines: number, bytes: number, anchors: number, warnings: string[] }[]}
 */
export function collectSkillBudgetWarnings(options = {}) {
  const repoRoot = options.repoRoot ?? defaultRepoRoot;
  const rows = [];

  for (const name of CORE_SKILLS) {
    const relativePath = `skills/do-it/${name}/SKILL.md`;
    const fullPath = path.join(repoRoot, relativePath);
    const warnings = [];
    if (!fs.existsSync(fullPath)) {
      warnings.push(`${relativePath}: missing; skip budget`);
      rows.push({ relativePath, lines: 0, bytes: 0, anchors: 0, warnings });
      continue;
    }

    const source = fs.readFileSync(fullPath, "utf8");
    const lines = lineCount(source);
    const bytes = Buffer.byteLength(source, "utf8");
    const anchors = collectAnchors(source).size;

    if (lines > ADVISORY_MAX_LINES) {
      warnings.push(
        `${relativePath}: ${lines} lines exceeds advisory ${ADVISORY_MAX_LINES}; move rare detail to references, do not compress into jargon`
      );
    }
    if (bytes > ADVISORY_MAX_BYTES) {
      warnings.push(
        `${relativePath}: ${bytes} bytes exceeds advisory ${ADVISORY_MAX_BYTES}; split detail to references, do not compress into jargon`
      );
    }
    if (anchors > ADVISORY_MAX_ANCHORS) {
      warnings.push(
        `${relativePath}: ${anchors} contract anchors exceeds advisory ${ADVISORY_MAX_ANCHORS}; keep 3–6 cross-version contracts`
      );
    }

    rows.push({ relativePath, lines, bytes, anchors, warnings });
  }

  return rows;
}

/**
 * @param {{ repoRoot?: string }} [options]
 * @returns {number} always 0
 */
export function runValidateSkillBudgets(options = {}) {
  const rows = collectSkillBudgetWarnings(options);
  const warnings = rows.flatMap((row) => row.warnings);
  if (warnings.length > 0) {
    console.warn(`validate-skill-budgets: ${warnings.length} warning(s)`);
    for (const warning of warnings) console.warn(`- ${warning}`);
  } else {
    console.log(
      `validate-skill-budgets: ${rows.length} core skills within advisory budget ` +
        `(${ADVISORY_MAX_LINES} lines / ${ADVISORY_MAX_BYTES} bytes / ${ADVISORY_MAX_ANCHORS} anchors)`
    );
  }
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(runValidateSkillBudgets());
}
