import { setCount } from "./store.mjs";

export function incrementFrom(snapshot) {
  setCount(snapshot + 1);
}
