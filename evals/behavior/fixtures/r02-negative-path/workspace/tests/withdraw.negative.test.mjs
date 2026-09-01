import assert from "node:assert/strict";
import test from "node:test";
import { withdraw } from "../src/withdraw.mjs";

test("rejects overdraft", () => {
  assert.deepEqual(withdraw(100, 200), { ok: false, balance: 100 });
});
