export function charge(client, amount) {
  return client.submit(amount);
}
