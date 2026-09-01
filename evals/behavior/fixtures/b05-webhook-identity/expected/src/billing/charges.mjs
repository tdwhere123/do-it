export const charges = [];
const seen = new Set();

export function charge(eventId, amount) {
  if (seen.has(eventId)) return false;
  seen.add(eventId);
  charges.push({ eventId, amount });
  return true;
}
