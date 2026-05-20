// Version-migration logic for the do-it install state.
//
// Extracted from manage.mjs so it can be unit-tested without running the full
// install flow. manage.mjs imports from here; tests import from here directly.
// Every function is pure (or mutates only the passed-in state object) and takes
// its `log` sink as an argument, so tests never depend on process/argv/manifest.

// "0.8.0" -> "0.8". Returns null for non-version strings.
export function parseMinor(version) {
  if (typeof version !== "string") return null;
  const match = /^(\d+)\.(\d+)/.exec(version);
  if (!match) return null;
  return `${match[1]}.${match[2]}`;
}

// True when `version` falls inside a migration `from` spec. A spec is either an
// exact version ("0.7.3") or a minor wildcard ("0.7.x").
export function matchesFromRange(spec, version) {
  if (!spec || !version) return false;
  if (spec === version) return true;
  if (spec.endsWith(".x")) {
    const base = spec.slice(0, -2);
    return version.startsWith(`${base}.`);
  }
  return false;
}

// True when the recorded install state is from a different minor than the
// bundled manifest. Patch-only differences (0.8.0 -> 0.8.1) do not migrate;
// install rewrites the state version anyway.
export function needsMigration(state, manifestVersion) {
  if (!state || typeof state !== "object") return false;
  if (!state.version) return false;
  if (state.version === manifestVersion) return false;
  const stateMinor = parseMinor(state.version);
  const manifestMinor = parseMinor(manifestVersion);
  return (
    stateMinor !== null &&
    manifestMinor !== null &&
    stateMinor !== manifestMinor
  );
}

// Apply one migration action to `state` in place. Unknown action types throw:
// the manifest ships in the same package as this code, so an unrecognized type
// means a malformed manifest.json, and a silent skip would leave a partially
// migrated state. Fail loud instead.
export function applyMigrationAction(action, state, log = console.error) {
  switch (action?.type) {
    case "remove-state-entry": {
      if (state.entries && state.entries[action.target]) {
        delete state.entries[action.target];
        log(`[do-it]   removed state entry ${action.target}`);
      }
      break;
    }
    case "rename-state-key": {
      if (
        state.entries &&
        state.entries[action.from] &&
        !state.entries[action.to]
      ) {
        state.entries[action.to] = state.entries[action.from];
        delete state.entries[action.from];
        log(`[do-it]   renamed state entry ${action.from} → ${action.to}`);
      }
      break;
    }
    default:
      throw new Error(
        `do-it: unknown migration action in manifest.json: ` +
          `${JSON.stringify(action)}. The manifest is malformed or newer ` +
          `than this do-it package — upgrade or reinstall the do-it package.`
      );
  }
}

// Apply every migration whose `from` range matches `fromVersion`, in manifest
// order. Mutates `state` in place.
export function applyMatchingMigrations(
  state,
  migrations,
  fromVersion,
  log = console.error
) {
  const list = Array.isArray(migrations) ? migrations : [];
  for (const migration of list) {
    if (!matchesFromRange(migration.from, fromVersion)) continue;
    for (const action of migration.actions ?? []) {
      applyMigrationAction(action, state, log);
    }
  }
}
