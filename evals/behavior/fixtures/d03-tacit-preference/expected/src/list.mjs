export function sortItems(items) {
  return [...items].sort((a, b) => b.timestamp - a.timestamp);
}
