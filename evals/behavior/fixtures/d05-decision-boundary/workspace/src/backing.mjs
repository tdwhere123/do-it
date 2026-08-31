const rows = new Map();

export function read(key) {
  return rows.get(key);
}

export function write(key, value) {
  rows.set(key, value);
}
