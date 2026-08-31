import assert from "node:assert/strict";
import test from "node:test";
import { note } from "../src/note.mjs";

test("note returns ok", () => {
  assert.equal(note(), "ok");
});
