export class CreditLedger {
  #events = new Map();

  accept({ tenantId, eventId, amount }) {
    const key = JSON.stringify([tenantId, eventId]);
    if (this.#events.has(key)) return false;
    this.#events.set(key, amount);
    return true;
  }

  total() {
    return [...this.#events.values()].reduce((sum, amount) => sum + amount, 0);
  }
}
