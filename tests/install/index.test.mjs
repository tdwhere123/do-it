import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { parseFrontmatter } from "../../scripts/build-index-json.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const indexScript = path.join(repoRoot, "scripts/build-index-json.mjs");
const indexPath = path.join(repoRoot, "index.json");

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(repoRoot, relativePath), "utf8"));
}

test("build-index-json creates a byte-reproducible skill and agent inventory", () => {
  const first = spawnSync(process.execPath, [indexScript], {
    cwd: repoRoot,
    encoding: "utf8"
  });
  assert.equal(first.status, 0, first.stderr);
  const firstText = fs.readFileSync(indexPath, "utf8");

  const second = spawnSync(process.execPath, [indexScript], {
    cwd: repoRoot,
    encoding: "utf8"
  });
  assert.equal(second.status, 0, second.stderr);
  assert.equal(fs.readFileSync(indexPath, "utf8"), firstText);

  const index = JSON.parse(firstText);
  const manifest = readJson("manifest.json");
  const pkg = readJson("package.json");
  const capabilityCount = Object.values(manifest.skillTiers).flat().length;

  assert.equal(index.version, manifest.version);
  assert.equal(index.package, pkg.name);
  assert.ok(!Object.hasOwn(index, "generated_at"));
  assert.equal(index.total_skills, capabilityCount);
  assert.equal(index.total_capabilities, capabilityCount);
  assert.equal(index.total_discovery_entries, 1);
  assert.equal(index.total_agents, manifest.agents.length);
  assert.equal(index.entries.length, manifest.skills.length + manifest.agents.length);

  const discovery = index.entries.find((entry) => entry.name === "do-it-skills-index");
  assert.equal(discovery?.kind, "skill");
  assert.equal(discovery?.group, "index");

  assert.equal(index.entries.some((entry) => entry.name === "do-it-router"), false);

  const reviewer = index.entries.find((entry) => entry.name === "reviewer");
  assert.equal(reviewer?.kind, "agent");
  assert.equal(reviewer?.source, "agents/reviewer.toml");
  assert.match(reviewer?.description ?? "", /review/i);
});

test("retired router has no source, discovery entry, or shipped alias", () => {
  const manifest = readJson("manifest.json");
  assert.ok(!Object.values(manifest.skillTiers).flat().includes("do-it-router"));
  assert.ok(!manifest.skills.some((entry) => entry.name === "do-it-router"));
  for (const root of [
    "skills/do-it", "dist/claude/skills", "plugins/do-it/skills",
    "plugins/do-it-cursor/skills", "plugins/do-it-pi/skills", "plugins/do-it-grok/skills"
  ]) {
    assert.equal(fs.existsSync(path.join(repoRoot, root, "do-it-router")), false, root);
    const index = path.join(repoRoot, root, "_index.md");
    if (fs.existsSync(index)) assert.doesNotMatch(fs.readFileSync(index, "utf8"), /do-it-router/);
  }
});

test("parseFrontmatter accepts CRLF SKILL.md fences", () => {
  const crlf = [
    "---",
    "name: do-it-core",
    'description: "Use when repository work needs shared intent, facts, and evidence."',
    "---",
    "",
    "# Core",
    ""
  ].join("\r\n");
  const fm = parseFrontmatter(crlf);
  assert.equal(fm.name, "do-it-core");
  assert.match(fm.description, /intent, facts, and evidence/);
});

test("removed install migration note is not referenced by shipped docs", () => {
  for (const relativePath of ["README.md", "README.zh-CN.md", "CHANGELOG.md", "package.json"]) {
    const text = fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
    assert.ok(
      !text.includes("install/migrations/0.4-to-0.5.md"),
      `${relativePath} should not reference deleted install migration notes`
    );
  }
});

test("canonical and generated native agents inherit host model choices", () => {
  const concreteModel = /\b(?:gpt-[A-Za-z0-9_.-]+|sonnet|opus|haiku)\b/i;
  const hostPrivate = /\b(?:model_reasoning_effort|claude_model|output_budget)\b/;

  for (const [dir, extension] of [
    ["agents", ".toml"],
    ["dist/claude/agents", ".md"],
    ["plugins/do-it-cursor/agents", ".md"],
    ["plugins/do-it-grok/agents", ".md"],
    ["plugins/do-it-pi/agents", ".md"]
  ]) {
    const files = fs.readdirSync(path.join(repoRoot, dir)).filter((file) => file.endsWith(extension));
    assert.ok(files.length > 0, `${dir} must contain native agents`);
    for (const fileName of files) {
      const relativePath = `${dir}/${fileName}`;
      const text = fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
      assert.doesNotMatch(text, /^\s*model\s*[:=]/m, `${relativePath} should inherit host model`);
      assert.doesNotMatch(text, hostPrivate, `${relativePath} should not contain host-private model policy`);
      assert.doesNotMatch(text, concreteModel, `${relativePath} should not name concrete models`);
    }
  }
});
