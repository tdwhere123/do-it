export function eventKey({ tenantId, eventId }) {
  return JSON.stringify([tenantId, eventId]);
}
