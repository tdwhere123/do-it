import assert from "node:assert/strict";
import test from "node:test";
import { greet } from "../src/greet.mjs";

test("greet Ada", () => {
  assert.equal(greet("Ada"), "hello Ada");
});
