#!/usr/bin/env node
// Single source of truth for core vs extended do-it skills.
// Cursor plugin bundles core only; Codex/Claude/OpenCode install all skills.
// Meaning-centric buckets (not process pipeline): route / code-quality / review /
// decide / verify + persistence/maintenance.

/** @type {readonly string[]} */
export const CORE_SKILLS = [
  "do-it-router",
  "do-it-code-quality",
  "do-it-review",
  "do-it-decide",
  "do-it-verify"
];

/** On-demand extended skills — none in the meaning-centric default set. */
export const EXTENDED_ON_DEMAND = [];

export const EXTENDED_MAINTENANCE = [
  "do-it-handbook",
  "do-it-context",
  "do-it-skill-authoring"
];

/** @type {readonly string[]} */
export const EXTENDED_SKILLS = [...EXTENDED_ON_DEMAND, ...EXTENDED_MAINTENANCE];

/** @type {readonly string[]} */
export const ALL_SKILLS = [...CORE_SKILLS, ...EXTENDED_SKILLS];

const coreSet = new Set(CORE_SKILLS);

/**
 * @param {string} name
 * @returns {boolean}
 */
export function isCoreSkill(name) {
  return coreSet.has(name);
}

/**
 * @param {string} name
 * @returns {"core" | "extended-on-demand" | "extended-maintenance" | "unknown"}
 */
export function skillTierGroup(name) {
  if (isCoreSkill(name)) return "core";
  if (EXTENDED_ON_DEMAND.includes(name)) return "extended-on-demand";
  if (EXTENDED_MAINTENANCE.includes(name)) return "extended-maintenance";
  return "unknown";
}

/**
 * Validate manifest skillTiers (if present) matches this module.
 * @param {{ skillTiers?: { core?: string[]; extended?: string[] } }} manifest
 * @returns {string[]}
 */
export function validateManifestSkillTiers(manifest) {
  const errors = [];
  const tiers = manifest.skillTiers;
  if (!tiers) return errors;

  const sorted = (arr) => [...arr].sort();
  if (sorted(tiers.core ?? []).join() !== sorted(CORE_SKILLS).join()) {
    errors.push("manifest.json skillTiers.core does not match scripts/skill-tiers.mjs CORE_SKILLS");
  }
  if (sorted(tiers.extended ?? []).join() !== sorted(EXTENDED_SKILLS).join()) {
    errors.push("manifest.json skillTiers.extended does not match scripts/skill-tiers.mjs EXTENDED_SKILLS");
  }
  return errors;
}
