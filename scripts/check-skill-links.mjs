#!/usr/bin/env node
// Skill cross-reference linter.
//
// Scans every skills/do-it/<skill>/SKILL.md for backtick-wrapped `do-it-*`
// tokens and fails if any names a skill or command that does not exist — a
// broken reference left behind by a rename or deletion. Also flags a skill
// directory that is not registered in manifest.json.

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const skillsDir = path.join(repoRoot, "skills/do-it");
const commandsDir = path.join(repoRoot, "commands");

function listDir(dir, filterFn) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter(filterFn).sort();
}

// A `do-it-*` token resolves if it names a skill directory or a command file.
const skillNames = listDir(skillsDir, (name) =>
  fs.statSync(path.join(skillsDir, name)).isDirectory()
);
const commandNames = listDir(commandsDir, (name) => name.endsWith(".md")).map(
  (name) => name.replace(/\.md$/, "")
);
const validRefs = new Set([...skillNames, ...commandNames]);

const manifest = JSON.parse(
  fs.readFileSync(path.join(repoRoot, "manifest.json"), "utf8")
);
const manifestSkillTargets = new Set(
  (manifest.skills ?? []).map((skill) => skill.target.replace(/^skills\//, ""))
);

const errors = [];

// Every skill directory must be registered in the manifest.
for (const name of skillNames) {
  if (!manifestSkillTargets.has(name)) {
    errors.push(`skills/do-it/${name} is not registered in manifest.json skills[]`);
  }
}

// Every backtick-wrapped `do-it-<token>` in a SKILL.md must resolve. The
// leading backtick anchors the match so prose headings and file names like
// `.do-it-install-state.json` do not register as skill references.
const REF = /`do-it-[a-z0-9]+(?:-[a-z0-9]+)*/g;

for (const name of skillNames) {
  const skillFile = path.join(skillsDir, name, "SKILL.md");
  if (!fs.existsSync(skillFile)) {
    errors.push(`skills/do-it/${name}/SKILL.md is missing`);
    continue;
  }
  const text = fs.readFileSync(skillFile, "utf8");
  const seen = new Set();
  for (const match of text.matchAll(REF)) {
    const token = match[0].slice(1); // drop the leading backtick
    if (seen.has(token)) continue;
    seen.add(token);
    if (!validRefs.has(token)) {
      errors.push(
        `skills/do-it/${name}/SKILL.md references unknown skill/command \`${token}\``
      );
    }
  }
}

if (errors.length > 0) {
  console.error(`check-skill-links: ${errors.length} failure(s)`);
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(
  `check-skill-links: ${skillNames.length} skills, ` +
    `${commandNames.length} commands — all cross-references resolve`
);
