import assert from "node:assert/strict";
import test from "node:test";
import { ping } from "../src/ping.mjs";

test("live ping requires LIVE_PING_URL", () => {
  assert.ok(process.env.LIVE_PING_URL, "LIVE_PING_URL is required");
  assert.equal(ping(process.env.LIVE_PING_URL).ok, true);
});
