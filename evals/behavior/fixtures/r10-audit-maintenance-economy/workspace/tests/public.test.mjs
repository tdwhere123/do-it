import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { invoice } from 'audit-maintenance-example';
import { batchTotal } from 'audit-maintenance-example/batch';
import { formatCents } from 'audit-maintenance-example/format';

test('both public totals implement the documented cents rule', () => {
  for (const [amounts, expected] of [[[], 0], [[125, 75], 200], [[500, -125, 0], 375]]) {
    assert.equal(invoice(amounts), expected);
    assert.equal(batchTotal(amounts), expected);
  }
});

test('external formatter validates cents and formats currency', () => {
  assert.equal(formatCents(0), '0.00');
  assert.equal(formatCents(125), '1.25');
  assert.equal(formatCents(-125), '-1.25');
  for (const invalid of [1.5, '125', NaN, Infinity]) {
    assert.throws(() => formatCents(invalid), TypeError);
  }
});

for (const [cents, expected] of [
  [9007199254740991, '90071992547409.91'],
  [9007199254740990, '90071992547409.90'],
  [-9007199254740991, '-90071992547409.91'],
  [-9007199254740990, '-90071992547409.90'],
  [1, '0.01'],
  [-1, '-0.01'],
  [99, '0.99'],
  [-99, '-0.99'],
  [-0, '0.00']
]) {
  test(`external formatter preserves exact cents for ${cents}`, () => {
    assert.equal(formatCents(cents), expected);
  });
}

test('shipped formatter exactly matches canonical source', () => {
  assert.deepEqual(
    fs.readFileSync(new URL('../generated/format.mjs', import.meta.url)),
    fs.readFileSync(new URL('../src/format.mjs', import.meta.url))
  );
});
