export function drain(queue, ledger) {
  return queue.splice(0).map((job) => ledger.accept(job));
}
