import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { parseFrontmatter } from "../../scripts/build-index-json.mjs";
import { CORE_SKILLS } from "../../scripts/skill-tiers.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function generateFixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "do-it-skills-index-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  for (const relative of [
    "manifest.json",
    "skills/do-it",
    "scripts/build-skills-index.mjs",
    "scripts/build-index-json.mjs",
    "scripts/skill-tiers.mjs"
  ]) {
    const target = path.join(root, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.cpSync(path.join(repoRoot, relative), target, { recursive: true });
  }
  const result = spawnSync(process.execPath, [path.join(root, "scripts/build-skills-index.mjs")], {
    cwd: root,
    encoding: "utf8"
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"));
  return { root, manifest };
}

function entries(text) {
  return [...text.matchAll(/^- \[\*\*([^*]+)\*\*\]\(([^)]+)\) — (.+)$/gm)]
    .map(([, name, link, description]) => ({ name, link, description }));
}

test("skill discovery preserves complete canonical triggers, including long exclusions", (t) => {
  const { root, manifest } = generateFixture(t);
  const text = fs.readFileSync(path.join(root, "dist/claude/skills/_index.md"), "utf8");
  const listed = entries(text);
  const canonical = manifest.skills.filter((skill) => skill.source.startsWith("skills/do-it/"));
  assert.deepEqual(listed.map((entry) => entry.name).sort(), canonical.map((skill) => skill.name).sort());
  for (const skill of canonical) {
    const body = fs.readFileSync(path.join(root, skill.source, "SKILL.md"), "utf8");
    assert.equal(listed.find((entry) => entry.name === skill.name)?.description,
      parseFrontmatter(body).description, `${skill.name}: full canonical description`);
  }
  const audit = listed.find((entry) => entry.name === "do-it-audit");
  assert.ok(audit.description.length > 80, "regression fixture must exceed the old truncation limit");
  assert.match(audit.description, /not for ordinary diff review/);
  assert.doesNotMatch(text, /Skill tool/);
});

test("full and core index links open skill bodies in the manifest distribution layout", (t) => {
  const { root, manifest } = generateFixture(t);
  const installed = path.join(root, "installed");
  for (const skill of manifest.skills) {
    const target = path.join(installed, skill.target);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.cpSync(path.join(root, skill.source), target, { recursive: true });
  }
  const discovery = manifest.skills.find((skill) => skill.name === "do-it-skills-index");
  const fullIndex = path.join(installed, discovery.target);
  const coreIndex = path.join(path.dirname(fullIndex), "_index.core.md");
  fs.copyFileSync(path.join(root, "dist/claude/skills/_index.core.md"), coreIndex);
  for (const indexPath of [fullIndex, coreIndex]) {
    const listed = entries(fs.readFileSync(indexPath, "utf8"));
    assert.ok(listed.length > 0);
    if (indexPath === coreIndex) {
      assert.deepEqual(listed.map((entry) => entry.name).sort(), [...CORE_SKILLS].sort());
    }
    for (const entry of listed) {
      assert.ok(!path.isAbsolute(entry.link), `${entry.name}: relocatable link`);
      const bodyPath = path.resolve(path.dirname(indexPath), entry.link);
      const body = fs.readFileSync(bodyPath, "utf8");
      assert.equal(parseFrontmatter(body).name, entry.name);
      const skill = manifest.skills.find((skill) => skill.name === entry.name);
      assert.equal(bodyPath, path.join(installed, skill.target, "SKILL.md"));
    }
  }
});
