#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { coreContextPath, renderCoreContext } from "./build-core-context.mjs";
import { HOOK_SCRIPTS, CODEX_HOOK_FILES, CURSOR_HOOK_FILES, GROK_HOOK_FILES } from "./lib/hook-manifest.mjs";
const defaultRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export function validateCoreConsistency(root = defaultRoot) {
  const errors = [];
  try {
    if (fs.readFileSync(path.join(root, coreContextPath), "utf8") !== renderCoreContext(root)) {
      errors.push(`${coreContextPath}: stale generated Core context; run node scripts/build-core-context.mjs`);
    }
  } catch (error) {
    errors.push(`${coreContextPath}: missing or invalid generated Core context: ${error.message}`);
  }
  const pairs = [];
  for (const [host, scripts] of [
    ["do-it", CODEX_HOOK_FILES.filter((file) => file !== "hooks.json")],
    ["do-it-cursor", CURSOR_HOOK_FILES],
    ["do-it-pi", HOOK_SCRIPTS],
    ["do-it-grok", GROK_HOOK_FILES]
  ]) {
    const bundle = `plugins/${host}`;
    pairs.push(["skills/do-it/do-it-core/SKILL.md", `${bundle}/skills/do-it-core/SKILL.md`]);
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
