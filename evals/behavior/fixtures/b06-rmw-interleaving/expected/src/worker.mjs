import { casIncrement, getCount } from "./store.mjs";

export function incrementFrom(snapshot) {
  if (casIncrement(snapshot)) return true;
  return casIncrement(getCount());
}
