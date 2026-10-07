import assert from "node:assert/strict";
import test from "node:test";
import { enqueue } from "../src/api.mjs";

test("the API accepts a credit and queues its event and amount", () => {
  const queue = [];
  assert.deepEqual(enqueue({ tenantId: "north", eventId: "E7", amount: 20 }, queue), { accepted: true });
  assert.equal(queue.length, 1);
  assert.equal(queue[0].eventId, "E7");
  assert.equal(queue[0].amount, 20);
});
