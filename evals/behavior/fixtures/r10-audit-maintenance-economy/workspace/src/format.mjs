export function formatCents(cents) {
  if (!Number.isSafeInteger(cents)) throw new TypeError('safe integer cents required');
  const digits = String(Math.abs(cents)).padStart(3, '0');
  return `${cents < 0 ? '-' : ''}${digits.slice(0, -2)}.${digits.slice(-2)}`;
}
