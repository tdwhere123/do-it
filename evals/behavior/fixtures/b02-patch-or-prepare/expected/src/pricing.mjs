function taxAmount(cents) {
  return Math.round(cents * 0.1);
}

export function priceWithTax(cents) {
  return cents + taxAmount(cents);
}

export function discountedPriceWithTax(cents) {
  const discounted = Math.round(cents * 0.8);
  return discounted + taxAmount(discounted);
}
