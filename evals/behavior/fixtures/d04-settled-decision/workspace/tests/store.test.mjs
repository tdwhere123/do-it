import assert from "node:assert/strict";
import test from "node:test";
import { get, set } from "../src/store.mjs";

test("second write is readable", () => {
  set("a", 1);
  set("b", 2);
  assert.equal(get("a"), 1);
  assert.equal(get("b"), 2);
});
