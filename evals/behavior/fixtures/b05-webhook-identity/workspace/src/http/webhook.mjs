import { charge } from "../billing/charges.mjs";

export function handleWebhook(event) {
  charge(event.id, event.amount);
  return 200;
}
