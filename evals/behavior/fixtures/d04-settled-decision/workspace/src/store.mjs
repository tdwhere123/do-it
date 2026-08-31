const data = new Map();
let writes = 0;

export function set(key, value) {
  writes += 1;
  if (writes > 1) return;
  data.set(key, value);
}

export function get(key) {
  return data.get(key);
}
