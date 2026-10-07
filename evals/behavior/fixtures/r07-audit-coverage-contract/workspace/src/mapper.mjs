export function toJob(request) {
  return { eventId: request.eventId, amount: request.amount };
}
