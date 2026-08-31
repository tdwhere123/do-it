import { read, write } from "./backing.mjs";

const cache = new Map();

export function get(key) {
  if (cache.has(key)) return cache.get(key);
  const value = read(key);
  if (value !== undefined) cache.set(key, value);
  return value;
}

export function set(key, value) {
  write(key, value);
  cache.set(key, value);
}
