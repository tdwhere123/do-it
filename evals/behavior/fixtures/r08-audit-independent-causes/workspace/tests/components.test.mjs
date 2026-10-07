import assert from "node:assert/strict";
import test from "node:test";
import { subjectKey } from "../src/identity.mjs";
import { archiveKey } from "../src/archive.mjs";
import { eventKey } from "../src/dedup.mjs";
import { sessionKey } from "../src/session.mjs";

test("a lowercase provider subject remains usable", () => {
  assert.equal(subjectKey("user7"), "user7");
});

test("archive runs at different seconds have different keys", () => {
  assert.notEqual(
    archiveKey({ customerId: "C7", createdAt: 1000, runId: "run-a" }),
    archiveKey({ customerId: "C7", createdAt: 2000, runId: "run-b" })
  );
});

test("webhook identity preserves both tenant and event", () => {
  assert.notEqual(eventKey({ tenantId: "north", eventId: "E7" }), eventKey({ tenantId: "south", eventId: "E7" }));
  assert.equal(eventKey({ tenantId: "north", eventId: "E7" }), eventKey({ tenantId: "north", eventId: "E7" }));
});

test("one account can retrieve its legacy marker key", () => {
  assert.equal(sessionKey("account-7"), "account-7");
});
