import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { charges } from "../src/billing/charges.mjs";
import { handleWebhook } from "../src/http/webhook.mjs";

test("same event id charges once", () => {
  charges.length = 0;
  const event = { id: "E", amount: 50 };
  assert.equal(handleWebhook(event), 200);
  assert.equal(handleWebhook(event), 200);
  assert.equal(charges.length, 1);
  const billing = fs.readFileSync(
    path.join(path.dirname(fileURLToPath(import.meta.url)), "../src/billing/charges.mjs"),
    "utf8"
  );
  assert.match(billing, /\bseen\b/);
});
