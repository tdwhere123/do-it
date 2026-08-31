let count = 3;

export function getCount() {
  return count;
}

export function setCount(n) {
  count = n;
}

export function casIncrement(expected) {
  if (count !== expected) return false;
  count += 1;
  return true;
}
