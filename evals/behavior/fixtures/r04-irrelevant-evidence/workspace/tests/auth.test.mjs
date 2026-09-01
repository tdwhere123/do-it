import assert from "node:assert/strict";
import test from "node:test";
import { acceptToken } from "../src/auth.mjs";

test("valid token is accepted", () => {
  assert.equal(acceptToken("ok"), true);
});
