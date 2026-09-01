import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { invoiceTotal } from "../src/invoice.mjs";
import { taxAmount } from "../src/tax.mjs";

test("invoice totals reuse taxAmount", () => {
  assert.equal(taxAmount(100), 10);
  assert.equal(invoiceTotal(100), 110);
  const source = fs.readFileSync(
    path.join(path.dirname(fileURLToPath(import.meta.url)), "../src/invoice.mjs"),
    "utf8"
  );
  assert.match(source, /taxAmount/);
  assert.equal(source.includes("0.15"), false);
});
