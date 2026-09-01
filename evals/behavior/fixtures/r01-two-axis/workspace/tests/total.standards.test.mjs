import assert from "node:assert/strict";
import test from "node:test";
import { totalWithTax } from "../src/total.mjs";

test("export is a function", () => {
  assert.equal(typeof totalWithTax, "function");
});
