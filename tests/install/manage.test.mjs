// Tests for the install-state migration logic (install/migrate.mjs) and the
// end-to-end install flow (install/manage.mjs).
//
// Unit tests import migrate.mjs directly — no process/argv/manifest coupling.
// Integration tests spawn manage.mjs as a subprocess into throwaway install
// roots, which is also how the two host targets are exercised independently.

import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import {
  parseMinor,
  matchesFromRange,
  needsMigration,
  applyMigrationAction,
  applyMatchingMigrations
} from "../../install/migrate.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const manifest = JSON.parse(
  fs.readFileSync(path.join(repoRoot, "manifest.json"), "utf8")
);
const MANIFEST_VERSION = manifest.version;
const CODEX_PLUGIN_VERSION = JSON.parse(
  fs.readFileSync(
    path.join(repoRoot, "plugins", "do-it", ".codex-plugin", "plugin.json"),
    "utf8"
  )
).version;

const noop = () => {};

// --- parseMinor -----------------------------------------------------------

test("parseMinor extracts major.minor", () => {
  assert.equal(parseMinor("0.8.0"), "0.8");
  assert.equal(parseMinor("1.12.7"), "1.12");
  assert.equal(parseMinor("0.8"), "0.8");
});

test("parseMinor rejects non-version input", () => {
  assert.equal(parseMinor(""), null);
  assert.equal(parseMinor("vNext"), null);
  assert.equal(parseMinor(undefined), null);
  assert.equal(parseMinor(42), null);
});

// --- matchesFromRange -----------------------------------------------------

test("matchesFromRange matches minor wildcard and exact", () => {
  assert.equal(matchesFromRange("0.7.x", "0.7.3"), true);
  assert.equal(matchesFromRange("0.7.x", "0.7.0"), true);
  assert.equal(matchesFromRange("0.7.3", "0.7.3"), true);
  assert.equal(matchesFromRange("0.7.x", "0.8.0"), false);
  assert.equal(matchesFromRange("0.7.x", "0.70.0"), false);
  assert.equal(matchesFromRange("", "0.7.3"), false);
  assert.equal(matchesFromRange("0.7.x", ""), false);
});

// --- needsMigration -------------------------------------------------------

test("needsMigration is true only on a minor difference", () => {
  assert.equal(needsMigration({ version: "0.7.3" }, "0.9.0"), true);
  assert.equal(needsMigration({ version: "0.8.0" }, "0.9.0"), true);
  assert.equal(needsMigration({ version: "0.9.0" }, "0.9.0"), false);
  // Patch-only difference does not migrate.
  assert.equal(needsMigration({ version: "0.9.0" }, "0.9.1"), false);
});

test("needsMigration is false for missing or malformed state", () => {
  assert.equal(needsMigration(null, "0.9.0"), false);
  assert.equal(needsMigration({}, "0.9.0"), false);
  assert.equal(needsMigration({ version: "" }, "0.9.0"), false);
  assert.equal(needsMigration({ version: "garbage" }, "0.9.0"), false);
});

// --- applyMigrationAction -------------------------------------------------

test("applyMigrationAction remove-state-entry deletes the key", () => {
  const state = { entries: { "skills/old": { kind: "skill" } } };
  applyMigrationAction(
    { type: "remove-state-entry", target: "skills/old" },
    state,
    noop
  );
  assert.deepEqual(state.entries, {});
});

test("applyMigrationAction rename-state-key moves the value", () => {
  const state = { entries: { "skills/old": { kind: "skill", name: "old" } } };
  applyMigrationAction(
    { type: "rename-state-key", from: "skills/old", to: "skills/new" },
    state,
    noop
  );
  assert.equal(state.entries["skills/old"], undefined);
  assert.deepEqual(state.entries["skills/new"], { kind: "skill", name: "old" });
});

test("applyMigrationAction throws on an unknown action type", () => {
  assert.throws(
    () => applyMigrationAction({ type: "explode" }, { entries: {} }, noop),
    /unknown migration action/
  );
});

// --- applyMatchingMigrations ----------------------------------------------

test("applyMatchingMigrations applies only matching ranges", () => {
  const migrations = [
    {
      from: "0.7.x",
      actions: [{ type: "remove-state-entry", target: "skills/a" }]
    },
    {
      from: "0.8.x",
      actions: [{ type: "remove-state-entry", target: "skills/b" }]
    }
  ];
  const state = {
    entries: { "skills/a": {}, "skills/b": {}, "skills/c": {} }
  };
  applyMatchingMigrations(state, migrations, "0.7.3", noop);
  assert.deepEqual(Object.keys(state.entries).sort(), ["skills/b", "skills/c"]);
});

test("applyMatchingMigrations tolerates a missing migrations array", () => {
  const state = { entries: {} };
  assert.doesNotThrow(() => applyMatchingMigrations(state, undefined, "0.7.0", noop));
});

test("bundled manifest migrations cover 0.7.x and 0.8.x", () => {
  const froms = (manifest.migrations ?? []).map((m) => m.from);
  assert.ok(froms.includes("0.7.x"), "manifest should carry a 0.7.x migration");
  assert.ok(froms.includes("0.8.x"), "manifest should carry a 0.8.x migration");
  assert.ok(froms.includes("0.9.x"), "manifest should carry a 0.9.x migration");
});

// --- integration: install flow -------------------------------------------

function runManageAt(packageRoot, args, env) {
  return spawnSync(process.execPath, [path.join(packageRoot, "install", "manage.mjs"), ...args], {
    cwd: packageRoot,
    env: { ...process.env, ...env },
    encoding: "utf8"
  });
}

function runManage(args, env) {
  return runManageAt(repoRoot, args, env);
}

function freshRoot(label) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `do-it-${label}-`));
}

function writeDoItPluginConfig(root) {
  fs.writeFileSync(
    path.join(root, "config.toml"),
    ['[plugins."do-it@tdwhere-do-it"]', "enabled = true", ""].join("\n")
  );
}

function enableDoItPlugin(
  root,
  {
    sourceRoot = path.join(repoRoot, "plugins", "do-it"),
    version = CODEX_PLUGIN_VERSION
  } = {}
) {
  writeDoItPluginConfig(root);
  const bundleRoot = path.join(
    root,
    "plugins",
    "cache",
    "tdwhere-do-it",
    "do-it",
    version
  );
  fs.mkdirSync(path.join(bundleRoot, ".codex-plugin"), { recursive: true });
  fs.copyFileSync(
    path.join(sourceRoot, ".codex-plugin", "plugin.json"),
    path.join(bundleRoot, ".codex-plugin", "plugin.json")
  );
  fs.cpSync(path.join(sourceRoot, "agents"), path.join(bundleRoot, "agents"), {
    recursive: true
  });
}

function createCachebusterPackageFixture(root) {
  const packageRoot = path.join(root, "cachebuster-package");
  for (const entry of ["install", "scripts", "agents", "manifest.json"]) {
    fs.cpSync(path.join(repoRoot, entry), path.join(packageRoot, entry), {
      recursive: entry !== "manifest.json"
    });
  }
  fs.cpSync(
    path.join(repoRoot, "plugins", "do-it"),
    path.join(packageRoot, "plugins", "do-it"),
    { recursive: true }
  );

  const pluginManifestPath = path.join(
    packageRoot,
    "plugins",
    "do-it",
    ".codex-plugin",
    "plugin.json"
  );
  const pluginManifest = JSON.parse(fs.readFileSync(pluginManifestPath, "utf8"));
  pluginManifest.version = `${MANIFEST_VERSION}+codex.test-cachebuster`;
  fs.writeFileSync(pluginManifestPath, `${JSON.stringify(pluginManifest, null, 2)}\n`);

  return { packageRoot, pluginVersion: pluginManifest.version };
}

function legacyCanonicalAgentContent(name = "code-mapper") {
  return [
    `name = "${name}"`,
    'developer_instructions = """Dispatch (required from parent prompt):',
    "- return status: DONE | NEEDS_CONTEXT | BLOCKED",
    "Full dispatch contract: see `do-it-subagent-orchestration` § Required Prompt Contract.",
    '"""',
    ""
  ].join("\n");
}

function canonicalAgentContent(name = "code-mapper") {
  return fs.readFileSync(path.join(repoRoot, "agents", `${name}.toml`), "utf8");
}

function fileHash(content) {
  return crypto.createHash("sha256").update(content).digest("hex");
}

function writeLegacyState(root, entries) {
  fs.writeFileSync(
    path.join(root, ".do-it-install-state.json"),
    `${JSON.stringify({ version: MANIFEST_VERSION, entries }, null, 2)}\n`
  );
}

test("install populates a fresh codex root with a versioned state file", () => {
  const root = freshRoot("codex");
  try {
    const result = runManage(["install"], { CODEX_HOME: root });
    assert.equal(result.status, 0, result.stderr);

    const statePath = path.join(root, ".do-it-install-state.json");
    assert.ok(fs.existsSync(statePath), "state file should exist after install");
    const state = JSON.parse(fs.readFileSync(statePath, "utf8"));
    assert.equal(state.version, MANIFEST_VERSION);
    assert.ok(Object.keys(state.entries).length > 0, "state should record entries");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("Codex legacy install leaves canonical agents to the marketplace plugin", () => {
  const root = freshRoot("codex-plugin-agents");
  try {
    assert.equal(
      manifest.targets.codex.installAgents,
      false,
      "manifest must make the plugin the only canonical Codex agent source"
    );
    const result = runManage(["install"], { CODEX_HOME: root });
    assert.equal(result.status, 0, result.stderr);
    assert.ok(
      !fs.existsSync(path.join(root, "agents", "code-mapper.toml")),
      "optional global install must not recreate plugin-owned agents"
    );
    const state = JSON.parse(
      fs.readFileSync(path.join(root, ".do-it-install-state.json"), "utf8")
    );
    assert.ok(
      !Object.keys(state.entries).some((target) => target.startsWith("agents/")),
      "install state must not claim plugin-owned canonical agents"
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("install falls back to copy when staged rename crosses filesystems", () => {
  const root = freshRoot("codex-exdev");
  const preloadPath = path.join(root, "force-exdev.cjs");

  fs.writeFileSync(
    preloadPath,
    [
      'const fs = require("node:fs");',
      "const originalRenameSync = fs.renameSync;",
      "fs.renameSync = function renameSync(from, to) {",
      '  if (String(from).includes(".do-it-install-staging-")) {',
      '    const error = new Error("forced EXDEV for staged install rename");',
      '    error.code = "EXDEV";',
      "    throw error;",
      "  }",
      "  return originalRenameSync.apply(this, arguments);",
      "};",
      ""
    ].join("\n")
  );

  try {
    const result = runManage(["install"], {
      CODEX_HOME: root,
      NODE_OPTIONS: `--require=${preloadPath}`
    });
    assert.equal(result.status, 0, result.stderr);
    assert.ok(
      fs.existsSync(path.join(root, "skills", "do-it-router", "SKILL.md")),
      "skill directory should be copied into place after EXDEV"
    );
    assert.ok(
      !fs.readdirSync(root).some((name) => name.startsWith(".do-it-install-staging-")),
      "staging directory should be cleaned after EXDEV fallback"
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("re-install from an older state version triggers a backed-up migration", () => {
  const root = freshRoot("codex-migrate");
  try {
    assert.equal(runManage(["install"], { CODEX_HOME: root }).status, 0);

    const statePath = path.join(root, ".do-it-install-state.json");
    const state = JSON.parse(fs.readFileSync(statePath, "utf8"));
    state.version = "0.7.0";
    fs.writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`);

    const result = runManage(["install"], { CODEX_HOME: root });
    assert.equal(result.status, 0, result.stderr);
    assert.ok(
      fs.existsSync(`${statePath}.pre-migrate.json`),
      "migration should leave a pre-migrate backup"
    );
    assert.equal(
      JSON.parse(fs.readFileSync(statePath, "utf8")).version,
      MANIFEST_VERSION,
      "state version should be rewritten after migration"
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("0.13 hard-delete migration removes managed retired skill and agent", () => {
  const root = freshRoot("retire-managed");
  try {
    assert.equal(runManage(["install"], { CODEX_HOME: root }).status, 0);
    const statePath = path.join(root, ".do-it-install-state.json");
    const state = JSON.parse(fs.readFileSync(statePath, "utf8"));
    const retiredSkill = path.join(root, "skills", "do-it-planning");
    const retiredAgent = path.join(root, "agents", "architect-reviewer.toml");
    fs.mkdirSync(retiredSkill, { recursive: true });
    fs.writeFileSync(path.join(retiredSkill, "SKILL.md"), "legacy skill\n");
    fs.mkdirSync(path.dirname(retiredAgent), { recursive: true });
    fs.writeFileSync(retiredAgent, "name = \"architect-reviewer\"\n");
    state.version = "0.13.1";
    state.entries["skills/do-it-planning"] = {
      kind: "skill", name: "do-it-planning",
      hash: crypto.createHash("sha256").update("SKILL.md\0legacy skill\n\0").digest("hex")
    };
    state.entries["agents/architect-reviewer.toml"] = {
      kind: "agent", name: "architect-reviewer",
      hash: crypto.createHash("sha256").update("name = \"architect-reviewer\"\n").digest("hex")
    };
    fs.writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`);

    const result = runManage(["install"], { CODEX_HOME: root });
    assert.equal(result.status, 0, result.stderr);
    assert.ok(!fs.existsSync(retiredSkill), "managed retired skill should be removed");
    assert.ok(!fs.existsSync(retiredAgent), "managed retired agent should be removed");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("0.13 migration blocks modified retired paths without partial changes", () => {
  const root = freshRoot("retire-modified");
  try {
    assert.equal(runManage(["install"], { CODEX_HOME: root }).status, 0);
    const statePath = path.join(root, ".do-it-install-state.json");
    const state = JSON.parse(fs.readFileSync(statePath, "utf8"));
    state.version = "0.13.1";
    const retiredSkill = path.join(root, "skills", "do-it-planning");
    fs.mkdirSync(retiredSkill, { recursive: true });
    fs.writeFileSync(path.join(retiredSkill, "SKILL.md"), "user modified content\n");
    fs.writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`);

    const result = runManage(["install"], { CODEX_HOME: root });
    assert.notEqual(result.status, 0, "unknown retired content should block migration");
    assert.match(result.stderr, /Refusing to remove existing deprecated skill target/);
    assert.ok(fs.existsSync(retiredSkill), "modified retired path must remain");
    assert.equal(JSON.parse(fs.readFileSync(statePath, "utf8")).version, "0.13.1", "state is unchanged");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("DO_IT_FORCE removes a modified retired path", () => {
  const root = freshRoot("retire-force");
  try {
    assert.equal(runManage(["install"], { CODEX_HOME: root }).status, 0);
    const statePath = path.join(root, ".do-it-install-state.json");
    const state = JSON.parse(fs.readFileSync(statePath, "utf8"));
    state.version = "0.13.1";
    const retiredSkill = path.join(root, "skills", "do-it-planning");
    fs.mkdirSync(retiredSkill, { recursive: true });
    fs.writeFileSync(path.join(retiredSkill, "SKILL.md"), "user modified content\n");
    fs.writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`);

    const result = runManage(["install"], { CODEX_HOME: root, DO_IT_FORCE: "1" });
    assert.equal(result.status, 0, result.stderr);
    assert.ok(!fs.existsSync(retiredSkill));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("migrate-legacy defaults to a read-only inventory of proven do-it targets", () => {
  const root = freshRoot("legacy-dry-run");
  const canonical = path.join(root, "agents", "code-mapper.toml");
  const retired = path.join(root, "agents", "architect-reviewer.toml");
  const personal = path.join(root, "agents", "personal-agent.toml");
  const retiredContent = 'name = "architect-reviewer"\n';
  try {
    enableDoItPlugin(root);
    fs.mkdirSync(path.dirname(canonical), { recursive: true });
    fs.writeFileSync(canonical, canonicalAgentContent());
    fs.writeFileSync(retired, retiredContent);
    fs.writeFileSync(personal, 'name = "personal-agent"\n');
    writeLegacyState(root, {
      "agents/architect-reviewer.toml": {
        kind: "agent",
        name: "architect-reviewer",
        hash: fileHash(retiredContent)
      }
    });

    const result = runManage(["migrate-legacy"], { CODEX_HOME: root });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /mode: dry-run/);
    assert.match(result.stdout, /REMOVABLE legacy-agent:code-mapper/);
    assert.match(result.stdout, /REMOVABLE deprecated-agent:architect-reviewer/);
    assert.doesNotMatch(result.stdout, /personal-agent/);
    assert.ok(fs.existsSync(canonical), "dry-run must not remove canonical agent");
    assert.ok(fs.existsSync(retired), "dry-run must not remove deprecated agent");
    assert.ok(fs.existsSync(personal), "unrelated global agent must stay untouched");
    assert.ok(
      !fs.existsSync(path.join(root, ".do-it-legacy-migration-backups")),
      "dry-run must not create backups"
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("migrate-legacy preserves a signature-only retired do-it agent for manual review", () => {
  const root = freshRoot("legacy-retired-signature");
  const retired = path.join(root, "agents", "architect-reviewer.toml");
  try {
    enableDoItPlugin(root);
    fs.mkdirSync(path.dirname(retired), { recursive: true });
    fs.writeFileSync(retired, legacyCanonicalAgentContent("architect-reviewer"));

    const result = runManage(["migrate-legacy"], { CODEX_HOME: root });
    assert.equal(result.status, 0, result.stderr);
    assert.match(
      result.stdout,
      /REFUSED deprecated-agent:architect-reviewer .*lacks state\/hash\/source proof; manual review required/
    );
    assert.ok(fs.existsSync(retired), "dry-run must not remove deprecated agent");

    const apply = runManage(["migrate-legacy", "--apply"], { CODEX_HOME: root });
    assert.equal(apply.status, 1, apply.stdout || apply.stderr);
    assert.ok(fs.existsSync(retired), "signature-only target must remain after apply");
    assert.ok(
      !fs.existsSync(path.join(root, ".do-it-legacy-migration-backups")),
      "signature-only refusal must not create a backup/migration"
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("migrate-legacy --apply removes only proven targets and keeps recoverable backups", () => {
  const root = freshRoot("legacy-apply");
  const canonical = path.join(root, "agents", "code-mapper.toml");
  const retired = path.join(root, "agents", "architect-reviewer.toml");
  const personal = path.join(root, "agents", "personal-agent.toml");
  const retiredContent = 'name = "architect-reviewer"\n';
  try {
    enableDoItPlugin(root);
    fs.mkdirSync(path.dirname(canonical), { recursive: true });
    fs.writeFileSync(canonical, canonicalAgentContent());
    fs.writeFileSync(retired, retiredContent);
    fs.writeFileSync(personal, 'name = "personal-agent"\n');
    writeLegacyState(root, {
      "agents/architect-reviewer.toml": {
        kind: "agent",
        name: "architect-reviewer",
        hash: fileHash(retiredContent)
      }
    });

    const result = runManage(["migrate-legacy", "--apply"], { CODEX_HOME: root });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /mode: apply/);
    assert.ok(!fs.existsSync(canonical), "proven legacy canonical agent should be removed");
    assert.ok(!fs.existsSync(retired), "proven deprecated agent should be removed");
    assert.ok(fs.existsSync(personal), "unrelated global agent must stay untouched");

    const state = JSON.parse(
      fs.readFileSync(path.join(root, ".do-it-install-state.json"), "utf8")
    );
    assert.equal(state.entries["agents/architect-reviewer.toml"], undefined);

    const backupBase = path.join(root, ".do-it-legacy-migration-backups");
    const backupIds = fs.readdirSync(backupBase);
    assert.equal(backupIds.length, 1, "one persistent migration backup is expected");
    const backupRoot = path.join(backupBase, backupIds[0]);
    assert.equal(
      fs.readFileSync(path.join(backupRoot, "agents", "code-mapper.toml"), "utf8"),
      canonicalAgentContent()
    );
    assert.equal(
      fs.readFileSync(path.join(backupRoot, "agents", "architect-reviewer.toml"), "utf8"),
      retiredContent
    );
    assert.ok(
      fs.existsSync(path.join(backupRoot, ".do-it-install-state.json")),
      "changed install state should be backed up too"
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("migrate-legacy --apply preserves ambiguous agents while cleaning proven targets", () => {
  const root = freshRoot("legacy-refuse");
  const canonical = path.join(root, "agents", "code-mapper.toml");
  const retired = path.join(root, "agents", "architect-reviewer.toml");
  const retiredContent = 'name = "architect-reviewer"\n';
  try {
    enableDoItPlugin(root);
    fs.mkdirSync(path.dirname(canonical), { recursive: true });
    fs.writeFileSync(
      canonical,
      'name = "code-mapper"\ndeveloper_instructions = "NEEDS_CONTEXT only"\n'
    );
    fs.writeFileSync(retired, retiredContent);
    writeLegacyState(root, {
      "agents/architect-reviewer.toml": {
        kind: "agent",
        name: "architect-reviewer",
        hash: fileHash(retiredContent)
      }
    });

    const result = runManage(["migrate-legacy", "--apply"], { CODEX_HOME: root });
    assert.equal(result.status, 1, result.stdout || result.stderr);
    assert.match(result.stdout, /REFUSED legacy-agent:code-mapper/);
    assert.match(result.stderr, /Legacy migration incomplete/);
    assert.ok(fs.existsSync(canonical), "ambiguous canonical agent must remain");
    assert.ok(!fs.existsSync(retired), "independently proven deprecated agent should be removed");
    assert.ok(
      fs.existsSync(path.join(root, ".do-it-legacy-migration-backups")),
      "each removed target must retain a backup even when another target is refused"
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("migrate-legacy --apply requires an enabled and verified marketplace bundle", () => {
  const root = freshRoot("legacy-plugin-required");
  const canonical = path.join(root, "agents", "code-mapper.toml");
  try {
    writeDoItPluginConfig(root);
    fs.mkdirSync(path.dirname(canonical), { recursive: true });
    fs.writeFileSync(canonical, canonicalAgentContent());

    const result = runManage(["migrate-legacy", "--apply"], { CODEX_HOME: root });
    assert.equal(result.status, 1, result.stdout || result.stderr);
    assert.match(result.stdout, /plugin source of truth: UNCONFIRMED/);
    assert.match(result.stdout, /installed plugin bundle is missing/);
    assert.match(result.stderr, /until do-it@tdwhere-do-it is enabled and its current plugin bundle is verified/);
    assert.ok(fs.existsSync(canonical), "plugin preflight failure must not remove legacy agent");
    assert.ok(
      !fs.existsSync(path.join(root, ".do-it-legacy-migration-backups")),
      "plugin preflight failure must not create a backup/migration"
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("migrate-legacy --apply rejects an enabled plugin with stale agent content", () => {
  const root = freshRoot("legacy-stale-plugin");
  const canonical = path.join(root, "agents", "code-mapper.toml");
  const installedAgent = path.join(
    root,
    "plugins",
    "cache",
    "tdwhere-do-it",
    "do-it",
    CODEX_PLUGIN_VERSION,
    "agents",
    "code-mapper.toml"
  );
  try {
    enableDoItPlugin(root);
    fs.appendFileSync(installedAgent, "\n# stale fixture\n");
    fs.mkdirSync(path.dirname(canonical), { recursive: true });
    fs.writeFileSync(canonical, canonicalAgentContent());

    const result = runManage(["migrate-legacy", "--apply"], { CODEX_HOME: root });
    assert.equal(result.status, 1, result.stdout || result.stderr);
    assert.match(result.stdout, /plugin source of truth: UNCONFIRMED/);
    assert.match(result.stdout, /installed plugin agents .* do not match this do-it package/);
    assert.ok(fs.existsSync(canonical), "stale plugin bundle must not permit removal");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("migrate-legacy --apply rejects a stale generated Codex agent bundle", () => {
  const root = freshRoot("legacy-stale-generated-bundle");
  const canonical = path.join(root, "agents", "code-mapper.toml");
  try {
    const { packageRoot, pluginVersion } = createCachebusterPackageFixture(root);
    const packagePluginRoot = path.join(packageRoot, "plugins", "do-it");
    fs.appendFileSync(
      path.join(packagePluginRoot, "agents", "code-mapper.toml"),
      "\n# stale generated fixture\n"
    );
    enableDoItPlugin(root, {
      sourceRoot: packagePluginRoot,
      version: pluginVersion
    });
    fs.mkdirSync(path.dirname(canonical), { recursive: true });
    fs.writeFileSync(
      canonical,
      fs.readFileSync(path.join(packageRoot, "agents", "code-mapper.toml"), "utf8")
    );

    const result = runManageAt(packageRoot, ["migrate-legacy", "--apply"], {
      CODEX_HOME: root
    });
    assert.equal(result.status, 1, result.stdout || result.stderr);
    assert.match(result.stdout, /plugin source of truth: UNCONFIRMED/);
    assert.match(
      result.stdout,
      /package plugin agents .* do not match canonical agents .* run npm run build:codex-plugin/
    );
    assert.ok(fs.existsSync(canonical), "stale generated bundle must not permit removal");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("migrate-legacy derives the Codex cache directory from a cachebuster plugin version", () => {
  const root = freshRoot("legacy-cachebuster");
  const canonical = path.join(root, "agents", "code-mapper.toml");
  try {
    const { packageRoot, pluginVersion } = createCachebusterPackageFixture(root);
    assert.equal(
      JSON.parse(fs.readFileSync(path.join(packageRoot, "manifest.json"), "utf8")).version,
      MANIFEST_VERSION,
      "root manifest remains on its base version"
    );
    enableDoItPlugin(root, {
      sourceRoot: path.join(packageRoot, "plugins", "do-it"),
      version: pluginVersion
    });
    fs.mkdirSync(path.dirname(canonical), { recursive: true });
    fs.writeFileSync(
      canonical,
      fs.readFileSync(path.join(packageRoot, "agents", "code-mapper.toml"), "utf8")
    );

    const result = runManageAt(packageRoot, ["migrate-legacy", "--apply"], {
      CODEX_HOME: root
    });
    assert.equal(result.status, 0, result.stdout || result.stderr);
    assert.ok(
      result.stdout.includes(path.join("do-it", pluginVersion)),
      "migration should verify the cachebuster-named bundle rather than the base manifest version"
    );
    assert.ok(!fs.existsSync(canonical), "verified cachebuster bundle should permit proven cleanup");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("codex and claude targets install into independent state files", () => {
  const codexRoot = freshRoot("codex-sym");
  const claudeRoot = freshRoot("claude-sym");
  try {
    const codex = runManage(["install"], { CODEX_HOME: codexRoot });
    assert.equal(codex.status, 0, codex.stderr);
    const claude = runManage(["install", "--target=claude"], {
      CLAUDE_PLUGIN_ROOT_OVERRIDE: claudeRoot
    });
    assert.equal(claude.status, 0, claude.stderr);

    const codexState = JSON.parse(
      fs.readFileSync(path.join(codexRoot, ".do-it-install-state.json"), "utf8")
    );
    const claudeState = JSON.parse(
      fs.readFileSync(
        path.join(claudeRoot, ".do-it-install-state-claude.json"),
        "utf8"
      )
    );
    assert.equal(codexState.version, MANIFEST_VERSION);
    assert.equal(claudeState.version, MANIFEST_VERSION);
    // Each target keeps its own state file; one install never writes the other.
    assert.ok(
      !fs.existsSync(path.join(codexRoot, ".do-it-install-state-claude.json"))
    );
    assert.ok(
      !fs.existsSync(path.join(codexRoot, "hooks", "strict-external-actions.sh")),
      "Codex must not receive the Claude-only strict external-action hook"
    );
    assert.ok(
      fs.existsSync(path.join(claudeRoot, "hooks", "strict-external-actions.sh")),
      "Claude must receive the opt-in strict external-action hook"
    );
    assert.ok(
      fs.existsSync(path.join(claudeRoot, "commands", "do-it-retrospective.md")),
      "Claude must receive the retrospective report command"
    );
    const claudeHooks = JSON.parse(
      fs.readFileSync(path.join(claudeRoot, "hooks", "hooks.json"), "utf8")
    );
    assert.ok(
      claudeHooks.hooks?.PreToolUse?.[0]?.hooks?.every(
        (entry) =>
          typeof entry.command === "string" &&
          entry.command.startsWith('"${CLAUDE_PLUGIN_ROOT}/hooks/strict-external-actions.sh" ') &&
          entry.shell === "bash" &&
          !Object.hasOwn(entry, "args")
      ),
      "Claude strict profile must stay scoped to its named PreToolUse handlers"
    );
    assert.equal(
      claudeHooks.hooks?.UserPromptExpansion?.[0]?.matcher,
      "^do-it-retrospective$",
      "Claude must receive a direct slash-command recorder path"
    );
  } finally {
    fs.rmSync(codexRoot, { recursive: true, force: true });
    fs.rmSync(claudeRoot, { recursive: true, force: true });
  }
});

test("claude install preserves unrelated files in hooks directory", () => {
  const root = freshRoot("claude-hooks-coexist");
  const foreignHook = path.join(root, "hooks", "gitnexus", "custom-hook.cjs");
  try {
    fs.mkdirSync(path.dirname(foreignHook), { recursive: true });
    fs.writeFileSync(foreignHook, "module.exports = {};\n");

    const result = runManage(["install", "--target=claude"], {
      CLAUDE_PLUGIN_ROOT_OVERRIDE: root
    });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(
      fs.readFileSync(foreignHook, "utf8"),
      "module.exports = {};\n",
      "install should not replace the whole hooks directory"
    );
    assert.ok(
      fs.existsSync(path.join(root, "hooks", "router.sh")),
      "managed do-it hook should still be installed"
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("cursor post-install failure restores managed targets, state, and Cursor side effects", () => {
  const home = freshRoot("cursor-rollback");
  const pluginRoot = path.join(home, "cursor-plugin");
  const statePath = path.join(pluginRoot, ".do-it-install-state-cursor.json");
  const localPlugin = path.join(home, ".cursor", "plugins", "local", "do-it-cursor");
  const markerPath = path.join(home, ".cursor", "plugins", "do-it-cursor-install.json");
  const hooksPath = path.join(home, ".cursor", "hooks.json");
  try {
    assert.equal(
      runManage(["install", "--target=cursor"], {
        HOME: home,
        USERPROFILE: "",
        CURSOR_PLUGIN_ROOT_OVERRIDE: pluginRoot
      }).status,
      0
    );
    fs.writeFileSync(path.join(pluginRoot, "hooks", "sentinel.txt"), "old managed target\n");
    const state = JSON.parse(fs.readFileSync(statePath, "utf8"));
    state.installedAt = "old-state";
    fs.writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`);
    fs.writeFileSync(path.join(localPlugin, "local-sentinel.txt"), "old local plugin\n");
    fs.writeFileSync(markerPath, "old marker\n");
    fs.writeFileSync(hooksPath, '{"version":1,"hooks":{"stop":[{"command":"third-party"}]}}\n');

    const result = runManage(["install", "--target=cursor"], {
      HOME: home,
      USERPROFILE: "",
      CURSOR_PLUGIN_ROOT_OVERRIDE: pluginRoot,
      DO_IT_FORCE: "1",
      DO_IT_TEST_CURSOR_FAIL_AT: "after-user-hooks"
    });
    assert.notEqual(result.status, 0);
    assert.equal(
      fs.readFileSync(path.join(pluginRoot, "hooks", "sentinel.txt"), "utf8"),
      "old managed target\n"
    );
    assert.equal(JSON.parse(fs.readFileSync(statePath, "utf8")).installedAt, "old-state");
    assert.equal(
      fs.readFileSync(path.join(localPlugin, "local-sentinel.txt"), "utf8"),
      "old local plugin\n"
    );
    assert.equal(fs.readFileSync(markerPath, "utf8"), "old marker\n");
    assert.equal(
      fs.readFileSync(hooksPath, "utf8"),
      '{"version":1,"hooks":{"stop":[{"command":"third-party"}]}}\n'
    );
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test("fresh cursor post-install failure leaves managed state and targets absent", () => {
  const home = freshRoot("cursor-fresh-rollback");
  const pluginRoot = path.join(home, "cursor-plugin");
  try {
    const result = runManage(["install", "--target=cursor"], {
      HOME: home,
      USERPROFILE: "",
      CURSOR_PLUGIN_ROOT_OVERRIDE: pluginRoot,
      DO_IT_TEST_CURSOR_FAIL_AT: "after-marker"
    });
    assert.notEqual(result.status, 0);
    assert.ok(!fs.existsSync(path.join(pluginRoot, ".do-it-install-state-cursor.json")));
    assert.ok(!fs.existsSync(path.join(pluginRoot, ".cursor-plugin")));
    assert.ok(!fs.existsSync(path.join(home, ".cursor", "plugins", "local", "do-it-cursor")));
    assert.ok(!fs.existsSync(path.join(home, ".cursor", "plugins", "do-it-cursor-install.json")));
    assert.ok(!fs.existsSync(path.join(home, ".cursor", "hooks.json")));
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test("cursor doctor rejects a symlinked discovery copy", () => {
  const home = freshRoot("cursor-doctor-symlink");
  const pluginRoot = path.join(home, "managed-cursor");
  const localPlugin = path.join(home, ".cursor", "plugins", "local", "do-it-cursor");
  const savedCopy = path.join(home, "saved-local-copy");
  try {
    const install = runManage(["install", "--target=cursor"], {
      HOME: home,
      USERPROFILE: "",
      CURSOR_PLUGIN_ROOT_OVERRIDE: pluginRoot
    });
    assert.equal(install.status, 0, install.stderr);

    fs.renameSync(localPlugin, savedCopy);
    fs.symlinkSync(savedCopy, localPlugin, process.platform === "win32" ? "junction" : "dir");

    const doctor = runManage(["doctor", "--target=cursor"], {
      HOME: home,
      USERPROFILE: "",
      CURSOR_PLUGIN_ROOT_OVERRIDE: pluginRoot
    });
    assert.notEqual(doctor.status, 0);
    assert.match(doctor.stdout, /cursor:discovery-copy invalid/);
    assert.match(doctor.stdout, /must be a real directory/);
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test("cursor doctor rejects a stale discovery-copy version", () => {
  const home = freshRoot("cursor-doctor-version");
  const pluginRoot = path.join(home, "managed-cursor");
  const localPluginJson = path.join(
    home,
    ".cursor",
    "plugins",
    "local",
    "do-it-cursor",
    ".cursor-plugin",
    "plugin.json"
  );
  try {
    const install = runManage(["install", "--target=cursor"], {
      HOME: home,
      USERPROFILE: "",
      CURSOR_PLUGIN_ROOT_OVERRIDE: pluginRoot
    });
    assert.equal(install.status, 0, install.stderr);

    const metadata = JSON.parse(fs.readFileSync(localPluginJson, "utf8"));
    metadata.version = "0.0.0-stale";
    fs.writeFileSync(localPluginJson, `${JSON.stringify(metadata, null, 2)}\n`);

    const doctor = runManage(["doctor", "--target=cursor"], {
      HOME: home,
      USERPROFILE: "",
      CURSOR_PLUGIN_ROOT_OVERRIDE: pluginRoot
    });
    assert.notEqual(doctor.status, 0);
    assert.match(doctor.stdout, /cursor:discovery-copy invalid/);
    assert.match(doctor.stdout, /does not match/);
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test("cursor target installs plugin bundle with cursor hooks.json", () => {
  const home = freshRoot("cursor-home");
  const pluginRoot = path.join(home, "cursor-plugin");
  try {
    const result = runManage(["install", "--target=cursor"], {
      HOME: home,
      CURSOR_PLUGIN_ROOT_OVERRIDE: pluginRoot
    });
    assert.equal(result.status, 0, result.stderr);

    const statePath = path.join(pluginRoot, ".do-it-install-state-cursor.json");
    assert.ok(fs.existsSync(statePath), "cursor state file should exist");
    assert.equal(
      JSON.parse(fs.readFileSync(statePath, "utf8")).version,
      MANIFEST_VERSION
    );
    assert.ok(
      fs.existsSync(path.join(pluginRoot, ".cursor-plugin", "plugin.json")),
      "cursor plugin manifest should be installed"
    );
    assert.ok(
      fs.existsSync(path.join(pluginRoot, "hooks", "write-quality-lint.sh")),
      "write-quality hook should be installed"
    );

    const hooksJson = JSON.parse(
      fs.readFileSync(path.join(pluginRoot, "hooks", "hooks.json"), "utf8")
    );
    assert.equal(hooksJson.version, 1);
    assert.ok(hooksJson.hooks.sessionStart, "cursor hooks should define sessionStart");
    assert.equal(
      Object.hasOwn(hooksJson.hooks, "PreToolUse"),
      false,
      "Cursor must not claim the Claude-only strict PreToolUse profile"
    );
    assert.ok(
      !fs.existsSync(path.join(pluginRoot, "hooks", "strict-external-actions.sh")),
      "Cursor must not receive the Claude-only strict external-action hook"
    );

    const localPlugin = path.join(home, ".cursor", "plugins", "local", "do-it-cursor");
    const registered = JSON.parse(
      fs.readFileSync(path.join(home, ".cursor", "plugins", "do-it-cursor-install.json"), "utf8")
    );
    assert.equal(registered.id, "do-it-cursor");
    assert.equal(
      registered.installPath,
      localPlugin,
      "register-cursor-plugin should mirror into official ~/.cursor/plugins/local path"
    );
    assert.ok(
      fs.existsSync(path.join(localPlugin, ".cursor-plugin", "plugin.json")),
      "local Cursor plugin copy should include plugin.json"
    );
    assert.ok(
      !fs.lstatSync(localPlugin).isSymbolicLink(),
      "local Cursor plugin must be a real directory (Cursor rejects external symlinks)"
    );
    assert.ok(
      !fs.existsSync(path.join(home, ".claude", "plugins", "installed_plugins.json")),
      "cursor setup must not write Claude plugin registries"
    );

    const allSkills = [
      ...(manifest.skillTiers?.core ?? []),
      ...(manifest.skillTiers?.extended ?? [])
    ].sort();
    const installedSkillDirs = fs
      .readdirSync(path.join(pluginRoot, "skills"), { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
    assert.deepEqual(
      installedSkillDirs.filter((name) => name !== "references"),
      allSkills,
      "cursor install should ship the full skill set"
    );
    assert.ok(
      fs.existsSync(path.join(pluginRoot, "skills", "do-it-handbook")),
      "extended skill do-it-handbook must install for cursor"
    );
    assert.ok(
      fs.existsSync(path.join(pluginRoot, "skills", "references")),
      "shared references/ should install for cursor"
    );
    assert.ok(
      fs.existsSync(path.join(pluginRoot, "skills", "_index.md")),
      "skills index should still install for cursor discovery"
    );

    const userHooksPath = path.join(home, ".cursor", "hooks.json");
    assert.ok(
      fs.existsSync(userHooksPath),
      "cursor post-install must wire user-level ~/.cursor/hooks.json"
    );
    const userHooks = JSON.parse(fs.readFileSync(userHooksPath, "utf8"));
    assert.ok(
      userHooks.hooks?.sessionStart?.some((entry) =>
        String(entry.command).includes("run-hook.cmd") &&
        String(entry.command).includes("session-start")
      ),
      "user hooks must point at run-hook.cmd session-start (not bare .sh)"
    );
    assert.ok(
      !JSON.stringify(userHooks).match(/do-it-cursor[/\\]hooks[/\\][^"\\]+\.sh"/),
      "user hooks must not reference bare .sh entrypoints"
    );

    const doctor = runManage(["doctor", "--target=cursor"], {
      HOME: home,
      CURSOR_PLUGIN_ROOT_OVERRIDE: pluginRoot
    });
    assert.equal(doctor.status, 0, doctor.stderr || doctor.stdout);
    assert.match(doctor.stdout, /cursor:user-hooks wired/);
    assert.match(doctor.stdout, /cursor:sample-hook runnable/);
    assert.match(doctor.stdout, /cursor:run-hook\.cmd/);
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});
