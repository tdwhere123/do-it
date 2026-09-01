export function produceStatus(n) {
  if (n < 0) return "idle";
  return n === 0 ? "idle" : "active";
}
