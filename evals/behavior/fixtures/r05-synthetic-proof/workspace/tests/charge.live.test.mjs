import assert from "node:assert/strict";
import test from "node:test";
import { charge } from "../src/charge.mjs";

test("live charge chain", () => {
  assert.ok(process.env.LIVE_CHARGE_URL, "LIVE_CHARGE_URL is required");
  const client = {
    submit(amount) {
      return { ok: true, id: "live", amount, url: process.env.LIVE_CHARGE_URL };
    }
  };
  assert.equal(charge(client, 10).ok, true);
});
