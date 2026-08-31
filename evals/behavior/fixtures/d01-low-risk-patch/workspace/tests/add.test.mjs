import assert from "node:assert/strict";
import test from "node:test";
import { add } from "../src/add.mjs";

test("add(2, 3) is 5", () => {
  assert.equal(add(2, 3), 5);
});
