#!/usr/bin/env node
// Build a compact `_index.md` for lazy skill loading.
// Source of truth: each `skills/do-it/<name>/SKILL.md` frontmatter `description`
// field. Also emits `_index.core.md` (core-only listing) for docs/diffs;
// host plugins use the full `_index.md`.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  CORE_SKILLS,
  EXTENDED_MAINTENANCE,
  EXTENDED_ON_DEMAND
} from "./skill-tiers.mjs";
import { parseFrontmatter } from "./build-index-json.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const skillsDir = path.join(repoRoot, "skills", "do-it");
const manifestPath = path.join(repoRoot, "manifest.json");
const outDir = path.join(repoRoot, "dist", "claude", "skills");

const MAIN_LINE = [...CORE_SKILLS];
const ON_DEMAND = [...EXTENDED_ON_DEMAND];
const HANDBOOK = [...EXTENDED_MAINTENANCE];


function readSkillEntry(name) {
  const skillPath = path.join(skillsDir, name, "SKILL.md");
  if (!fs.existsSync(skillPath)) return null;
  const text = fs.readFileSync(skillPath, "utf8");
  const fm = parseFrontmatter(text);
  return {
    name,
    description: fm.description ?? ""
  };
}

function renderBucket(title, names) {
  if (!names.length) return "";
  const lines = [`## ${title}`, ""];
  for (const name of names) {
    const entry = readSkillEntry(name);
    if (!entry) {
      lines.push(`- **${name}** — (missing SKILL.md)`);
      continue;
    }
    lines.push(`- [**${entry.name}**](./${entry.name}/SKILL.md) — ${entry.description || "(no description)"}`);
  }
  lines.push("");
  return lines.join("\n");
}

function writeIndex({ coreOnly, orphans }) {
  const mainLine = [...MAIN_LINE];
  const onDemand = coreOnly ? [] : [...ON_DEMAND];
  const handbook = coreOnly ? [] : [...HANDBOOK];

  const header = [
    "<!--",
    "  GENERATED FILE — do not hand-edit.",
    "  Regenerate with: node scripts/build-skills-index.mjs",
    "  Source of truth: skills/do-it/<name>/SKILL.md frontmatter `description`",
    "  Bucket order is curated in scripts/skill-tiers.mjs.",
    "-->",
    "",
    "# do-it skills index",
    "",
    coreOnly ? "Core-only listing (docs/diffs)." : "Discover skills from their descriptions below.",
    "Read only the matching skill bodies as needed, using the host's skill loader or the linked SKILL.md files. Do not read every skill up front.",
    "Links resolve beside this index in the installed or packaged skills directory. The generated dist/claude/skills index is a staging artifact; canonical bodies live in skills/do-it/<name>/SKILL.md.",
    ""
  ].join("\n");

  const sections = [
    renderBucket(
      coreOnly ? "Core" : "Professional perspectives",
      mainLine
    ),
    renderBucket("On demand", onDemand),
    renderBucket("Handbook & maintenance", handbook)
  ].filter(Boolean);

  if (orphans.length > 0) {
    sections.push(renderBucket("Other (declared in manifest, ungrouped)", orphans));
  }

  const content = header + "\n" + sections.join("\n");
  const outFilePath = path.join(outDir, coreOnly ? "_index.core.md" : "_index.md");
  fs.writeFileSync(outFilePath, content);
  const bytes = Buffer.byteLength(content, "utf8");
  console.log(
    `built ${path.basename(outFilePath)} (${bytes} bytes, ${mainLine.length}+${onDemand.length}+${handbook.length}+${orphans.length} entries) → ${path.relative(repoRoot, outFilePath)}`
  );
}

function main() {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const declared = new Set(
    (manifest.skills ?? [])
      .filter((s) => typeof s.source === "string" && s.source.startsWith("skills/do-it/"))
      .map((s) => s.name)
  );

  const claimed = new Set([...MAIN_LINE, ...ON_DEMAND, ...HANDBOOK]);
  const orphans = [...declared].filter((n) => !claimed.has(n)).sort();

  fs.mkdirSync(outDir, { recursive: true });
  writeIndex({ coreOnly: false, orphans });
  writeIndex({ coreOnly: true, orphans: [] });
}

main();
