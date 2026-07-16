import assert from "node:assert/strict";
import test from "node:test";
import {
  rewritePluginEntries,
  resolveOpenCodeConfigHome
} from "../../scripts/install-opencode-global.mjs";

test("resolveOpenCodeConfigHome prefers OPENCODE_CONFIG_DIR then XDG", () => {
  assert.equal(
    resolveOpenCodeConfigHome({ OPENCODE_CONFIG_DIR: "/tmp/oc-config" }),
    "/tmp/oc-config"
  );
  assert.equal(
    resolveOpenCodeConfigHome({ XDG_CONFIG_HOME: "/tmp/xdg", HOME: "/home/x" }),
    "/tmp/xdg/opencode"
  );
  assert.equal(
    resolveOpenCodeConfigHome({ HOME: "/home/x" }),
    "/home/x/.config/opencode"
  );
});

test("rewritePluginEntries drops checkout and tarball paths", () => {
  const next = rewritePluginEntries([
    "/home/tdwhere/vibe/do-it/plugins/do-it-opencode",
    "/home/tdwhere/vibe/do-it/plugins/do-it-opencode/tdwhere-do-it-opencode-0.14.0.tgz",
    "some-other-plugin",
    "@tdwhere/do-it-opencode"
  ]);
  assert.deepEqual(next, ["some-other-plugin", "@tdwhere/do-it-opencode"]);
});
