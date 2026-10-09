import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { buildCoreContext, coreContextPath, renderCoreContext } from "../scripts/build-core-context.mjs";
import { validateCoreConsistency } from "../scripts/validate-core-consistency.mjs";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
test("generated Core and runtime copies match", () => {
  assert.deepEqual(validateCoreConsistency(root).errors, []);
});
test("generated consistency detects a changed Core copy", () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "do-it-consistency-"));
  try {
    for (const dir of ["hooks", "skills", "plugins"]) fs.cpSync(path.join(root, dir), path.join(temp, dir), { recursive: true, filter: (p) => !p.includes("node_modules") && !p.includes(".test-dist") });
    fs.appendFileSync(path.join(temp, "plugins/do-it/skills/do-it-core/SKILL.md"), "drift\n");
    assert.ok(validateCoreConsistency(temp).errors.some((error) => error.includes("do-it-core/SKILL.md") && error.includes("drifted")));
  } finally { fs.rmSync(temp, { recursive: true, force: true }); }
});

function contextFixture(t) {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "do-it-core-context-"));
  t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
  for (const dir of ["hooks", "skills"]) fs.cpSync(path.join(root, dir), path.join(temp, dir), { recursive: true });
  buildCoreContext(temp);
  return temp;
}

function contextErrors(temp) {
  return validateCoreConsistency(temp).errors.filter((error) => error.startsWith(`${coreContextPath}:`));
}

test("Core excerpt mutation changes generated context and stale or missing data is detected", (t) => {
  const temp = contextFixture(t);
  const core = path.join(temp, "skills/do-it/do-it-core/SKILL.md");
  const before = fs.readFileSync(path.join(temp, coreContextPath), "utf8");
  assert.deepEqual(contextErrors(temp), []);
  fs.writeFileSync(core, fs.readFileSync(core, "utf8").replace("Preserve the user's goal", "Preserve the user's intended outcome"));
  assert.match(contextErrors(temp).join("\n"), /stale/);
  buildCoreContext(temp);
  assert.notEqual(fs.readFileSync(path.join(temp, coreContextPath), "utf8"), before);
  assert.deepEqual(contextErrors(temp), []);
  fs.appendFileSync(core, "\nOptional thinking aid outside the excerpt.\n");
  assert.deepEqual(contextErrors(temp), []);
  fs.rmSync(path.join(temp, coreContextPath));
  assert.match(contextErrors(temp).join("\n"), /missing/);
});

test("Core excerpt markers must be unique, ordered, and nonempty", (t) => {
  const temp = contextFixture(t);
  const core = path.join(temp, "skills/do-it/do-it-core/SKILL.md");
  const start = "<!-- do-it:core-context:start -->";
  const end = "<!-- do-it:core-context:end -->";
  for (const invalid of ["No excerpt", `${start}one${end}${start}two${end}`, `${end}text${start}`, `${start} \n ${end}`]) {
    fs.writeFileSync(core, invalid);
    assert.throws(() => renderCoreContext(temp), /excerpt/);
  }
});

test("Core context delivery treats shell-like source as literal data and retries failed reads", (t) => {
  const temp = contextFixture(t);
  const core = path.join(temp, "skills/do-it/do-it-core/SKILL.md");
  const literal = 'User\'s "facts": $(touch EXECUTED) `touch EXECUTED` ${HOME} \\n; preserve evidence.';
  fs.writeFileSync(core, `<!-- do-it:core-context:start -->\n${literal}\n<!-- do-it:core-context:end -->\nOptional questions stay outside.\n`);
  buildCoreContext(temp);
  const expected = `Do-it: ${literal}`;
  const env = { ...process.env, DO_IT_HOOK_DATA: path.join(temp, "state") };
  for (const key of ["PI_SUBAGENT_CHILD", "CLAUDE_AGENT_CONTEXT", "CLAUDE_SUBAGENT"]) delete env[key];
  function collect(session, setup = "") {
    const result = spawnSync("bash", ["-euc", 'source "$1/hooks/lib/common.sh"; ' + setup + '; do_it_kernel_context_collect "$2"', "bash", temp, session], { cwd: temp, env, encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stderr, "");
    return result.stdout;
  }
  assert.equal(collect("literal", ":"), expected);
  assert.equal(collect("literal", ":"), "");
  assert.equal(fs.existsSync(path.join(temp, "EXECUTED")), false);
  const hook = spawnSync("bash", [path.join(temp, "hooks/kernel-context.sh")], {
    cwd: temp, env, encoding: "utf8",
    input: JSON.stringify({ session_id: "literal-json", cwd: temp, prompt: "review only" }),
  });
  assert.equal(hook.status, 0, hook.stderr);
  assert.equal(JSON.parse(hook.stdout).hookSpecificOutput.additionalContext, expected);
  assert.equal(fs.existsSync(path.join(temp, "EXECUTED")), false);
  // A failed read must not mark the context delivered; retry in the same session.
  assert.equal(collect("unreadable", "cat() { return 1; }"), "");
  assert.equal(collect("unreadable", ":"), expected);
  fs.rmSync(path.join(temp, coreContextPath));
  assert.equal(collect("missing", ":"), "");
  buildCoreContext(temp);
  assert.equal(collect("missing", ":"), expected);
  fs.writeFileSync(path.join(temp, coreContextPath), "");
  assert.equal(collect("empty", ":"), "");
  buildCoreContext(temp);
  assert.equal(collect("empty", ":"), expected);
});
