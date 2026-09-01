export function produceStatus(n) {
  if (n < 0) return "impossible";
  return n === 0 ? "idle" : "active";
}
