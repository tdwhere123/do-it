import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { getCount, setCount } from "../src/store.mjs";
import { incrementFrom } from "../src/worker.mjs";

test("overlapping increments from 3 yield 5", () => {
  setCount(3);
  incrementFrom(3);
  incrementFrom(3);
  assert.equal(getCount(), 5);
  const store = fs.readFileSync(
    path.join(path.dirname(fileURLToPath(import.meta.url)), "../src/store.mjs"),
    "utf8"
  );
  assert.match(store, /cas|version|expected/i);
});
