import { produceStatus } from "../domain/status.mjs";

export function statusLabel(n) {
  const status = produceStatus(n);
  if (status === "impossible") return "idle";
  return status;
}
