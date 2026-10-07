export function expiredEntries(entries, before) {
  return entries.filter((entry) => entry.createdAt < before);
}
