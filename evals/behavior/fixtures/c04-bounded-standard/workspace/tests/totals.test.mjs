import assert from "node:assert/strict";
import test from "node:test";
import { total } from "../src/totals.mjs";

test("negative totals clamp to zero", () => {
  assert.equal(total(-1), 0);
  assert.equal(total(4), 4);
});
