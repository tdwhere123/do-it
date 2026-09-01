export const charges = [];

export function charge(eventId, amount) {
  charges.push({ eventId, amount });
  return true;
}
