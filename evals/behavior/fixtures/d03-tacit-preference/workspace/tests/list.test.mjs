import assert from "node:assert/strict";
import test from "node:test";
import { sortItems } from "../src/list.mjs";

test("newest timestamp first", () => {
  const items = [
    { name: "a", timestamp: 1 },
    { name: "b", timestamp: 3 },
    { name: "c", timestamp: 2 }
  ];
  assert.deepEqual(
    sortItems(items).map((item) => item.name),
    ["b", "c", "a"]
  );
});
