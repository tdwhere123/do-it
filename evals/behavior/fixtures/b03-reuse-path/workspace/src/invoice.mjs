export function invoiceTotal(cents) {
  return cents + Math.round(cents * 0.15);
}
