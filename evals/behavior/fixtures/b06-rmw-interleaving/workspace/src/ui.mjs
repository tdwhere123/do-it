import { getCount } from "./store.mjs";

export function display() {
  return String(getCount());
}
