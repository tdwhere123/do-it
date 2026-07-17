/**
 * manifest.json holds shared install entries in top-level `commonExtras` and
 * per-target deltas in `targets.<name>.extras`. A target's effective extras
 * are the common entries plus its own; an own entry with the same `name`
 * replaces the common one (Cursor uses this to drop legacyHashes that only
 * Codex/Claude legacy installs need).
 */

/**
 * @param {object} manifest Parsed manifest.json
 * @param {string} targetName Key under manifest.targets
 * @returns {Array<object>} Effective extras for the target, common entries first.
 */
export function targetExtras(manifest, targetName) {
  const common = manifest.commonExtras ?? [];
  const own = manifest.targets?.[targetName]?.extras ?? [];
  const ownNames = new Set(own.map((entry) => entry.name));
  return [...common.filter((entry) => !ownNames.has(entry.name)), ...own];
}
