export function batchTotal(amounts) {
  let total = 0;
  for (const amount of amounts) total += amount;
  return total;
}
