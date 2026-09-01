#!/usr/bin/env node

// Closed-set skill/agent contract anchors. IDs are the cross-version contract;
// surrounding prose may be reworded. Deleting an ID is a break.

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { CORE_SKILLS } from "./skill-tiers.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const defaultRepoRoot = path.resolve(scriptDir, "..");

export const CONTRACT_PREFIX = "do-it-contract:";
export const AGENT_CHILD_CONTRACT_ID = "do-it-contract:agent.child-contract";
export const AGENT_NOT_DEFAULT_CONTRACT_ID = "do-it-contract:agent.not-default";
export const EXPECTED_AGENT_INVENTORY = 10;

export const NOT_DEFAULT_AGENTS = Object.freeze([
  "architecture-strategist",
  "code-quality-cleaner",
  "plan-challenger",
  "product-strategist",
  "tdd-red-writer"
]);

const ANCHOR_RE =
  /<!--\s*(do-it-contract:[a-z0-9]+(?:[.-][a-z0-9]+)*)\s*-->|#\s*(do-it-contract:[a-z0-9]+(?:[.-][a-z0-9]+)*)/g;

// Default/always/spawn N>=2 workers. "one" and "0" stay legal.
const FIXED_AGENT_COUNT_RE =
  /\b(?:default|always|require[sd]?|spawn|dispatch|use)\s+\*{0,2}(?:two|three|four|five|[2-9]|1\d)\*{0,2}\s+(?:agents?|subagents?|workers?|reviewers?)\b|\b(?:two|three|four|five|[2-9]|1\d)\s+(?:agents?|subagents?|workers?|reviewers?)\b/i;

/**
 * @typedef {{
 *   id: string,
 *   files?: string[],
 *   everyAgent?: boolean,
 *   extraFiles?: string[],
 *   mustInclude?: string[]
 * }} ContractSpec
 */

/** @type {readonly ContractSpec[]} */
export const SKILL_CONTRACTS = Object.freeze([
  { id: "decide.find-unknown", files: ["skills/do-it/do-it-decide/SKILL.md"] },
  { id: "decide.cheap-resolver", files: ["skills/do-it/do-it-decide/SKILL.md"] },
  { id: "decide.dominant-or-boundary", files: ["skills/do-it/do-it-decide/SKILL.md"] },
  { id: "decide.settled-protection", files: ["skills/do-it/do-it-decide/SKILL.md"] },
  {
    id: "decide.readiness",
    files: ["skills/do-it/do-it-decide/SKILL.md"],
    mustInclude: ["task-contract.md"]
  },
  {
    id: "decide.minimal-contract",
    files: ["skills/do-it/do-it-decide/SKILL.md"],
    mustInclude: ["task-contract.md"]
  },

  { id: "build.causal-closure", files: ["skills/do-it/do-it-code-quality/SKILL.md"] },
  { id: "build.patch-or-prepare", files: ["skills/do-it/do-it-code-quality/SKILL.md"] },
  {
    id: "build.stateful-scan",
    files: ["skills/do-it/do-it-code-quality/SKILL.md"],
    mustInclude: ["stateful-change-scan.md"]
  },
  {
    id: "build.scope-chain",
    files: ["skills/do-it/do-it-code-quality/SKILL.md"],
    mustInclude: ["scope-chain.md"]
  },
  { id: "build.both-sides", files: ["skills/do-it/do-it-code-quality/SKILL.md"] },
  { id: "build.uncertainty-stop", files: ["skills/do-it/do-it-code-quality/SKILL.md"] },

  { id: "core.confirm-first", files: ["skills/do-it/do-it-core/SKILL.md"] },
  { id: "core.not-verified", files: ["skills/do-it/do-it-core/SKILL.md"] },
  { id: "core.blocked-honest", files: ["skills/do-it/do-it-core/SKILL.md"] },
  { id: "core.precedence", files: ["skills/do-it/do-it-core/SKILL.md"] },

  { id: "router.authorization-boundary", files: ["skills/do-it/do-it-router/SKILL.md"] },
  { id: "router.shared-write-owner", files: ["skills/do-it/do-it-router/SKILL.md"] },
  {
    id: "router.delegation",
    files: ["skills/do-it/do-it-router/SKILL.md"],
    mustInclude: ["workflow-kernel.md"]
  },

  {
    id: "review.two-axes",
    files: ["skills/do-it/do-it-review/SKILL.md"],
    mustInclude: ["task-contract.md"]
  },
  { id: "review.inline-default", files: ["skills/do-it/do-it-review/SKILL.md"] },
  { id: "review.not-clean-open-findings", files: ["skills/do-it/do-it-review/SKILL.md"] },

  {
    id: "verify.acceptance-map",
    files: ["skills/do-it/do-it-verify/SKILL.md"],
    mustInclude: ["task-contract.md"]
  },
  { id: "verify.unverifiable-classes", files: ["skills/do-it/do-it-verify/SKILL.md"] },
  { id: "verify.honest-not-verified", files: ["skills/do-it/do-it-verify/SKILL.md"] },

  { id: "architecture.decision-surfaces", files: ["skills/do-it/do-it-architecture/SKILL.md"] },
  { id: "architecture.authority-quartet", files: ["skills/do-it/do-it-architecture/SKILL.md"] },
  { id: "architecture.no-private-dossier", files: ["skills/do-it/do-it-architecture/SKILL.md"] },

  {
    id: "adaptive.delta-only",
    files: ["skills/do-it/do-it-adaptive/SKILL.md"],
    mustInclude: ["adaptive-policy.md"]
  },
  { id: "adaptive.active-cap", files: ["skills/do-it/do-it-adaptive/SKILL.md"] },
  { id: "adaptive.precedence-vs-core", files: ["skills/do-it/do-it-adaptive/SKILL.md"] },
  { id: "adaptive.no-core-writes", files: ["skills/do-it/do-it-adaptive/SKILL.md"] },
  { id: "adaptive.child-one-delta", files: ["skills/do-it/do-it-adaptive/SKILL.md"] },

  { id: "authoring.failure-mode-eval", files: ["skills/do-it/do-it-skill-authoring/SKILL.md"] },
  { id: "authoring.contract-anchors", files: ["skills/do-it/do-it-skill-authoring/SKILL.md"] },
  {
    id: "authoring.delegation-budget",
    files: ["skills/do-it/do-it-skill-authoring/SKILL.md"],
    mustInclude: ["workflow-kernel.md"]
  },

  { id: "delegation.zero-default", files: ["skills/do-it/references/workflow-kernel.md"] },
  { id: "delegation.child-write-boundary", files: ["skills/do-it/references/workflow-kernel.md"] },

  {
    id: "agent.child-contract",
    everyAgent: true,
    extraFiles: ["hooks/subagent-stance.sh"]
  },
  {
    id: "agent.not-default",
    files: NOT_DEFAULT_AGENTS.map((name) => `agents/${name}.toml`)
  }
]);

const REGISTERED_IDS = new Set(SKILL_CONTRACTS.map((row) => `${CONTRACT_PREFIX}${row.id}`));

/**
 * @param {string} source
 * @returns {Set<string>}
 */
export function collectAnchors(source) {
  const ids = new Set();
  for (const match of String(source).matchAll(ANCHOR_RE)) {
    ids.add(match[1] ?? match[2]);
  }
  return ids;
}

/**
 * @param {string} source
 * @returns {boolean}
 */
export function hasFixedAgentCount(source) {
  return FIXED_AGENT_COUNT_RE.test(String(source));
}

function displayId(shortId) {
  return `${CONTRACT_PREFIX}${shortId}`;
}

function listAgentFiles(repoRoot) {
  const dir = path.join(repoRoot, "agents");
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((name) => name.endsWith(".toml"))
    .sort()
    .map((name) => `agents/${name}`);
}

function walkScanFiles(repoRoot, relative, acc) {
  const full = path.join(repoRoot, relative);
  if (!fs.existsSync(full)) return;
  const stat = fs.lstatSync(full);
  if (stat.isDirectory()) {
    for (const child of fs.readdirSync(full).sort()) {
      if (child.startsWith(".")) continue;
      walkScanFiles(repoRoot, `${relative}/${child}`, acc);
    }
    return;
  }
  if (relative.endsWith(".md") || relative.endsWith(".toml") || relative.endsWith(".sh")) {
    acc.push(relative);
  }
}

function listScanFiles(repoRoot) {
  const acc = [];
  walkScanFiles(repoRoot, "skills/do-it", acc);
  walkScanFiles(repoRoot, "agents", acc);
  walkScanFiles(repoRoot, "hooks/subagent-stance.sh", acc);
  return acc;
}

function readRelative(repoRoot, relativePath, overlays) {
  if (overlays && Object.hasOwn(overlays, relativePath)) {
    return overlays[relativePath];
  }
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function ownerFiles(spec, repoRoot) {
  if (spec.everyAgent) {
    return [...listAgentFiles(repoRoot), ...(spec.extraFiles ?? [])];
  }
  return spec.files ?? [];
}

/**
 * @param {{ repoRoot?: string, overlays?: Record<string, string> }} [options]
 * @returns {string[]}
 */
export function validateSkillContracts(options = {}) {
  const repoRoot = options.repoRoot ?? defaultRepoRoot;
  const overlays = options.overlays ?? {};
  const errors = [];

  const agentFiles = listAgentFiles(repoRoot);
  if (agentFiles.length !== EXPECTED_AGENT_INVENTORY) {
    errors.push(
      `agent inventory must stay at ${EXPECTED_AGENT_INVENTORY}; found ${agentFiles.length}`
    );
  }

  for (const spec of SKILL_CONTRACTS) {
    const fullId = displayId(spec.id);
    const files = ownerFiles(spec, repoRoot);
    if (files.length === 0) {
      errors.push(`${fullId}: no owner files`);
      continue;
    }

    for (const relativePath of files) {
      let source;
      try {
        source = readRelative(repoRoot, relativePath, overlays);
      } catch (error) {
        errors.push(`${relativePath}: cannot read source: ${error.message}`);
        continue;
      }

      if (!collectAnchors(source).has(fullId)) {
        errors.push(`${relativePath}: missing ${fullId}`);
      }

      for (const needle of spec.mustInclude ?? []) {
        if (!source.includes(needle)) {
          errors.push(`${relativePath}: ${fullId} missing cross-link ${needle}`);
        }
      }
    }
  }

  for (const relativePath of listScanFiles(repoRoot)) {
    let source;
    try {
      source = readRelative(repoRoot, relativePath, overlays);
    } catch {
      continue;
    }
    for (const id of collectAnchors(source)) {
      if (!REGISTERED_IDS.has(id)) {
        errors.push(`${relativePath}: unknown contract ${id}`);
      }
    }
  }

  for (const name of CORE_SKILLS) {
    const relativePath = `skills/do-it/${name}/SKILL.md`;
    let source;
    try {
      source = readRelative(repoRoot, relativePath, overlays);
    } catch (error) {
      errors.push(`${relativePath}: cannot read source: ${error.message}`);
      continue;
    }
    if (hasFixedAgentCount(source)) {
      errors.push(`${relativePath}: main skill must not prescribe a fixed agent count`);
    }
  }

  return errors;
}

/**
 * @param {{ commandName?: string, repoRoot?: string, overlays?: Record<string, string> }} [options]
 * @returns {number}
 */
export function runValidateSkillContracts(options = {}) {
  const commandName = options.commandName ?? "validate-skill-contracts";
  const errors = validateSkillContracts(options);
  if (errors.length > 0) {
    console.error(`${commandName}: ${errors.length} failure(s)`);
    for (const error of errors) console.error(`- ${error}`);
    return 1;
  }
  console.log(`${commandName}: ${SKILL_CONTRACTS.length} contracts OK`);
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(runValidateSkillContracts());
}
