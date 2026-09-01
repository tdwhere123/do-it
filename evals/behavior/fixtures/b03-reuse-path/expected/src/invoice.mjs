import { taxAmount } from "./tax.mjs";

export function invoiceTotal(cents) {
  return cents + taxAmount(cents);
}
