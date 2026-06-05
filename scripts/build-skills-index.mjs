#!/usr/bin/env node
// Build a compact `_index.md` for lazy skill loading.
// Source of truth: each `skills/do-it/<name>/SKILL.md` frontmatter `description`
// field. The router points the main agent at this index instead of dumping
// every skill description into the system-reminder banner.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const skillsDir = path.join(repoRoot, "skills", "do-it");
const manifestPath = path.join(repoRoot, "manifest.json");
const outDir = path.join(repoRoot, "dist", "claude", "skills");
const outFile = path.join(outDir, "_index.md");

// Curated bucket order. Names not listed fall through to "其他".
const MAIN_LINE = [
  "do-it-router",
  "do-it-grill",
  "do-it-planning",
  "do-it-tdd",
  "do-it-review-loop",
  "do-it-fix-loop",
  "do-it-verification-gate"
];

const ON_DEMAND = [
  "do-it-brainstorm",
  "do-it-architecture-scan",
  "do-it-interface-drill",
  "do-it-debugging",
  "do-it-slicing",
  "do-it-domain-language",
  "do-it-comments-discipline",
  "do-it-worktree-isolation",
  "do-it-branch-closeout",
  "do-it-subagent-orchestration"
];

const HANDBOOK = [
  "do-it-handbook",
  "do-it-context",
  "do-it-skill-authoring"
];

function parseFrontmatter(text) {
  // Minimal YAML frontmatter parser: only `name:` and `description:` (single
  // line, optionally double-quoted). The SKILL.md schema is enforced upstream.
  if (!text.startsWith("---")) return {};
  const end = text.indexOf("\n---", 3);
  if (end < 0) return {};
  const block = text.slice(3, end).trim();
  const out = {};
  for (const rawLine of block.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const idx = line.indexOf(":");
    if (idx < 0) continue;
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    if (value.startsWith('"') && value.endsWith('"') && value.length >= 2) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

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

// Strip the boilerplate "Use when ..." prefix and shorten to ~70 chars so the
// index stays compact. We keep the meaningful tail and add an ellipsis if we
// truncate.
function shortenDescription(desc) {
  if (!desc) return "(no description)";
  let text = desc.trim();
  // Drop trailing period for compactness.
  text = text.replace(/[.。]+$/, "");
  // Replace verbose openings.
  text = text
    .replace(/^Use when\s+/i, "")
    .replace(/^Use this\s+(to|when|as)?\s*/i, "")
    .replace(/^使用\s*/, "")
    .replace(/^用于\s*/, "");
  // Soft cap at ~80 chars (rough).
  if (text.length > 80) {
    text = text.slice(0, 78).trimEnd() + "…";
  }
  return text;
}

function renderBucket(title, names) {
  const lines = [`## ${title}`, ""];
  for (const name of names) {
    const entry = readSkillEntry(name);
    if (!entry) {
      lines.push(`- **${name}** — (missing SKILL.md)`);
      continue;
    }
    lines.push(`- **${entry.name}** — ${shortenDescription(entry.description)}`);
  }
  lines.push("");
  return lines.join("\n");
}

function main() {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const declared = new Set(
    (manifest.skills ?? [])
      .filter((s) => typeof s.source === "string" && s.source.startsWith("skills/do-it/"))
      .map((s) => s.name)
  );

  // Pre-compute orphans: skills declared in manifest but not in any bucket.
  const claimed = new Set([...MAIN_LINE, ...ON_DEMAND, ...HANDBOOK]);
  const orphans = [...declared].filter((n) => !claimed.has(n)).sort();

  fs.mkdirSync(outDir, { recursive: true });

  const header = [
    "<!--",
    "  GENERATED FILE — do not hand-edit.",
    "  Regenerate with: node scripts/build-skills-index.mjs",
    "  Source of truth: skills/do-it/<name>/SKILL.md frontmatter `description`",
    "  Bucket order is curated in scripts/build-skills-index.mjs.",
    "-->",
    "",
    "# do-it skills index",
    "",
    "router 推荐按需加载：用 Skill 工具 + skill 名加载详情；不要一次性全读。",
    ""
  ].join("\n");

  const sections = [
    renderBucket("主线 (router 推荐)", MAIN_LINE),
    renderBucket("按需触发", ON_DEMAND),
    renderBucket("Handbook & 维护", HANDBOOK)
  ];

  if (orphans.length > 0) {
    sections.push(renderBucket("其他 (manifest 已声明但未分组)", orphans));
  }

  const body = sections.join("\n");
  const content = header + "\n" + body;

  fs.writeFileSync(outFile, content);
  const bytes = Buffer.byteLength(content, "utf8");
  console.log(
    `built skills/_index.md (${bytes} bytes, ${MAIN_LINE.length}+${ON_DEMAND.length}+${HANDBOOK.length}+${orphans.length} entries) → ${path.relative(repoRoot, outFile)}`
  );
}

main();
