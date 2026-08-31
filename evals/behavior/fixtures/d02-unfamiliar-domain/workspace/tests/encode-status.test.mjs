import assert from "node:assert/strict";
import test from "node:test";
import { encodeStatus } from "../src/encode-status.mjs";

test("status codes are even and never 3", () => {
  assert.equal(encodeStatus(false), 2);
  assert.equal(encodeStatus(true), 4);
  assert.equal(encodeStatus(true) % 2, 0);
});
