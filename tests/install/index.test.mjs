import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const indexScript = path.join(repoRoot, "scripts/build-index-json.mjs");
const indexPath = path.join(repoRoot, "index.json");

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(repoRoot, relativePath), "utf8"));
}

test("build-index-json creates a reproducible skill and agent inventory", () => {
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

  assert.equal(index.version, manifest.version);
  assert.equal(index.package, pkg.name);
  assert.equal(index.total_skills, manifest.skills.length);
  assert.equal(index.total_agents, manifest.agents.length);
  assert.equal(index.entries.length, manifest.skills.length + manifest.agents.length);

  const router = index.entries.find((entry) => entry.name === "do-it-router");
  assert.equal(router?.kind, "skill");
  assert.equal(router?.target, "skills/do-it-router");
  assert.match(router?.description ?? "", /risk|tier|failure/i);

  const reviewer = index.entries.find((entry) => entry.name === "reviewer");
  assert.equal(reviewer?.kind, "agent");
  assert.equal(reviewer?.source, "agents/reviewer.toml");
  assert.match(reviewer?.description ?? "", /review/i);
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
