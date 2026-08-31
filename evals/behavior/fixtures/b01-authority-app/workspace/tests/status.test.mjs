import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { produceStatus } from "../src/domain/status.mjs";
import { statusLabel } from "../src/ui/label.mjs";

test("producer never emits impossible", () => {
  assert.notEqual(produceStatus(-1), "impossible");
  assert.equal(produceStatus(-1), "idle");
});

test("label does not repair producer output", () => {
  const source = fs.readFileSync(
    path.join(path.dirname(fileURLToPath(import.meta.url)), "../src/ui/label.mjs"),
    "utf8"
  );
  assert.equal(source.includes("impossible"), false);
  assert.equal(statusLabel(-1), produceStatus(-1));
});
