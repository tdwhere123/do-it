#!/usr/bin/env node

// Scenario contract validator. Parses the YAML subset used by seed
// scenarios (maps, scalar lists, `|` blocks, `[a, b]` flows). No
// dependency: package.json is outside this card's write boundary.

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

export const SEED_SCENARIO_IDS = Object.freeze([
  "D01",
  "D02",
  "B01",
  "B02",
  "R03",
  "R04",
  "R06",
  "C01",
  "C04"
]);

export const CONDITIONS = Object.freeze(["vanilla", "legacy", "kernel"]);

export const FAMILIES = Object.freeze([
  "decision",
  "build",
  "review-verify",
  "recovery",
  "cost"
]);

export const HARD_GATE_IDS = Object.freeze([
  "unauthorized_external_action",
  "unauthorized_write",
  "boundary_out",
  "preserve_break",
  "public_contract_break",
  "false_verified",
  "stale_evidence",
  "irrelevant_evidence",
  "missing_not_verified",
  "ceremony_artifact",
  "subagent_dispatched",
  "contract_not_recovered",
  "authority_downstream_only",
  "guessed_professional_fact",
  "speculative_seam",
  "settled_reopened",
  "source_generated_drift"
]);

const ACCEPTANCE_ID = /^A\d+$/;
const SCENARIO_ID = /^[A-Z]\d{2}$/;

export function behaviorRootFrom(moduleUrl = import.meta.url) {
  return path.dirname(fileURLToPath(moduleUrl));
}

export function isMain(moduleUrl, argv = process.argv) {
  const self = path.resolve(fileURLToPath(moduleUrl));
  const invoked = argv[1] && path.resolve(argv[1]);
  return Boolean(invoked && self === invoked);
}

function labelOf(fileLabel, line = null) {
  return line == null ? fileLabel : `${fileLabel}:${line}`;
}

function indentOf(line, fileLabel, lineNo) {
  if (line.includes("\t")) {
    throw new Error(`${labelOf(fileLabel, lineNo)}: tabs are not allowed`);
  }
  const match = line.match(/^( *)/);
  return match ? match[1].length : 0;
}

function isBlankOrComment(line) {
  const trimmed = line.trim();
  return trimmed === "" || trimmed.startsWith("#");
}

function parseQuoted(raw, fileLabel, lineNo) {
  const quote = raw[0];
  let i = 1;
  let out = "";
  while (i < raw.length) {
    const ch = raw[i];
    if (ch === "\\" && quote === "\"" && i + 1 < raw.length) {
      const next = raw[i + 1];
      const escapes = { n: "\n", r: "\r", t: "\t", "\\": "\\", "\"": "\"", "'": "'" };
      out += Object.hasOwn(escapes, next) ? escapes[next] : next;
      i += 2;
      continue;
    }
    if (ch === quote) {
      const rest = raw.slice(i + 1).trim();
      if (rest && !rest.startsWith("#")) {
        throw new Error(`${labelOf(fileLabel, lineNo)}: trailing junk after quoted string`);
      }
      return out;
    }
    out += ch;
    i += 1;
  }
  throw new Error(`${labelOf(fileLabel, lineNo)}: unterminated string`);
}

function parseFlowSeq(raw, fileLabel, lineNo) {
  if (!raw.startsWith("[") || !raw.endsWith("]")) {
    throw new Error(`${labelOf(fileLabel, lineNo)}: invalid flow sequence`);
  }
  const inner = raw.slice(1, -1).trim();
  if (!inner) return [];
  return inner.split(",").map((part) => parseScalar(part.trim(), fileLabel, lineNo));
}

function parseScalar(raw, fileLabel, lineNo) {
  if (raw === "" || raw === "null" || raw === "~") return null;
  if (raw === "true") return true;
  if (raw === "false") return false;
  if (raw.startsWith("\"") || raw.startsWith("'")) {
    return parseQuoted(raw, fileLabel, lineNo);
  }
  if (raw.startsWith("[")) {
    return parseFlowSeq(raw, fileLabel, lineNo);
  }
  if (/^-?\d+$/.test(raw)) return Number(raw);
  if (/^-?\d+\.\d+$/.test(raw)) return Number(raw);
  return raw;
}

function stripInlineComment(line) {
  let inSingle = false;
  let inDouble = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === "'" && !inDouble) inSingle = !inSingle;
    else if (ch === "\"" && !inSingle) inDouble = !inDouble;
    else if (ch === "#" && !inSingle && !inDouble) {
      if (i === 0 || line[i - 1] === " ") return line.slice(0, i).trimEnd();
    }
  }
  return line;
}

function readBlockScalar(lines, start, parentIndent, fileLabel) {
  const chunks = [];
  let i = start;
  let sawContent = false;
  let contentIndent = null;
  while (i < lines.length) {
    const line = lines[i];
    if (isBlankOrComment(line) && !line.trim()) {
      if (sawContent) chunks.push("");
      i += 1;
      continue;
    }
    const indent = indentOf(line, fileLabel, i + 1);
    if (indent <= parentIndent) break;
    if (contentIndent == null) contentIndent = indent;
    if (indent < contentIndent) break;
    chunks.push(line.slice(contentIndent));
    sawContent = true;
    i += 1;
  }
  return { value: chunks.join("\n").replace(/\n+$/, "") + (chunks.length ? "\n" : ""), next: i };
}

function splitKeyValue(trimmed, fileLabel, lineNo) {
  if (trimmed.startsWith("- ")) {
    return { kind: "item", raw: trimmed.slice(2).trim() };
  }
  if (trimmed === "-") {
    return { kind: "item", raw: "" };
  }
  const colon = trimmed.indexOf(":");
  if (colon < 1) {
    throw new Error(`${labelOf(fileLabel, lineNo)}: expected key: value`);
  }
  const key = trimmed.slice(0, colon).trim();
  const raw = trimmed.slice(colon + 1).trim();
  if (!key) throw new Error(`${labelOf(fileLabel, lineNo)}: empty key`);
  return { kind: "key", key, raw };
}

function parseNode(lines, start, parentIndent, fileLabel) {
  let i = start;
  while (i < lines.length && isBlankOrComment(lines[i])) i += 1;
  if (i >= lines.length) return { value: null, next: i };

  const firstIndent = indentOf(lines[i], fileLabel, i + 1);
  if (firstIndent < parentIndent) return { value: null, next: i };

  const first = stripInlineComment(lines[i]).trim();
  if (first.startsWith("-")) {
    return parseSequence(lines, i, firstIndent, fileLabel);
  }
  return parseMapping(lines, i, firstIndent, fileLabel);
}

function parseSequence(lines, start, seqIndent, fileLabel) {
  const items = [];
  let i = start;
  while (i < lines.length) {
    if (isBlankOrComment(lines[i])) {
      i += 1;
      continue;
    }
    const indent = indentOf(lines[i], fileLabel, i + 1);
    if (indent < seqIndent) break;
    if (indent > seqIndent) {
      throw new Error(`${labelOf(fileLabel, i + 1)}: unexpected indent in sequence`);
    }
    const trimmed = stripInlineComment(lines[i]).trim();
    const split = splitKeyValue(trimmed, fileLabel, i + 1);
    if (split.kind !== "item") {
      throw new Error(`${labelOf(fileLabel, i + 1)}: expected sequence item`);
    }
    i += 1;
    if (split.raw === "" || split.raw === "|" || split.raw === ">") {
      if (split.raw === "|") {
        const block = readBlockScalar(lines, i, seqIndent, fileLabel);
        items.push(block.value);
        i = block.next;
      } else {
        const nested = parseNode(lines, i, seqIndent + 1, fileLabel);
        items.push(nested.value);
        i = nested.next;
      }
    } else {
      items.push(parseScalar(split.raw, fileLabel, i));
    }
  }
  return { value: items, next: i };
}

function parseMapping(lines, start, mapIndent, fileLabel) {
  const obj = {};
  let i = start;
  while (i < lines.length) {
    if (isBlankOrComment(lines[i])) {
      i += 1;
      continue;
    }
    const indent = indentOf(lines[i], fileLabel, i + 1);
    if (indent < mapIndent) break;
    if (indent > mapIndent) {
      throw new Error(`${labelOf(fileLabel, i + 1)}: unexpected indent in mapping`);
    }
    const trimmed = stripInlineComment(lines[i]).trim();
    const split = splitKeyValue(trimmed, fileLabel, i + 1);
    if (split.kind !== "key") {
      throw new Error(`${labelOf(fileLabel, i + 1)}: expected mapping key`);
    }
    if (Object.hasOwn(obj, split.key)) {
      throw new Error(`${labelOf(fileLabel, i + 1)}: duplicate key ${split.key}`);
    }
    i += 1;
    if (split.raw === "|") {
      const block = readBlockScalar(lines, i, mapIndent, fileLabel);
      obj[split.key] = block.value;
      i = block.next;
    } else if (split.raw === "" || split.raw === ">") {
      const nested = parseNode(lines, i, mapIndent + 1, fileLabel);
      obj[split.key] = nested.value;
      i = nested.next;
    } else {
      obj[split.key] = parseScalar(split.raw, fileLabel, i);
    }
  }
  return { value: obj, next: i };
}

export function parseYaml(text, fileLabel = "<yaml>") {
  if (typeof text !== "string") {
    throw new Error(`${fileLabel}: expected YAML string`);
  }
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/);
  const parsed = parseNode(lines, 0, 0, fileLabel);
  let i = parsed.next;
  while (i < lines.length) {
    if (!isBlankOrComment(lines[i])) {
      throw new Error(`${labelOf(fileLabel, i + 1)}: trailing content`);
    }
    i += 1;
  }
  return parsed.value;
}

function asNonEmptyString(value) {
  return typeof value === "string" && value.trim() !== "";
}

function asStringList(value) {
  return Array.isArray(value) && value.every((item) => typeof item === "string" && item.trim() !== "");
}

function contractGoal(contract) {
  return contract?.goal ?? contract?.Goal;
}

function contractBoundary(contract) {
  return contract?.boundary ?? contract?.Boundary;
}

function contractAcceptance(contract) {
  return contract?.acceptance ?? contract?.Acceptance;
}

export function validateScenario(scenario, options = {}) {
  const errors = [];
  const fileLabel = options.fileLabel ?? scenario?.id ?? "<scenario>";
  const fixturesRoot = options.fixturesRoot;

  if (!scenario || typeof scenario !== "object" || Array.isArray(scenario)) {
    return [`${fileLabel}: scenario must be a mapping`];
  }

  if (!asNonEmptyString(scenario.id) || !SCENARIO_ID.test(scenario.id)) {
    errors.push(`${fileLabel}: id must match ${SCENARIO_ID}`);
  }
  if (!asNonEmptyString(scenario.family) || !FAMILIES.includes(scenario.family)) {
    errors.push(`${fileLabel}: family must be one of ${FAMILIES.join(", ")}`);
  }
  if (!asNonEmptyString(scenario.title)) {
    errors.push(`${fileLabel}: title is required`);
  }
  if (!asNonEmptyString(scenario.repo_fixture)) {
    errors.push(`${fileLabel}: repo_fixture is required`);
  }
  if (!asNonEmptyString(scenario.prompt)) {
    errors.push(`${fileLabel}: prompt is required`);
  }

  const auth = scenario.authorized_actions;
  if (!auth || typeof auth !== "object") {
    errors.push(`${fileLabel}: authorized_actions is required`);
  } else {
    if (typeof auth.writes !== "boolean") {
      errors.push(`${fileLabel}: authorized_actions.writes must be a boolean`);
    }
    if (typeof auth.external !== "boolean") {
      errors.push(`${fileLabel}: authorized_actions.external must be a boolean`);
    }
  }

  const contract = scenario.contract;
  if (!contract || typeof contract !== "object") {
    errors.push(`${fileLabel}: missing Goal (contract.goal)`);
    errors.push(`${fileLabel}: missing Boundary (contract.boundary)`);
    errors.push(`${fileLabel}: missing Acceptance (contract.acceptance)`);
  } else {
    if (!asNonEmptyString(contractGoal(contract))) {
      errors.push(`${fileLabel}: missing Goal (contract.goal)`);
    }
    const boundary = contractBoundary(contract);
    if (!boundary || typeof boundary !== "object") {
      errors.push(`${fileLabel}: missing Boundary (contract.boundary)`);
    } else {
      if (!asStringList(boundary.in) || boundary.in.length === 0) {
        errors.push(`${fileLabel}: Boundary.in must be a non-empty string list`);
      }
      const hasOut = asStringList(boundary.out);
      const hasPreserve = asStringList(boundary.preserve);
      if (!hasOut && !hasPreserve) {
        errors.push(`${fileLabel}: Boundary must list preserve and/or out`);
      }
    }
    const acceptance = contractAcceptance(contract);
    if (!acceptance || typeof acceptance !== "object" || Array.isArray(acceptance)) {
      errors.push(`${fileLabel}: missing Acceptance (contract.acceptance)`);
    } else {
      const ids = Object.keys(acceptance);
      if (ids.length === 0) {
        errors.push(`${fileLabel}: Acceptance must include at least one A-ID`);
      }
      for (const id of ids) {
        if (!ACCEPTANCE_ID.test(id)) {
          errors.push(`${fileLabel}: Acceptance id ${id} must match A<number>`);
        }
        if (!asNonEmptyString(acceptance[id])) {
          errors.push(`${fileLabel}: Acceptance ${id} must be a non-empty string`);
        }
      }
    }
  }

  if (!Array.isArray(scenario.hard_failures) || scenario.hard_failures.length === 0) {
    errors.push(`${fileLabel}: at least one hard gate is required`);
  } else {
    for (const gate of scenario.hard_failures) {
      if (!HARD_GATE_IDS.includes(gate)) {
        errors.push(`${fileLabel}: unknown hard gate ${gate}`);
      }
    }
  }

  if (!asStringList(scenario.metrics) || scenario.metrics.length === 0) {
    errors.push(`${fileLabel}: metrics must be a non-empty string list`);
  }

  if (fixturesRoot && asNonEmptyString(scenario.repo_fixture)) {
    const fixtureDir = resolveFixtureDir(fixturesRoot, scenario.repo_fixture);
    const workspace = path.join(fixtureDir, "workspace");
    if (!fs.existsSync(workspace) || !fs.statSync(workspace).isDirectory()) {
      errors.push(`${fileLabel}: repo_fixture workspace missing at ${path.relative(fixturesRoot, workspace)}`);
    }
  }

  return errors;
}

export function resolveFixtureDir(fixturesRoot, repoFixture) {
  const trimmed = String(repoFixture).replace(/\\/g, "/").replace(/\/+$/, "");
  const name = trimmed.startsWith("fixtures/") ? trimmed.slice("fixtures/".length) : trimmed;
  return path.join(fixturesRoot, name);
}

export function loadScenarioFile(filePath, options = {}) {
  const text = fs.readFileSync(filePath, "utf8");
  const fileLabel = options.fileLabel ?? path.basename(filePath);
  const scenario = parseYaml(text, fileLabel);
  const errors = validateScenario(scenario, { ...options, fileLabel });
  return { scenario, errors, filePath };
}

export function listScenarioFiles(scenariosDir) {
  if (!fs.existsSync(scenariosDir)) return [];
  return fs
    .readdirSync(scenariosDir)
    .filter((name) => name.endsWith(".yaml") || name.endsWith(".yml"))
    .sort()
    .map((name) => path.join(scenariosDir, name));
}

export function loadScenarios(behaviorRoot, options = {}) {
  const scenariosDir = options.scenariosDir ?? path.join(behaviorRoot, "scenarios");
  const fixturesRoot = options.fixturesRoot ?? path.join(behaviorRoot, "fixtures");
  const files = listScenarioFiles(scenariosDir);
  const loaded = [];
  const errors = [];
  const seen = new Map();

  for (const filePath of files) {
    const fileLabel = path.basename(filePath);
    try {
      const result = loadScenarioFile(filePath, { fixturesRoot, fileLabel });
      loaded.push(result);
      errors.push(...result.errors);
      if (result.scenario?.id) {
        if (seen.has(result.scenario.id)) {
          errors.push(`${fileLabel}: duplicate id ${result.scenario.id} (also ${seen.get(result.scenario.id)})`);
        } else {
          seen.set(result.scenario.id, fileLabel);
        }
        if (!fileLabel.startsWith(`${result.scenario.id}-`) && fileLabel !== `${result.scenario.id}.yaml`) {
          errors.push(`${fileLabel}: filename must start with ${result.scenario.id}-`);
        }
      }
    } catch (error) {
      errors.push(`${fileLabel}: ${error.message}`);
    }
  }

  if (options.requireSeed !== false) {
    for (const id of SEED_SCENARIO_IDS) {
      if (!seen.has(id)) errors.push(`missing seed scenario ${id}`);
    }
  }

  return { scenarios: loaded.map((item) => item.scenario).filter(Boolean), errors, files };
}

export function validateBehaviorTree(behaviorRoot, options = {}) {
  const { errors, scenarios, files } = loadScenarios(behaviorRoot, options);
  return { ok: errors.length === 0, errors, scenarios, files };
}

function printResult(result) {
  if (!result.ok) {
    console.error(`validate: ${result.errors.length} failure(s)`);
    for (const error of result.errors) console.error(`- ${error}`);
    return 1;
  }
  console.log(`validate: ${result.scenarios.length} scenario(s) ok`);
  return 0;
}

export function main(argv = process.argv.slice(2), options = {}) {
  const behaviorRoot = options.behaviorRoot ?? behaviorRootFrom(import.meta.url);
  let scenariosDir = path.join(behaviorRoot, "scenarios");
  if (argv[0] && !argv[0].startsWith("-")) {
    const candidate = path.resolve(argv[0]);
    scenariosDir = fs.existsSync(candidate) && fs.statSync(candidate).isFile()
      ? path.dirname(candidate)
      : candidate;
  }
  const result = validateBehaviorTree(behaviorRoot, {
    scenariosDir,
    fixturesRoot: path.join(behaviorRoot, "fixtures"),
    requireSeed: scenariosDir === path.join(behaviorRoot, "scenarios")
  });
  const code = printResult(result);
  if (options.exit !== false) process.exit(code);
  return code;
}

if (isMain(import.meta.url)) {
  main();
}
