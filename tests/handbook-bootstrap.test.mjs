import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const skillPath = path.join(repoRoot, "skills/do-it/do-it-handbook/SKILL.md");
const contextSkillPath = path.join(repoRoot, "skills/do-it/do-it-context/SKILL.md");
const commandPath = path.join(repoRoot, "commands/do-it-handbook.md");
const templatesDir = path.join(repoRoot, "skills/do-it/do-it-handbook/templates");

const HANDBOOK_TEMPLATES = [
  "README.md",
  "invariants.md",
  "architecture.md",
  "glossary.md",
  "worklog-template.md"
];

const GOLDEN_RELATIVE_PATHS = [
  ".do-it/.gitignore",
  ".do-it/CONTEXT.md",
  ".do-it/handbook/README.md",
  ".do-it/handbook/architecture.md",
  ".do-it/handbook/glossary.md",
  ".do-it/handbook/invariants.md",
  ".do-it/handbook/worklog-template.md",
  ".do-it/plans/.gitkeep",
  ".do-it/worklog/.gitkeep"
].sort();

const FORBIDDEN_DIR_NAMES = ["brainstorm", "grill"];
const CHECKBOX = /-\s*\[[ xX]\]/;

function read(file) {
  assert.equal(fs.existsSync(file), true, `missing ${file}`);
  return fs.readFileSync(file, "utf8");
}

function extractGitignore(skillText) {
  const match = skillText.match(/```gitignore\n([\s\S]*?)```/);
  assert.ok(match, "SKILL.md must contain a gitignore fence for local runtime state");
  return match[1];
}

function writeIfMissing(abs, content) {
  if (fs.existsSync(abs)) return false;
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content);
  return true;
}

function bootstrapHandbook(dest) {
  const skillText = read(skillPath);
  const ignore = extractGitignore(skillText);
  const written = [];

  for (const name of HANDBOOK_TEMPLATES) {
    const rel = `.do-it/handbook/${name}`;
    if (writeIfMissing(path.join(dest, rel), read(path.join(templatesDir, name)))) {
      written.push(rel);
    }
  }

  const contextRel = ".do-it/CONTEXT.md";
  if (writeIfMissing(path.join(dest, contextRel), read(path.join(templatesDir, "CONTEXT.md")))) {
    written.push(contextRel);
  }

  for (const rel of [".do-it/worklog/.gitkeep", ".do-it/plans/.gitkeep"]) {
    if (writeIfMissing(path.join(dest, rel), "")) written.push(rel);
  }

  const ignoreRel = ".do-it/.gitignore";
  if (writeIfMissing(path.join(dest, ignoreRel), ignore)) written.push(ignoreRel);

  return written.sort();
}

function listRelativeFiles(root, dir = root, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      listRelativeFiles(root, abs, acc);
    } else {
      acc.push(path.relative(root, abs).split(path.sep).join("/"));
    }
  }
  return acc.sort();
}

function withTempProject(fn) {
  const dest = fs.mkdtempSync(path.join(os.tmpdir(), "do-it-handbook-"));
  try {
    return fn(dest);
  } finally {
    fs.rmSync(dest, { recursive: true, force: true });
  }
}

test("fresh init creates CONTEXT / handbook / worklog / plans only", () => {
  withTempProject((dest) => {
    const written = bootstrapHandbook(dest);
    const files = listRelativeFiles(dest);
    assert.deepEqual(files, GOLDEN_RELATIVE_PATHS);
    assert.deepEqual(written, GOLDEN_RELATIVE_PATHS);

    const ignore = read(path.join(dest, ".do-it/.gitignore"));
    assert.match(ignore, /^runtime\/$/m);
    assert.match(ignore, /^adaptive\/$/m);
    assert.match(ignore, /^events\/$/m);
    assert.match(ignore, /^sessions\/$/m);

    for (const name of FORBIDDEN_DIR_NAMES) {
      assert.equal(fs.existsSync(path.join(dest, ".do-it", name)), false, name);
    }
  });
});

test("init does not overwrite existing CONTEXT, handbook, or plan", () => {
  withTempProject((dest) => {
    const marker = "EXISTING-MUST-SURVIVE\n";
    writeIfMissing(path.join(dest, ".do-it/CONTEXT.md"), marker);
    writeIfMissing(path.join(dest, ".do-it/handbook/README.md"), marker);
    writeIfMissing(path.join(dest, ".do-it/plans/keep-me.md"), marker);
    writeIfMissing(path.join(dest, ".do-it/.gitignore"), "custom/\n");

    const written = bootstrapHandbook(dest);

    assert.equal(read(path.join(dest, ".do-it/CONTEXT.md")), marker);
    assert.equal(read(path.join(dest, ".do-it/handbook/README.md")), marker);
    assert.equal(read(path.join(dest, ".do-it/plans/keep-me.md")), marker);
    assert.equal(read(path.join(dest, ".do-it/.gitignore")), "custom/\n");
    assert.ok(!written.includes(".do-it/CONTEXT.md"));
    assert.ok(!written.includes(".do-it/handbook/README.md"));
    assert.ok(!written.includes(".do-it/.gitignore"));
    assert.ok(written.includes(".do-it/handbook/invariants.md"));
    assert.ok(written.includes(".do-it/plans/.gitkeep"));
  });
});

test("init leaves existing user brainstorm/grill content untouched", () => {
  withTempProject((dest) => {
    const grill = ".do-it/grill/old-task.md";
    const brainstorm = ".do-it/brainstorm/old-task.md";
    writeIfMissing(path.join(dest, grill), "user grill\n");
    writeIfMissing(path.join(dest, brainstorm), "user brainstorm\n");

    bootstrapHandbook(dest);

    assert.equal(read(path.join(dest, grill)), "user grill\n");
    assert.equal(read(path.join(dest, brainstorm)), "user brainstorm\n");
    assert.equal(fs.existsSync(path.join(dest, ".do-it/grill/.gitkeep")), false);
    assert.equal(fs.existsSync(path.join(dest, ".do-it/brainstorm/.gitkeep")), false);
  });
});

test("handbook skill, command, and templates agree on bootstrap contract", () => {
  const skill = read(skillPath);
  const command = read(commandPath);
  const context = read(contextSkillPath);
  const templateReadme = read(path.join(templatesDir, "README.md"));
  const templateWorklog = read(path.join(templatesDir, "worklog-template.md"));
  const ignore = extractGitignore(skill);

  for (const text of [skill, command, context]) {
    assert.match(text, /CONTEXT/);
    assert.match(text, /handbook/);
    assert.match(text, /worklog/);
    assert.match(text, /plans/);
    assert.doesNotMatch(text, /Add a `\.gitkeep` to `\.do-it\/brainstorm\/`/);
    assert.doesNotMatch(text, /creates the full directory tree \(handbook,\s*worklog, brainstorm, grill, plans\)/);
  }

  assert.match(skill, /Do not create `\.do-it\/brainstorm\/` or `\.do-it\/grill\/`/);
  assert.match(skill, /never overwrite an existing `CONTEXT\.md`/);
  assert.match(skill, /Never overwrite an existing plan/);
  assert.match(skill, /execution contracts/);
  assert.match(skill, /Goal \/ Decisions \/ Boundary \/ Acceptance/);
  assert.match(skill, /put progress checkboxes into plans/);
  assert.match(skill, /task-contract\.md/);
  assert.match(ignore, /runtime\//);
  assert.match(ignore, /adaptive\//);
  assert.match(ignore, /events\//);
  assert.match(ignore, /sessions\//);

  assert.match(command, /不要创建/);
  assert.match(command, /brainstorm/);
  assert.match(command, /grill/);
  assert.match(command, /绝不覆盖/);
  assert.match(command, /execution contract/);

  assert.match(context, /Project truth ≠ task state ≠ adaptive profile/);
  assert.match(context, /does not\s+create brainstorm\/grill/);
  assert.match(context, /never overwrites an existing `CONTEXT\.md`/);

  for (const text of [templateReadme, templateWorklog]) {
    assert.match(text, /execution contracts/i);
    assert.match(text, /Goal[,/ ]+Decisions[,/ ]+Boundary[,/\s]+Acceptance/);
    assert.doesNotMatch(text, CHECKBOX);
    assert.doesNotMatch(text, /brainstorm/);
    assert.doesNotMatch(text, /grill/);
  }
});

test("this repo does not ship empty brainstorm/grill gitkeeps", () => {
  assert.equal(fs.existsSync(path.join(repoRoot, ".do-it/brainstorm/.gitkeep")), false);
  assert.equal(fs.existsSync(path.join(repoRoot, ".do-it/grill/.gitkeep")), false);
});
