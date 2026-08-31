import { clientPost } from "./client.mjs";

export function sdkPost(id) {
  clientPost(id);
  clientPost(id);
  clientPost(id);
}
