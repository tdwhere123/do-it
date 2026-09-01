export const attempts = [];
const seen = new Set();

export function post(id) {
  if (seen.has(id)) return "dup";
  seen.add(id);
  attempts.push(id);
  return "ok";
}
