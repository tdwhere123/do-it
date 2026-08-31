import assert from "node:assert/strict";
import test from "node:test";
import { ping } from "../src/unrelated.mjs";

test("unrelated ping", () => {
  assert.equal(ping(), "ok");
});
