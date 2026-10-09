import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const manifest = JSON.parse(fs.readFileSync(path.join(repo, "manifest.json"), "utf8"));
const agent = manifest.agents[0].name;
const target = `agents/${agent}.toml`;
const source = fs.readFileSync(path.join(repo, "agents", `${agent}.toml`), "utf8");
const hash = (text) => crypto.createHash("sha256").update(text).digest("hex");
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "do-it-native-agents-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}
function run(root, command = "setup", extra = [], env = {}) {
  return spawnSync(process.execPath, [path.join(repo, "bin/do-it.mjs"), command, "--target=codex", "--only=agents", ...extra], {
    encoding: "utf8", env: { ...process.env, HOME: root, CODEX_HOME: root, DO_IT_FORCE: "0", ...env }
  });
}
function put(root, name, content) {
  const dest = path.join(root, name);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, content);
}
function state(root) {
  return JSON.parse(fs.readFileSync(path.join(root, ".do-it-install-state.json"), "utf8"));
}
function seedState(root, content, extra = {}) {
  put(root, ".do-it-install-state.json", JSON.stringify({ version: "0.17.0", entries: {
    [target]: { kind: "agent", name: agent, hash: hash(content) }, ...extra
  } }));
}

test("agent-only setup delivers native roles, is repeatable, and owns no skills/hooks", (t) => {
  const root = fixture(t);
  put(root, "config.toml", '[agents]\nmax_threads = 3\n');
  for (let attempt = 0; attempt < 2; attempt++) {
    const result = run(root);
    assert.equal(result.status, 0, result.stderr + result.stdout);
    assert.match(result.stdout, /plugin cache files do not establish role availability/);
    assert.equal(fs.readFileSync(path.join(root, target), "utf8"), source);
    assert.deepEqual(Object.keys(state(root).entries).sort(), manifest.agents.map(({ name }) => `agents/${name}.toml`).sort());
  }
  assert.equal(fs.existsSync(path.join(root, "skills")), false);
  assert.equal(fs.existsSync(path.join(root, "hooks")), false);
  assert.equal(fs.readFileSync(path.join(root, "config.toml"), "utf8"), '[agents]\nmax_threads = 3\n');
});

test("agent-only update uses old owned hashes and preserves unrelated state and retired skills", (t) => {
  const root = fixture(t);
  const old = `${source}\n# old managed version\n`;
  put(root, target, old);
  const skill = { kind: "skill", name: "do-it-core", hash: "existing-proof" };
  seedState(root, old, { "skills/do-it-core": skill });
  put(root, "skills/do-it-planning/SKILL.md", "personal edit");
  const result = run(root);
  assert.equal(result.status, 0, result.stderr + result.stdout);
  assert.equal(fs.readFileSync(path.join(root, target), "utf8"), source);
  assert.deepEqual(state(root).entries["skills/do-it-core"], skill);
  assert.equal(state(root).version, "0.17.0", "partial update must preserve pending full-install migrations");
  assert.equal(fs.readFileSync(path.join(root, "skills/do-it-planning/SKILL.md"), "utf8"), "personal edit");
});

for (const variant of ["unowned", "identical-unowned", "modified-owned", "wrong-owner", "symlink", "directory"]) {
  test(`agent-only install preserves ${variant} target even with force`, (t) => {
    const root = fixture(t);
    put(root, target, variant === "identical-unowned" ? source : "personal content");
    if (variant === "modified-owned") seedState(root, source);
    if (variant === "wrong-owner") {
      seedState(root, "personal content", { [target]: { kind: "skill", name: "other", hash: hash("personal content") } });
    }
    if (variant === "symlink" || variant === "directory") {
      fs.unlinkSync(path.join(root, target));
      if (variant === "directory") fs.mkdirSync(path.join(root, target));
      else {
        put(root, "outside.toml", source);
        fs.symlinkSync(path.join(root, "outside.toml"), path.join(root, target));
      }
    }
    const result = run(root, "install", [], { DO_IT_FORCE: "1" });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Refusing/);
    assert.equal(fs.existsSync(path.join(root, "skills")), false);
    if (variant === "symlink") assert.ok(fs.lstatSync(path.join(root, target)).isSymbolicLink());
    else if (variant === "directory") assert.ok(fs.lstatSync(path.join(root, target)).isDirectory());
    else assert.equal(fs.readFileSync(path.join(root, target), "utf8"), variant === "identical-unowned" ? source : "personal content");
  });
}

for (const config of [
  `[agents.${agent}]\ndescription = "mine"\n`,
  `[agents.'${agent}']\ndescription = "mine"\n`,
  `agents = { "${agent}" = { description = "mine" } }\n`,
  `["agents"."${agent.replace(/-/g, "\\u002d")}"]\ndescription = "mine"\n`,
  `[agents.personal]\nconfig_file = "agents/${agent}.toml"\n`,
  `agents.personal.config_file = "agents/../agents/${agent}.toml"\n`,
  `agents = { personal = { config_file = "agents/${agent}.toml" } }\n`,
  `[agents."${agent}"]\ndescription = '''mine'''\n`,
  `[agents.personal]\nconfig_file = """\nagents/${agent}.toml"""\n`,
  `[agents.personal]\n"config\\u005ffile" = 'agents/${agent}.toml'\n`,
  '[agents.personal]\nconfig_file = "external.toml"\nconfig_file = "second.toml"\n',
  '[agents.personal]\ndescription = "first"\n[agents.personal]\ndescription = "second"\n',
  `[agents.personal]\nconfig_file = ["external.toml"]\n`,
  `agents.${agent} = true\n`,
  `agents = { "${agent}" = 8 }\n`,
  '[agents]\npersonal = [{ config_file = "external.toml" }]\n',
  'agents.personal = []\n',
  'agents = true\n',
  '[agents]\nenabled = true\nenabled = false\n',
  `[[agents.personal]]\nconfig_file = "external.toml"\n`,
  `[agents.personal\nconfig_file = "external.toml"\n`
]) {
  test(`agent-only install refuses config collision: ${config.split("\n")[0]}`, (t) => {
    const root = fixture(t);
    put(root, "config.toml", config);
    const result = run(root);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /role conflict/);
    assert.equal(fs.existsSync(path.join(root, "agents")), false);
    assert.equal(fs.readFileSync(path.join(root, "config.toml"), "utf8"), config);
  });
  test(`doctor refuses config collision: ${config.split("\n")[0]}`, (t) => {
    const root = fixture(t);
    assert.equal(run(root).status, 0);
    const before = fs.readFileSync(path.join(root, ".do-it-install-state.json"), "utf8");
    put(root, "config.toml", config);
    const result = run(root, "doctor");
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /role conflict/);
    assert.equal(fs.readFileSync(path.join(root, target), "utf8"), source);
    assert.equal(fs.readFileSync(path.join(root, ".do-it-install-state.json"), "utf8"), before);
    assert.equal(fs.readFileSync(path.join(root, "config.toml"), "utf8"), config);
  });
}

const harmlessConfigs = [
  '[agents]\nenabled = true\nmax_concurrent_threads_per_session = 8\n',
  'agents.enabled = true\nagents.max_concurrent_threads_per_session = 8\n',
  'agents = { enabled = true, max_concurrent_threads_per_session = 8 }\n',
  '# Ask a reviewer before merging; config_file is optional\n',
  "developer_instructions = 'Use a reviewer before merging'\n",
  'developer_instructions = """Use a reviewer.\n[agents.reviewer]\nconfig_file = \\"agents/reviewer.toml\\"\n"""\n',
  "developer_instructions = '''Use a reviewer.\n[agents.reviewer]\n'''\n",
  '[agents.personal]\nconfig_file = "external.toml" # reviewer\ndescription = "Use a reviewer"\n',
  'agents.personal.config_file = "external.toml"\n',
  'agents = { personal = { config_file = "external.toml", description = "reviewer" } }\n',
  '["ag\\u0065nts"."personal"]\n"config\\u005ffile" = "external.toml"\n',
  'developer_instructions = "Ask a \\"reviewer\\"; [agents.reviewer]"\n',
  'developer_instructions = """Use a reviewer and end with a quote: """"\n',
  "developer_instructions = '''Use a reviewer and two quotes: '''''\n"
];
for (const [index, config] of harmlessConfigs.entries()) {
  test(`unrelated TOML content permits native install and doctor (${index})`, (t) => {
    const root = fixture(t);
    put(root, "config.toml", config);
    const install = run(root, "install");
    assert.equal(install.status, 0, install.stderr + install.stdout);
    assert.equal(fs.readFileSync(path.join(root, target), "utf8"), source);
    const before = fs.readFileSync(path.join(root, ".do-it-install-state.json"), "utf8");
    const doctor = run(root, "doctor");
    assert.equal(doctor.status, 0, doctor.stderr + doctor.stdout);
    assert.equal(fs.readFileSync(path.join(root, "config.toml"), "utf8"), config);
    assert.equal(fs.readFileSync(path.join(root, ".do-it-install-state.json"), "utf8"), before);
  });
  test(`doctor accepts unrelated TOML added after native install (${index})`, (t) => {
    const root = fixture(t);
    assert.equal(run(root).status, 0);
    put(root, "config.toml", config);
    const result = run(root, "doctor");
    assert.equal(result.status, 0, result.stderr + result.stdout);
  });
}

for (const command of ["install", "doctor"]) {
  test(`${command} refuses a missing canonical file reached through a symlink alias without writes`, (t) => {
    const root = fixture(t);
    fs.mkdirSync(path.join(root, "agents"));
    fs.symlinkSync("agents", path.join(root, "aliases"));
    const config = '[agents.personal]\nconfig_file = "aliases/reviewer.toml"\n';
    const previous = JSON.stringify({ version: "0.17.0", entries: {} });
    put(root, "config.toml", config);
    put(root, ".do-it-install-state.json", previous);
    const before = fs.readdirSync(root).sort();
    const result = run(root, command);
    assert.notEqual(result.status, 0, result.stdout);
    assert.match(result.stderr, /role conflict/);
    assert.deepEqual(fs.readdirSync(path.join(root, "agents")), []);
    assert.deepEqual(fs.readdirSync(root).sort(), before);
    assert.equal(fs.readlinkSync(path.join(root, "aliases")), "agents");
    assert.equal(fs.readFileSync(path.join(root, "config.toml"), "utf8"), config);
    assert.equal(fs.readFileSync(path.join(root, ".do-it-install-state.json"), "utf8"), previous);
  });
}

const harmlessNativeRoles = [
  `"name" = 'personal'\ndeveloper_instructions = '''example\nname="reviewer"\n'''\n`,
  `"na\\u006de" = "pers\\u006fnal"\ndeveloper_instructions = """example\nname='reviewer'\n"""\n`,
  `name = 'personal'\n[metadata]\nname = 'reviewer'\n`,
  `name = 'revi\\u0065wer'\ndeveloper_instructions = 'literal escapes are not decoded'\n`
];
const ambiguousNativeRoles = [
  `"na\\u006de" = "revi\\u0065wer"\n`,
  `name = """\nreviewer"""\n`,
  `developer_instructions = '''example\nname="personal"\n'''\n`,
  `[metadata]\nname = 'personal'\n`,
  `name = 'personal'\n"name" = 'second'\n`,
  `name = ['personal']\n`,
  `name = { value = 'personal' }\n`
];
for (const command of ["install", "doctor"]) {
  for (const [index, content] of harmlessNativeRoles.entries()) {
    test(`${command} ignores native instruction text and nested names (${index})`, (t) => {
      const root = fixture(t);
      if (command === "doctor") assert.equal(run(root).status, 0);
      put(root, "agents/personal.toml", content);
      const result = run(root, command);
      assert.equal(result.status, 0, result.stderr + result.stdout);
      assert.equal(fs.readFileSync(path.join(root, "agents/personal.toml"), "utf8"), content);
    });
  }
  for (const [index, content] of ambiguousNativeRoles.entries()) {
    test(`${command} refuses conflicting or ambiguous top-level native names (${index})`, (t) => {
      const root = fixture(t);
      if (command === "doctor") assert.equal(run(root).status, 0);
      put(root, "agents/personal.toml", content);
      const previous = fs.existsSync(path.join(root, ".do-it-install-state.json"))
        ? fs.readFileSync(path.join(root, ".do-it-install-state.json"), "utf8") : null;
      const result = run(root, command);
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /role conflict|unique native role name/);
      assert.equal(fs.readFileSync(path.join(root, "agents/personal.toml"), "utf8"), content);
      if (previous === null) {
        assert.equal(fs.existsSync(path.join(root, target)), false);
        assert.equal(fs.existsSync(path.join(root, ".do-it-install-state.json")), false);
      } else assert.equal(fs.readFileSync(path.join(root, ".do-it-install-state.json"), "utf8"), previous);
    });
  }
}

test("different filename with the same native role name blocks install and doctor", (t) => {
  const root = fixture(t);
  assert.equal(run(root).status, 0);
  put(root, "agents/personal.toml", `name = '${agent}'\ndescription = 'mine'\n`);
  assert.notEqual(run(root, "install").status, 0);
  const result = run(root, "doctor");
  assert.equal(result.status, 1);
  assert.match(result.stderr, /role conflict/);
});

test("nested native role files participate in duplicate detection", (t) => {
  const root = fixture(t);
  put(root, "agents/team/personal.toml", `name = '${agent}'\n`);
  const result = run(root);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /role conflict/);
  assert.equal(fs.existsSync(path.join(root, target)), false);
});

test("unrelated native role survives agent-only installation", (t) => {
  const root = fixture(t);
  const personal = "name = 'personal'\ndescription = 'mine'\n";
  put(root, "agents/team/personal.toml", personal);
  assert.equal(run(root).status, 0);
  assert.equal(fs.readFileSync(path.join(root, "agents/team/personal.toml"), "utf8"), personal);
});

for (const existing of [false, true]) {
  test(`native install and doctor permit a directory alias ancestor (existing root: ${existing})`, (t) => {
    const base = fixture(t);
    const physical = path.join(base, "physical");
    const alias = path.join(base, "alias");
    fs.mkdirSync(physical);
    fs.symlinkSync(physical, alias, process.platform === "win32" ? "junction" : "dir");
    const root = path.join(alias, "codex");
    if (existing) fs.mkdirSync(root);
    for (const command of ["setup", "doctor"]) {
      const result = run(root, command);
      assert.equal(result.status, 0, result.stderr + result.stdout);
    }
    assert.equal(fs.readFileSync(path.join(physical, "codex", target), "utf8"), source);
    assert.ok(fs.lstatSync(alias).isSymbolicLink());
  });
}

test("native install rejects a symlink or junction at the managed root without writes", (t) => {
  const base = fixture(t);
  const physical = path.join(base, "physical");
  const root = path.join(base, "codex");
  fs.mkdirSync(physical);
  fs.symlinkSync(physical, root, process.platform === "win32" ? "junction" : "dir");
  const result = run(root);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Refusing non-directory or symlink install root component/);
  assert.deepEqual(fs.readdirSync(physical), []);
  assert.ok(fs.lstatSync(root).isSymbolicLink());
});

test("native install beneath an ancestor alias still rejects physical config_file aliases", (t) => {
  const base = fixture(t);
  const physical = path.join(base, "physical");
  const alias = path.join(base, "alias");
  fs.mkdirSync(physical);
  fs.symlinkSync(physical, alias, process.platform === "win32" ? "junction" : "dir");
  const root = path.join(alias, "codex");
  const config = `[agents.personal]\nconfig_file = ${JSON.stringify(path.join(physical, "codex", target))}\n`;
  put(root, "config.toml", config);
  const result = run(root);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /role conflict/);
  assert.deepEqual(fs.readdirSync(root), ["config.toml"]);
  assert.equal(fs.readFileSync(path.join(root, "config.toml"), "utf8"), config);
});

test("agent-only install refuses symlink agent directory and corrupt state", (t) => {
  const root = fixture(t);
  const outside = fixture(t);
  fs.symlinkSync(outside, path.join(root, "agents"));
  assert.notEqual(run(root).status, 0);
  assert.deepEqual(fs.readdirSync(outside), []);
  fs.unlinkSync(path.join(root, "agents"));
  put(root, ".do-it-install-state.json", "invalid JSON");
  assert.notEqual(run(root).status, 0);
  assert.equal(fs.readFileSync(path.join(root, ".do-it-install-state.json"), "utf8"), "invalid JSON");
});

test("doctor requires native files even when the complete agent bundle is cached", (t) => {
  const root = fixture(t);
  const cache = path.join(root, "plugins/cache/tdwhere-do-it/do-it", manifest.version, "agents");
  fs.cpSync(path.join(repo, "agents"), cache, { recursive: true });
  const result = run(root, "doctor");
  assert.equal(result.status, 1);
  assert.match(result.stdout, /MISSING agent:/);
});

test("retired cleanup preserves current native agents and their ownership without a plugin", (t) => {
  const root = fixture(t);
  assert.equal(run(root).status, 0);
  const retired = "agents/architect-reviewer.toml";
  const retiredContent = 'name = "architect-reviewer"\n';
  put(root, retired, retiredContent);
  const previous = state(root);
  previous.entries[retired] = { kind: "agent", name: "architect-reviewer", hash: hash(retiredContent) };
  put(root, ".do-it-install-state.json", JSON.stringify(previous));
  const result = spawnSync(process.execPath, [path.join(repo, "bin/do-it.mjs"), "migrate-legacy", "--apply", "--target=codex"], {
    encoding: "utf8", env: { ...process.env, HOME: root, CODEX_HOME: root }
  });
  assert.equal(result.status, 0, result.stderr + result.stdout);
  assert.equal(fs.existsSync(path.join(root, retired)), false);
  assert.equal(fs.readFileSync(path.join(root, target), "utf8"), source);
  assert.deepEqual(state(root).entries[target], previous.entries[target]);
  assert.ok(fs.existsSync(path.join(root, ".do-it-legacy-migration-backups")));
});

test("agent-only update preserves a modified retired role even with force", (t) => {
  const root = fixture(t);
  assert.equal(run(root).status, 0);
  const retired = "agents/architect-reviewer.toml";
  const content = 'name = "architect-reviewer"\n# personal edits\n';
  put(root, retired, content);
  const before = fs.readFileSync(path.join(root, ".do-it-install-state.json"), "utf8");
  const result = run(root, "install", [], { DO_IT_FORCE: "1" });
  assert.notEqual(result.status, 0);
  assert.equal(fs.readFileSync(path.join(root, retired), "utf8"), content);
  assert.equal(fs.readFileSync(path.join(root, ".do-it-install-state.json"), "utf8"), before);
});

test("doctor session lookup follows retained host precedence and ignores retired variables", (t) => {
  const root = fixture(t);
  assert.equal(run(root).status, 0);
  const variables = ["CURSOR_PLUGIN_DATA", "CLAUDE_PLUGIN_DATA", "PLUGIN_DATA", "DO_IT_HOOK_DATA"];
  const env = Object.fromEntries(variables.map((name) => [name, path.join(root, name)]));
  env.OPENCODE_DATA = path.join(root, "retired-opencode");
  env.KIMI_CODE_HOME = path.join(root, "retired-kimi");
  for (const name of [...variables, "CODEX_HOME"]) {
    const sessionDir = name === "CODEX_HOME" ? path.join(root, "do-it-data/sessions/probe") : path.join(env[name], "sessions/probe");
    put(root, path.relative(root, path.join(sessionDir, "state.json")), JSON.stringify({ marker: name }));
    const result = run(root, "doctor", ["--session=probe"], env);
    assert.equal(result.status, 0, result.stderr);
    assert.ok(result.stdout.includes(`"marker": "${name}"`), result.stdout);
    env[name] = "";
  }
  const tmpSession = "do-it-sessions/probe/state.json";
  put(root, tmpSession, JSON.stringify({ marker: "temporary-fallback" }));
  const fallback = run(root, "doctor", ["--session=probe"], { ...env, TMPDIR: root });
  assert.ok(fallback.stdout.includes('"marker": "temporary-fallback"'), fallback.stdout);
});

test("agent-only install rolls back native files and ownership state on a commit failure", (t) => {
  const root = fixture(t);
  assert.equal(run(root).status, 0);
  const before = fs.readFileSync(path.join(root, ".do-it-install-state.json"), "utf8");
  put(root, "fail-state.cjs", `const fs = require('node:fs');
const rename = fs.renameSync;
fs.renameSync = function(from, to) {
  if (String(from).includes('.do-it-state-')) throw new Error('injected state commit failure');
  return rename.apply(this, arguments);
};\n`);
  const result = run(root, "install", [], { NODE_OPTIONS: `--require=${path.join(root, "fail-state.cjs")}` });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /injected state commit failure/);
  assert.equal(fs.readFileSync(path.join(root, ".do-it-install-state.json"), "utf8"), before);
  assert.equal(fs.readFileSync(path.join(root, target), "utf8"), source);
});
