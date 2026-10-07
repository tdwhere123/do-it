import { toJob } from "./mapper.mjs";

export function enqueue(request, queue) {
  queue.push(toJob(request));
  return { accepted: true };
}
