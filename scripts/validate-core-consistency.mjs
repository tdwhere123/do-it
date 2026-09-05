#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { HOOK_SCRIPTS, SESSION_START_SCRIPT, RUN_HOOK_CMD } from "./lib/hook-manifest.mjs";
const defaultRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export function validateCoreConsistency(root = defaultRoot) {
  const errors = [];
  const pairs = [];
  for (const host of ["do-it", "do-it-cursor", "do-it-opencode", "do-it-pi"]) {
    const bundle = `plugins/${host}`;
    pairs.push(["skills/do-it/do-it-core/SKILL.md", `${bundle}/skills/do-it-core/SKILL.md`]);
    const scripts = [...HOOK_SCRIPTS];
    if (host === "do-it" || host === "do-it-cursor") scripts.push(SESSION_START_SCRIPT);
    if (host === "do-it-cursor") scripts.push(RUN_HOOK_CMD);
    for (const script of scripts) pairs.push([`hooks/${script}`, `${bundle}/hooks/${script}`]);
    for (const dir of ["lib", "data"]) {
      for (const file of fs.readdirSync(path.join(root, "hooks", dir))) {
        pairs.push([`hooks/${dir}/${file}`, `${bundle}/hooks/${dir}/${file}`]);
      }
    }
  }
  for (const [source, target] of pairs) {
    try {
      if (!fs.readFileSync(path.join(root, source)).equals(fs.readFileSync(path.join(root, target)))) errors.push(`${target}: generated copy drifted from ${source}`);
    } catch { errors.push(`${target}: generated copy or source missing`); }
  }
  return { errors };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { errors } = validateCoreConsistency();
  for (const error of errors) console.error(error);
  if (errors.length) process.exitCode = 1;
  else console.log("validate-core-consistency: generated Core and hook copies match");
}
