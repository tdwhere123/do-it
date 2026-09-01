export function ping(url) {
  if (!url) return { ok: false, reason: "missing-url" };
  return { ok: true, url };
}
