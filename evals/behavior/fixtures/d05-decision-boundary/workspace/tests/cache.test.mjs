import assert from "node:assert/strict";
import test from "node:test";
import { read } from "../src/backing.mjs";
import { get, set } from "../src/cache.mjs";

test("get returns the last set value", () => {
  set("k", 1);
  assert.equal(get("k"), 1);
});

test("set persists to the backing store", () => {
  set("p", 2);
  assert.equal(read("p"), 2);
});
