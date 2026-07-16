#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");

const checks = [
  {
    file: "skills/do-it/do-it-decide/SKILL.md",
    label: "single sequential decision question",
    pattern: /Ask \*\*one\*\* question at a time; wait for the answer\./,
  },
  {
    file: "skills/do-it/do-it-decide/SKILL.md",
    label: "confirmed decision plan",
    pattern: /Do not enact the plan until shared understanding is confirmed/,
  },
  {
    file: "skills/do-it/do-it-code-quality/SKILL.md",
    label: "scope chain before edit",
    pattern: /## Scope Chain \(before edit\)/,
  },
  {
    file: "skills/do-it/do-it-code-quality/SKILL.md",
    label: "both-side contract mapping",
    pattern: /Public\/API\/schema or cross-package work needs both-side mapping/,
  },
  {
    file: "skills/do-it/do-it-code-quality/SKILL.md",
    label: "schema api both sides",
    pattern: /Schema\/API changes need both sides\./,
  },
  {
    file: "skills/do-it/do-it-code-quality/SKILL.md",
    label: "explicit uncertainty stop",
    pattern: /NEEDS_CONTEXT`?\s*\/\s*`?BLOCKED/,
  },
  {
    file: "skills/do-it/do-it-router/SKILL.md",
    label: "central authorization boundary",
    pattern: /## Authorization Boundary/,
  },
  {
    file: "skills/do-it/do-it-router/SKILL.md",
    label: "external action confirmation",
    pattern: /external writes, destructive or irreversible actions, material cost, or material scope expansion/,
  },
  {
    file: "skills/do-it/do-it-router/SKILL.md",
    label: "shared write owner",
    pattern: /For shared writes, name\s+one owner\./,
  },
  {
    file: "skills/do-it/do-it-review/SKILL.md",
    label: "review cannot be clean with unresolved significant findings",
    pattern: /Not clean while Blocking\/Important remain\./,
  },
  {
    file: "skills/do-it/do-it-verify/SKILL.md",
    label: "fresh evidence or explicit not-verified status",
    pattern: /Run it fresh \(or `NOT_VERIFIED` with why\)\./,
  },
  {
    file: "skills/do-it/do-it-verify/SKILL.md",
    label: "honest blocked verification exit",
    pattern: /If blocked: `NOT_VERIFIED` \+ missing command/,
  },
];

const sourceCache = new Map();
const failures = [];

for (const check of checks) {
  const absolutePath = path.join(repoRoot, check.file);
  let source = sourceCache.get(absolutePath);
  if (source === undefined) {
    try {
      source = fs.readFileSync(absolutePath, "utf8");
    } catch (error) {
      failures.push(`${check.file}: cannot read source: ${error.message}`);
      continue;
    }
    sourceCache.set(absolutePath, source);
  }

  if (!check.pattern.test(source)) {
    failures.push(`${check.file}: missing ${check.label}`);
  }
}

if (failures.length > 0) {
  console.error(`validate-core-skill-boundaries: ${failures.length} failure(s)`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`validate-core-skill-boundaries: ${checks.length} boundaries OK`);
