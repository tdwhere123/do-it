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
const manageScript = path.join(repoRoot, "install/manage.mjs");
const manifest = JSON.parse(
  fs.readFileSync(path.join(repoRoot, "manifest.json"), "utf8")
);
const MANIFEST_VERSION = manifest.version;

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

function runManage(args, env) {
  return spawnSync(process.execPath, [manageScript, ...args], {
    cwd: repoRoot,
    env: { ...process.env, ...env },
    encoding: "utf8"
  });
}

function freshRoot(label) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `do-it-${label}-`));
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

    const registered = JSON.parse(
      fs.readFileSync(path.join(home, ".cursor", "plugins", "do-it-cursor-install.json"), "utf8")
    );
    assert.equal(registered.id, "do-it-cursor");
    assert.equal(registered.installPath, pluginRoot);
    assert.ok(
      !fs.existsSync(path.join(home, ".claude", "plugins", "installed_plugins.json")),
      "cursor setup must not write Claude plugin registries"
    );

    const coreSkills = [...(manifest.skillTiers?.core ?? [])].sort();
    const installedSkillDirs = fs
      .readdirSync(path.join(pluginRoot, "skills"), { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
    assert.deepEqual(
      installedSkillDirs.filter((name) => name !== "references"),
      coreSkills,
      "cursor install should ship core skill directories only"
    );
    assert.ok(
      !fs.existsSync(path.join(pluginRoot, "skills", "do-it-brainstorm")),
      "extended skill do-it-brainstorm must not install for cursor"
    );
    assert.ok(
      fs.existsSync(path.join(pluginRoot, "skills", "references")),
      "shared references/ should install for cursor"
    );
    assert.ok(
      fs.existsSync(path.join(pluginRoot, "skills", "_index.md")),
      "skills index should still install for cursor discovery"
    );
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});
