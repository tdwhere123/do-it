import assert from "node:assert/strict";
import test from "node:test";
import { discountedPriceWithTax, priceWithTax } from "../src/pricing.mjs";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

test("full and discounted totals share one 10% tax path", () => {
  assert.equal(priceWithTax(100), 110);
  assert.equal(discountedPriceWithTax(100), 88);
  const source = fs.readFileSync(
    path.join(path.dirname(fileURLToPath(import.meta.url)), "../src/pricing.mjs"),
    "utf8"
  );
  assert.equal(source.includes("0.15"), false);
  assert.match(source, /function taxAmount/);
});
