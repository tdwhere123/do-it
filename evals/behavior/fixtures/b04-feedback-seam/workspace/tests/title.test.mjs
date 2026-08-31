import assert from "node:assert/strict";
import test from "node:test";
import { titleCase } from "../src/title.mjs";

test("titleCase title-cases words", () => {
  assert.equal(titleCase("hello world"), "Hello World");
});
