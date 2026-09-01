export function withdraw(balance, amount) {
  return { ok: true, balance: balance - amount };
}
