import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { validateRelease } from "../../scripts/validate-release.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function copyReleaseMetadata() {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "do-it-release-test-"));
  for (const relativePath of [
    "package.json",
    "manifest.json",
    "index.json",
    "CHANGELOG.md",
    ".claude-plugin/plugin.json",
    ".claude-plugin/marketplace.json",
    "plugins/do-it/.codex-plugin/plugin.json",
    "plugins/do-it-cursor/.cursor-plugin/plugin.json",
    "plugins/do-it-opencode/package.json",
    "plugins/do-it-opencode/package-lock.json"
  ]) {
    const target = path.join(tempRoot, relativePath);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(path.join(repoRoot, relativePath), target);
  }
  return tempRoot;
}

test("release guard accepts a matching tag, metadata set, and changelog entry", () => {
  const result = validateRelease("v0.14.0", repoRoot);
  assert.equal(result.version, "0.14.0");
  assert.equal(result.checkedVersions, 10);
});

test("release guard rejects malformed tags", () => {
  assert.throws(() => validateRelease("0.14.0", repoRoot), /must match vX\.Y\.Z/);
});

test("release guard reports metadata and changelog drift together", () => {
  const tempRoot = copyReleaseMetadata();
  try {
    const cursorPath = path.join(tempRoot, "plugins/do-it-cursor/.cursor-plugin/plugin.json");
    const cursor = JSON.parse(fs.readFileSync(cursorPath, "utf8"));
    cursor.version = "0.13.0";
    fs.writeFileSync(cursorPath, `${JSON.stringify(cursor, null, 2)}\n`);
    fs.writeFileSync(path.join(tempRoot, "CHANGELOG.md"), "# Changelog\n\n## Unreleased\n");

    assert.throws(
      () => validateRelease("v0.14.0", tempRoot),
      (error) => {
        assert.match(error.message, /Cursor plugin metadata: 0\.13\.0/);
        assert.match(error.message, /CHANGELOG\.md: missing "## 0\.14\.0" entry/);
        return true;
      }
    );
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});
