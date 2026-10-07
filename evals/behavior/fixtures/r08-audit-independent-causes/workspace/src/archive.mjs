export function archiveKey({ customerId, createdAt, runId }) {
  return `${customerId}:${Math.floor(createdAt / 1000)}`;
}
