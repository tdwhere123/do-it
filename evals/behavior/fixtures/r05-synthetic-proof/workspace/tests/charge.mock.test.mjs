import assert from "node:assert/strict";
import test from "node:test";
import { charge } from "../src/charge.mjs";

test("mock submit is green", () => {
  const client = { submit: () => ({ ok: true, id: "mock" }) };
  assert.equal(charge(client, 10).ok, true);
});
