import { produceStatus } from "../domain/status.mjs";

export function statusLabel(n) {
  return produceStatus(n);
}
