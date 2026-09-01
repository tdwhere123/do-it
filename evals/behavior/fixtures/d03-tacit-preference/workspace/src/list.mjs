export function sortItems(items) {
  return [...items].sort((a, b) => a.name.localeCompare(b.name));
}
