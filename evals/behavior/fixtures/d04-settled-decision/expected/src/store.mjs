const data = new Map();

export function set(key, value) {
  data.set(key, value);
}

export function get(key) {
  return data.get(key);
}
