#!/usr/bin/env node

// Closed-set drift contract for the single-voice core protocol:
//
//   hooks/data/execution-failure-modes.tsv   (machine source — the voice)
//   skills/do-it/do-it-core/SKILL.md         (protocol of record, renders the TSV)
//   hooks/router.sh + verification-gate.sh   (quote the TSV; no other rule text)
//   plugins/do-it-pi + plugins/do-it-opencode (bridge constants quote r-verify)
//   satellite skills                         (cite `core §<rule_id>`, never restate)
//
// Editing one side without the others is a build failure, same family as
// validate-quality-families. A rule is retired by editing all five surfaces.

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import {
  HOOK_SCRIPTS,
  RUN_HOOK_CMD,
  SESSION_START_SCRIPT
} from "./lib/hook-manifest.mjs";

const defaultRepoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export const REQUIRED_RULE_IDS = Object.freeze([
  "r-route",
  "r-evidence",
  "r-scope",
  "r-verify",
  "r-uncertainty",
  "r-boundary",
  "r-report",
  "r-recovery"
]);
const REQUIRED_RULE_ID_SET = new Set(REQUIRED_RULE_IDS);
const ALLOWED_SURFACES = new Set(["UserPromptSubmit", "Stop", "none"]);

function normalize(text) {
  return String(text).replace(/\s+/g, " ").trim();
}

function decodeAnsiCStrings(text) {
  return String(text).replace(/\$'((?:\\.|[^'\\])*)'/gs, (_match, body) =>
    body.replace(/\\(x[0-9a-fA-F]{1,2}|u[0-9a-fA-F]{4}|U[0-9a-fA-F]{8}|[0-7]{1,3}|c.|[abefnrtv\\'\"])/g, (escape, code) => {
      const simple = {
        a: "\u0007",
        b: "\b",
        e: "\u001b",
        f: "\f",
        n: "\n",
        r: "\r",
        t: "\t",
        v: "\u000b",
        "\\": "\\",
        "'": "'",
        '"': '"'
      };
      if (Object.hasOwn(simple, code)) return simple[code];
      if (code.startsWith("c")) {
        return String.fromCharCode(code.charCodeAt(1) & 31);
      }
      const radix = code.startsWith("x") ? 16 : code.startsWith("u") || code.startsWith("U") ? 16 : 8;
      const digits = code.replace(/^[xuU]/, "");
      const value = Number.parseInt(digits, radix);
      return Number.isSafeInteger(value) && value <= 0x10ffff
        ? String.fromCodePoint(value)
        : escape;
    })
  );
}

function shellComparable(text) {
  return normalize(decodeAnsiCStrings(text).replace(/\\\r?\n/g, "").replace(/[$'\"`\\]/g, ""));
}

export function validateCoreRuleBullets(registryRows, markdown, validationErrors = []) {
  const registryById = new Map(registryRows.map((row) => [row.id, row]));
  const bullets = [...markdown.matchAll(/^- \*\*(r-[a-z-]+)\*\* — (.+)$/gm)].map(
    (match) => ({ id: match[1], ruleText: match[2] })
  );

  if (bullets.length !== registryRows.length) {
    validationErrors.push(
      `do-it-core/SKILL.md: expected exactly ${registryRows.length} rule bullets, found ${bullets.length}`
    );
  }

  const bulletCounts = new Map();
  for (const bullet of bullets) {
    bulletCounts.set(bullet.id, (bulletCounts.get(bullet.id) ?? 0) + 1);
    const rule = registryById.get(bullet.id);
    if (!rule) {
      validationErrors.push(`do-it-core/SKILL.md: unknown rule bullet **${bullet.id}**`);
    } else if (bullet.ruleText !== rule.ruleText) {
      validationErrors.push(
        `do-it-core/SKILL.md: **${bullet.id}** bullet text drifted from the TSV`
      );
    }
  }

  for (const row of registryRows) {
    const count = bulletCounts.get(row.id) ?? 0;
    if (count === 0) {
      validationErrors.push(`do-it-core/SKILL.md: missing **${row.id}** bullet`);
    } else if (count > 1) {
      validationErrors.push(
        `do-it-core/SKILL.md: duplicate rule bullet **${row.id}** (found ${count})`
      );
    }
  }
  return validationErrors;
}

export function parseCoreRegistry(source, validationErrors = []) {
  const rows = [];
  for (const originalLine of source.split("\n")) {
    const line = originalLine.replace(/\r$/, "");
    if (/^[\t ]*$/.test(line) || line.startsWith("#")) continue;
    const cols = line.split("\t");
    if (cols.length !== 4) {
      validationErrors.push(
        `execution-failure-modes.tsv: row has ${cols.length} columns, expected 4: ${line.slice(0, 60)}`
      );
      continue;
    }
    rows.push({
      id: cols[0],
      ruleText: cols[1],
      failureModes: cols[2],
      surface: cols[3]
    });
  }
  return rows;
}

export function validateCoreRegistry(rows, validationErrors = []) {
  const ids = rows.map((row) => row.id);
  if (ids.length !== REQUIRED_RULE_IDS.length) {
    validationErrors.push(
      `execution-failure-modes.tsv: expected exactly ${REQUIRED_RULE_IDS.length} rules, found ${ids.length}`
    );
  }
  const seen = new Set();
  for (const id of ids) {
    if (seen.has(id)) {
      validationErrors.push(`execution-failure-modes.tsv: duplicate rule_id ${id}`);
    }
    seen.add(id);
    if (!REQUIRED_RULE_ID_SET.has(id)) {
      validationErrors.push(`execution-failure-modes.tsv: unexpected rule_id ${id}`);
    }
  }
  for (const id of REQUIRED_RULE_IDS) {
    if (!seen.has(id)) {
      validationErrors.push(`execution-failure-modes.tsv: missing required rule_id ${id}`);
    }
  }
  for (const row of rows) {
    if (!row.ruleText) {
      validationErrors.push(`execution-failure-modes.tsv: ${row.id} has empty rule_text`);
    }
    const failureModes = String(row.failureModes ?? "").split(",");
    if (
      failureModes.length === 0 ||
      failureModes.some((mode) => !/^[a-z][a-z0-9-]*$/.test(mode)) ||
      new Set(failureModes).size !== failureModes.length
    ) {
      validationErrors.push(
        `execution-failure-modes.tsv: ${row.id} has invalid failure_modes "${row.failureModes ?? ""}"`
      );
    }
    const surfaces = String(row.surface ?? "").split(",");
    if (
      surfaces.length === 0 ||
      surfaces.some((surface) => !ALLOWED_SURFACES.has(surface)) ||
      new Set(surfaces).size !== surfaces.length ||
      (surfaces.includes("none") && surfaces.length > 1)
    ) {
      validationErrors.push(
        `execution-failure-modes.tsv: ${row.id} has invalid injection_surface "${row.surface ?? ""}"`
      );
    }
  }
  return validationErrors;
}

function hookEmbedsRule(source, ruleText) {
  return shellComparable(source).includes(shellComparable(ruleText));
}

function piVerifyReminder(source) {
  const match = source.match(/const VERIFY_REMINDER\s*=\s*(["'`])([\s\S]*?)\1\s*;/);
  return match?.[2];
}

export function validateCoreConsistency(repoRoot = defaultRepoRoot) {
  const errors = [];
  const fail = (message) => errors.push(message);
  const resolve = (...parts) => path.join(repoRoot, ...parts);
  const read = (filePath) => fs.readFileSync(filePath, "utf8").replace(/\r\n/g, "\n");
  const readBytes = (filePath) => fs.readFileSync(filePath);
  const sameBytes = (leftPath, rightPath) => readBytes(leftPath).equals(readBytes(rightPath));

  const registryPath = resolve("hooks", "data", "execution-failure-modes.tsv");
  const coreSkillPath = resolve("skills", "do-it", "do-it-core", "SKILL.md");
  const routerPath = resolve("hooks", "router.sh");
  const gatePath = resolve("hooks", "verification-gate.sh");
  const piBridgePath = resolve("plugins", "do-it-pi", "extensions", "index.ts");
  const generatedBundles = [
    "plugins/do-it",
    "plugins/do-it-cursor",
    "plugins/do-it-opencode",
    "plugins/do-it-pi"
  ];
  const generatedHookFiles = new Map([
    ["plugins/do-it", [...HOOK_SCRIPTS, SESSION_START_SCRIPT]],
    ["plugins/do-it-cursor", [...HOOK_SCRIPTS, SESSION_START_SCRIPT, RUN_HOOK_CMD]],
    ["plugins/do-it-opencode", [...HOOK_SCRIPTS]],
    ["plugins/do-it-pi", [...HOOK_SCRIPTS]]
  ]);
  const canonicalCoreSkillRelative = "skills/do-it/do-it-core/SKILL.md";
  const generatedCoreSkillRelative = "skills/do-it-core/SKILL.md";
  const canonicalHookLibDir = resolve("hooks", "lib");
  const generatedDataPaths = generatedBundles.map(
    (bundle) => `${bundle}/hooks/data/execution-failure-modes.tsv`
  );
  const skillsDir = resolve("skills", "do-it");

  const registrySource = read(registryPath);
  const rows = parseCoreRegistry(registrySource, errors);
  validateCoreRegistry(rows, errors);
  const rulesById = new Map(rows.map((row) => [row.id, row]));

  const coreSkill = read(coreSkillPath);
  validateCoreRuleBullets(rows, coreSkill, errors);
  for (const match of coreSkill.matchAll(/\*\*r-[a-z-]+\*\*/g)) {
    if (!rulesById.has(match[0].slice(2, -2))) {
      fail(`do-it-core/SKILL.md: reference to unknown rule ${match[0]}`);
    }
  }

  for (const [label, hookPath] of [
    ["hooks/router.sh", routerPath],
    ["hooks/verification-gate.sh", gatePath]
  ]) {
    const hookSource = read(hookPath);
    for (const row of rows) {
      if (hookEmbedsRule(hookSource, row.ruleText)) {
        fail(
          `${label}: source embeds the ${row.id} rule sentence; quote it via do_it_core_rule instead`
        );
      }
    }
  }

  const rVerify = rulesById.get("r-verify");
  if (rVerify) {
    const expectedReminder =
      `<system-reminder>do-it: previous turn used completion language. ${rVerify.ruleText}</system-reminder>`;
    if (piVerifyReminder(read(piBridgePath)) !== expectedReminder) {
      fail("plugins/do-it-pi/extensions/index.ts: VERIFY_REMINDER drifted from canonical r-verify");
    }
  }
  for (const relativePath of generatedDataPaths) {
    if (!sameBytes(registryPath, resolve(relativePath))) {
      fail(`${relativePath}: generated registry copy drifted from source`);
    }
  }

  const canonicalCoreSkill = read(resolve(canonicalCoreSkillRelative));
  const hookLibFiles = fs
    .readdirSync(canonicalHookLibDir, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name);
  for (const bundle of generatedBundles) {
    for (const fileName of generatedHookFiles.get(bundle) ?? []) {
      const sourcePath = resolve("hooks", fileName);
      const generatedPath = `${bundle}/hooks/${fileName}`;
      if (!sameBytes(sourcePath, resolve(generatedPath))) {
        fail(`${generatedPath}: generated hook drifted from hooks/${fileName}`);
      }
    }
    for (const fileName of hookLibFiles) {
      const sourcePath = resolve("hooks", "lib", fileName);
      const generatedPath = `${bundle}/hooks/lib/${fileName}`;
      if (!sameBytes(sourcePath, resolve(generatedPath))) {
        fail(`${generatedPath}: generated hook library drifted from hooks/lib/${fileName}`);
      }
    }
    const generatedSkillPath = `${bundle}/${generatedCoreSkillRelative}`;
    if (!sameBytes(resolve(canonicalCoreSkillRelative), resolve(generatedSkillPath))) {
      fail(`${generatedSkillPath}: generated core skill drifted from canonical source`);
    }
  }

  for (const entry of fs.readdirSync(skillsDir, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name === "do-it-core") continue;
    const skillPath = path.join(skillsDir, entry.name, "SKILL.md");
    if (!fs.existsSync(skillPath)) continue;
    const skillNorm = normalize(read(skillPath));
    for (const row of rows) {
      if (skillNorm.includes(normalize(row.ruleText))) {
        fail(`${entry.name}/SKILL.md restates the ${row.id} rule sentence; cite core §${row.id} instead`);
      }
    }
  }

  return { errors, rows };
}

function main() {
  const rootIndex = process.argv.indexOf("--root");
  const repoRoot = rootIndex >= 0 ? path.resolve(process.argv[rootIndex + 1] ?? "") : defaultRepoRoot;
  const { errors, rows } = validateCoreConsistency(repoRoot);
  if (errors.length > 0) {
    console.error(`validate-core-consistency: ${errors.length} failure(s)`);
    for (const error of errors) console.error(`- ${error}`);
    process.exitCode = 1;
    return;
  }
  console.log(
    `validate-core-consistency: ${rows.length} rules single-voiced across registry, core skill, hooks, bridges, satellites`
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
