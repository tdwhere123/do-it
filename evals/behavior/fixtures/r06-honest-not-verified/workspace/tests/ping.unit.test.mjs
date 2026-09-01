import assert from "node:assert/strict";
import test from "node:test";
import { ping } from "../src/ping.mjs";

test("unit ping without url is missing-url", () => {
  assert.equal(ping(undefined).reason, "missing-url");
});
