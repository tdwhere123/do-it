import assert from "node:assert/strict";
import test from "node:test";
import { formatCents } from "../src/amount.mjs";

test("amount formatting includes zero and fractional dollars", () => {
  assert.equal(formatCents(0), "0.00");
  assert.equal(formatCents(125), "1.25");
});
