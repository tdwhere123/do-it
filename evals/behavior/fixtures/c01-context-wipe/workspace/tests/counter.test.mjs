import assert from "node:assert/strict";
import test from "node:test";
import { counter } from "../src/counter.mjs";

test("counter adds the settled delta of 2", () => {
  assert.equal(counter(10), 12);
});
