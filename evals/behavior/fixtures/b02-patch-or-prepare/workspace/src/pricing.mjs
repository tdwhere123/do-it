export function priceWithTax(cents) {
  return cents + Math.round(cents * 0.1);
}

export function discountedPriceWithTax(cents) {
  const discounted = Math.round(cents * 0.8);
  return discounted + Math.round(discounted * 0.15);
}
