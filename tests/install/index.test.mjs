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

  const router = index.entries.find((entry) => entry.name === "do-it-router");
  assert.equal(router?.kind, "skill");
  assert.equal(router?.target, "skills/do-it-router");
  assert.match(router?.description ?? "", /risk|tier|failure/i);

  const reviewer = index.entries.find((entry) => entry.name === "reviewer");
  assert.equal(reviewer?.kind, "agent");
  assert.equal(reviewer?.source, "agents/reviewer.toml");
  assert.match(reviewer?.description ?? "", /review/i);
});

test("parseFrontmatter accepts CRLF SKILL.md fences", () => {
  const crlf = [
    "---",
    "name: do-it-router",
    'description: "Use when starting any non-trivial repo task: pick Light / Standard / Heavy tier."',
    "---",
    "",
    "# Router",
    ""
  ].join("\r\n");
  const fm = parseFrontmatter(crlf);
  assert.equal(fm.name, "do-it-router");
  assert.match(fm.description, /Light \/ Standard \/ Heavy/);
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

test("agent templates and generated Claude agents do not pin models", () => {
  const concreteModel = /\b(?:gpt-[A-Za-z0-9_.-]+|sonnet|opus|haiku)\b/i;
  const hostPrivate = /\b(?:model_reasoning_effort|claude_model|output_budget)\b/;

  for (const dir of ["agents", "plugins/do-it/agents"]) {
    for (const fileName of fs.readdirSync(path.join(repoRoot, dir))) {
      if (!fileName.endsWith(".toml")) continue;
      const relativePath = `${dir}/${fileName}`;
      const text = fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
      assert.doesNotMatch(text, /^model\s*=/m, `${relativePath} should not set model`);
      assert.doesNotMatch(text, hostPrivate, `${relativePath} should not contain host-private model policy`);
      assert.doesNotMatch(text, concreteModel, `${relativePath} should not name concrete models`);
    }
  }

  const claudeDir = path.join(repoRoot, "dist/claude/agents");
  for (const fileName of fs.readdirSync(claudeDir)) {
    if (!fileName.endsWith(".md")) continue;
    const relativePath = `dist/claude/agents/${fileName}`;
    const text = fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
    assert.doesNotMatch(text, /^\s*model:/m, `${relativePath} should inherit host model`);
    assert.doesNotMatch(text, concreteModel, `${relativePath} should not name concrete models`);
  }
});
