import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { generatePiAgents } from "../../scripts/build-pi-plugin.mjs";
import { parseAgentToml } from "../../scripts/lib/agent-source.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const sourceDir = path.join(root, "agents");
const outputDir = path.join(root, "plugins/do-it-pi/agents");

function fields(markdown) {
  const match = markdown.match(/^---\n([\s\S]*?)\n---\n/);
  assert.ok(match);
  return Object.fromEntries(match[1].split("\n").map((line) => {
    const colon = line.indexOf(":");
    return [line.slice(0, colon), line.slice(colon + 1).trim()];
  }));
}

test("Pi agents retain canonical semantics with reader/writer host profiles", () => {
  const sources = fs.readdirSync(sourceDir).filter((file) => file.endsWith(".toml")).sort();
  assert.deepEqual(fs.readdirSync(outputDir).filter((file) => file.endsWith(".md")).sort(),
    sources.map((file) => file.replace(/\.toml$/, ".md")));
  for (const file of sources) {
    const canonical = parseAgentToml(fs.readFileSync(path.join(sourceDir, file), "utf8"));
    const output = fs.readFileSync(path.join(outputDir, file.replace(/\.toml$/, ".md")), "utf8");
    const meta = fields(output);
    assert.equal(meta.name, canonical.name);
    assert.equal(JSON.parse(meta.description), canonical.description);
    assert.equal(output.split(canonical.developer_instructions.trimEnd()).length, 2, `${file}: specialist policy exactly once`);
    assert.equal(meta.package, "do-it");
    assert.equal(meta.systemPromptMode, "replace");
    assert.equal(meta.inheritProjectContext, "true");
    assert.equal(meta.inheritSkills, "false");
    const reader = canonical.sandbox_mode === "read-only";
    assert.equal(meta.tools, reader ? "read, bash, intercom" : "read, bash, edit, write, intercom");
    assert.equal(meta.acceptanceRole, reader ? "read-only" : "writer");
    assert.equal(meta.completionGuard, reader ? "false" : undefined);
    assert.equal(meta.defaultProgress, !reader || canonical.name === "code-mapper" ? "true" : undefined);
    assert.match(output, /safe supervisor target/);
    assert.match(output, /Do not send routine completion handoffs/);
    if (canonical.name === "code-mapper") {
      assert.match(output, /`intercom` with `action: "ask"`/);
      assert.match(output, /fast `scout`/);
    } else {
      assert.match(output, /`contact_supervisor` with `reason: "need_decision"`/);
      assert.match(output, /Fall back to generic `intercom`/);
      if (reader) assert.match(output, /Do not write `progress.md`/);
      else assert.match(output, /stay alive for the reply/);
    }
  }
});

test("checked-in Pi resources match a fresh generation from canonical sources", (t) => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "do-it-pi-parity-"));
  t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
  generatePiAgents(sourceDir, temp);
  for (const file of fs.readdirSync(temp)) {
    assert.equal(fs.readFileSync(path.join(outputDir, file), "utf8"),
      fs.readFileSync(path.join(temp, file), "utf8"), `${file}: regenerate Pi agents`);
  }
});

test("regeneration propagates canonical edits, removes drift, and rejects unsupported permissions before writing", (t) => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "do-it-pi-agents-"));
  t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
  const source = path.join(temp, "agents");
  const target = path.join(temp, "generated");
  fs.mkdirSync(source);
  const file = path.join(source, "example.toml");
  const canonical = 'name = "example"\ndescription = "Use when testing generation."\nsandbox_mode = "read-only"\ndeveloper_instructions = """Preserve the independently verified evidence. NOT_CHECKED."""\n';
  fs.writeFileSync(file, canonical);
  generatePiAgents(source, target);
  const generated = path.join(target, "example.md");
  assert.match(fs.readFileSync(generated, "utf8"), /Preserve the independently verified evidence/);
  fs.writeFileSync(generated, "manual drift");
  fs.writeFileSync(path.join(target, "retired.md"), "retired agent");
  fs.writeFileSync(file, canonical.replace("verified evidence", "verified counterevidence").replace("testing generation", "testing source changes"));
  generatePiAgents(source, target);
  const updated = fs.readFileSync(generated, "utf8");
  assert.match(updated, /verified counterevidence/);
  assert.match(updated, /testing source changes/);
  assert.doesNotMatch(updated, /manual drift|verified evidence/);
  assert.equal(fs.existsSync(path.join(target, "retired.md")), false);
  for (const mode of ["danger-full-access", "", "workspace-read"]) {
    fs.writeFileSync(file, canonical.replace('sandbox_mode = "read-only"', `sandbox_mode = "${mode}"`));
    assert.throws(() => generatePiAgents(source, target), /unsupported Pi agent sandbox_mode/);
    assert.equal(fs.readFileSync(generated, "utf8"), updated);
  }
  fs.writeFileSync(file, canonical.replace('name = "example"', 'name = "different"'));
  assert.throws(() => generatePiAgents(source, target), /name does not match source filename/);
  fs.writeFileSync(file, canonical.replace('sandbox_mode = "read-only"', 'sandbox_mode = "workspace-write"'));
  generatePiAgents(source, target);
  assert.equal(fields(fs.readFileSync(generated, "utf8")).acceptanceRole, "writer");
});
