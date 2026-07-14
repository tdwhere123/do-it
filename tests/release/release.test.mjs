import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { validateRelease } from "../../scripts/validate-release.mjs";
import { classifyTarball, resolveSmokeTarballs } from "../../scripts/smoke-package.mjs";

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


test("classifyTarball distinguishes root and opencode npm-pack names", () => {
  assert.equal(classifyTarball("./tdwhere-do-it-0.14.0.tgz"), "root");
  assert.equal(classifyTarball("/tmp/tdwhere-do-it-opencode-0.14.0.tgz"), "opencode");
});

test("resolveSmokeTarballs packs from checkout when no .tgz args", () => {
  let packedRoot = 0;
  let packedOpen = 0;
  const result = resolveSmokeTarballs(["--keep"], {
    packRoot: () => {
      packedRoot += 1;
      return "/tmp/packed-root.tgz";
    },
    packOpenCode: () => {
      packedOpen += 1;
      return "/tmp/packed-opencode.tgz";
    }
  });
  assert.equal(result.source, "packed");
  assert.equal(result.rootTarball, "/tmp/packed-root.tgz");
  assert.equal(result.openCodeTarball, "/tmp/packed-opencode.tgz");
  assert.equal(packedRoot, 1);
  assert.equal(packedOpen, 1);
});

test("resolveSmokeTarballs uses CLI .tgz paths and skips packers", () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "do-it-smoke-resolve-"));
  try {
    const root = path.join(tempRoot, "tdwhere-do-it-0.14.0.tgz");
    const openCode = path.join(tempRoot, "tdwhere-do-it-opencode-0.14.0.tgz");
    fs.writeFileSync(root, "root");
    fs.writeFileSync(openCode, "opencode");

    let packed = 0;
    const packers = {
      packRoot: () => {
        packed += 1;
        return "/should-not-pack-root.tgz";
      },
      packOpenCode: () => {
        packed += 1;
        return "/should-not-pack-opencode.tgz";
      }
    };

    const both = resolveSmokeTarballs([root, openCode], packers);
    assert.equal(both.source, "cli");
    assert.equal(both.rootTarball, path.resolve(root));
    assert.equal(both.openCodeTarball, path.resolve(openCode));
    assert.equal(packed, 0);

    const rootOnly = resolveSmokeTarballs([root, "--keep"], packers);
    assert.equal(rootOnly.source, "cli");
    assert.equal(rootOnly.rootTarball, path.resolve(root));
    assert.equal(rootOnly.openCodeTarball, undefined);
    assert.equal(packed, 0);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});
