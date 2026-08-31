import assert from "node:assert/strict";
import test from "node:test";
import { sum } from "../src/sum.mjs";

test("sum(2, 3) is 5", () => {
  assert.equal(sum(2, 3), 5);
});
