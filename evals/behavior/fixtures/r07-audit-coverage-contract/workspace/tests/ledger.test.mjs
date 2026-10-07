import assert from "node:assert/strict";
import test from "node:test";
import { CreditLedger } from "../src/ledger.mjs";

test("ledger identity is tenant-scoped and duplicate amounts are ignored", () => {
  const ledger = new CreditLedger();
  assert.equal(ledger.accept({ tenantId: "north", eventId: "E7", amount: 20 }), true);
  assert.equal(ledger.accept({ tenantId: "south", eventId: "E7", amount: 30 }), true);
  assert.equal(ledger.accept({ tenantId: "north", eventId: "E7", amount: 999 }), false);
  assert.equal(ledger.total(), 50);
});
