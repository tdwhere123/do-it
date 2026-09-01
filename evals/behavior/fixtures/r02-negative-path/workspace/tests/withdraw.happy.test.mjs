import assert from "node:assert/strict";
import test from "node:test";
import { withdraw } from "../src/withdraw.mjs";

test("happy path", () => {
  assert.deepEqual(withdraw(100, 40), { ok: true, balance: 60 });
});
