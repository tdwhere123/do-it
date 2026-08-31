import assert from "node:assert/strict";
import test from "node:test";
import { parseCsvLine } from "../src/csv.mjs";

test("quoted commas stay inside the field", () => {
  assert.deepEqual(parseCsvLine('a,"b,c",d'), ["a", "b,c", "d"]);
});
