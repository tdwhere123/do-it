import { post } from "./post.mjs";

export function clientPost(id) {
  post(id);
  post(id);
  post(id);
}
