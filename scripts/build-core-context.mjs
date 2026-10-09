#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const defaultRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const coreContextPath = "hooks/data/core-context.txt";

export function renderCoreContext(root = defaultRoot) {
  const source = fs.readFileSync(path.join(root, "skills/do-it/do-it-core/SKILL.md"), "utf8");
  const start = "<!-- do-it:core-context:start -->";
  const end = "<!-- do-it:core-context:end -->";
  if (source.split(start).length !== 2 || source.split(end).length !== 2 || source.indexOf(end) < source.indexOf(start)) {
    throw new Error("Core must contain exactly one ordered core-context excerpt");
  }
  const excerpt = source.slice(source.indexOf(start) + start.length, source.indexOf(end)).trim().replace(/\s+/gu, " ");
  if (!excerpt) throw new Error("Core context excerpt must not be empty");
  return `Do-it: ${excerpt}\n`;
}

export function buildCoreContext(root = defaultRoot) {
  const context = renderCoreContext(root);
  fs.mkdirSync(path.dirname(path.join(root, coreContextPath)), { recursive: true });
  fs.writeFileSync(path.join(root, coreContextPath), context, "utf8");
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  buildCoreContext();
  console.log(`build-core-context: generated ${coreContextPath} from Core`);
}
