import assert from "node:assert/strict";
import test from "node:test";
import { totalWithTax } from "../src/total.mjs";

test("applies tax", () => {
  assert.equal(totalWithTax(100, 0.1), 110);
});
