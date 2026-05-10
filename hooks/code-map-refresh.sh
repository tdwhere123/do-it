#!/usr/bin/env bash
# do-it code-map refresh marker (PostToolUse, matcher: Edit|Write|MultiEdit|NotebookEdit).
# When an edit lands on a file whose location is structural to the project
# (package barrel, migration, route table), prepend a stale marker to
# .do-it/handbook/code-map.md so the next code-mapper dispatch refreshes that
# section instead of trusting a stale snapshot.
#
# This hook only marks; it never rewrites code-map.md content. Refreshing the
# "Current implementation locations" section is the code-mapper agent's job.

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
source "${SCRIPT_DIR}/lib/common.sh"
# shellcheck source=lib/debug.sh
source "${SCRIPT_DIR}/lib/debug.sh"

RAW_INPUT="$(do_it_read_stdin)"
SESSION_ID="$(do_it_json_get "$RAW_INPUT" session_id)"
CWD="$(do_it_json_get "$RAW_INPUT" cwd)"
TOOL_NAME="$(do_it_json_get "$RAW_INPUT" tool_name)"
FILE_PATH="$(do_it_json_get_nested "$RAW_INPUT" tool_input.file_path)"

do_it_session_state_inc "$SESSION_ID" hook_invocations code_map_refresh

case "$TOOL_NAME" in
  Edit|Write|MultiEdit|NotebookEdit) ;;
  *) exit 0 ;;
esac

if [[ -z "$FILE_PATH" ]]; then
  exit 0
fi

PROJECT_ROOT="$(do_it_project_root "$CWD")"
PROJECT_ROOT="${PROJECT_ROOT%/}"

case "$FILE_PATH" in
  "$PROJECT_ROOT"/*) REL_PATH="${FILE_PATH#"$PROJECT_ROOT"/}" ;;
  *) exit 0 ;;
esac

CODE_MAP="$PROJECT_ROOT/.do-it/handbook/code-map.md"
if [[ ! -f "$CODE_MAP" ]]; then
  do_it_debug code-map-refresh "decision=skip reason=no-handbook"
  exit 0
fi

# Decide whether this edit affects structural locations the code map cares
# about. Defaults are conservative: package barrels, migration files, and
# route tables. Projects that need a different list can override via a local
# keyword file the hooks library will source if present.
REASON=""
case "$REL_PATH" in
  packages/*/src/index.ts|packages/*/src/index.tsx|packages/*/src/index.js|packages/*/src/index.mjs)
    REASON="package barrel changed: $REL_PATH" ;;
  apps/*/src/index.ts|apps/*/src/index.tsx|apps/*/src/index.js|apps/*/src/index.mjs)
    REASON="app barrel changed: $REL_PATH" ;;
  packages/*/src/main.ts|apps/*/src/main.ts|src/main.ts|src/index.ts)
    REASON="entry point changed: $REL_PATH" ;;
  *migrations/*.sql|*migrations/*.ts|*migrations/*.js|*migrations/*.mjs)
    REASON="migration changed: $REL_PATH" ;;
  *routes/*.ts|*routes/*.tsx|*routes/*.js|*routes/*.jsx|*routes/*.py)
    REASON="route changed: $REL_PATH" ;;
  manifest.json|package.json|pnpm-workspace.yaml|turbo.json|nx.json)
    REASON="workspace manifest changed: $REL_PATH" ;;
esac

if [[ -z "$REASON" ]]; then
  exit 0
fi

# Idempotent stale marker. Replace the existing first-line marker if one is
# present; otherwise insert at the top.
TMP="$(mktemp "${TMPDIR:-/tmp}/do-it-code-map.XXXXXX")"
trap 'rm -f "$TMP"' EXIT

FIRST_LINE="$(head -n 1 "$CODE_MAP" 2>/dev/null || true)"
if [[ "$FIRST_LINE" =~ ^\<\!--[[:space:]]*stale: ]]; then
  # Replace the existing marker line.
  {
    printf '<!-- stale: true; reason: %s -->\n' "$REASON"
    tail -n +2 "$CODE_MAP"
  } > "$TMP"
else
  {
    printf '<!-- stale: true; reason: %s -->\n' "$REASON"
    cat "$CODE_MAP"
  } > "$TMP"
fi

mv "$TMP" "$CODE_MAP"
do_it_debug code-map-refresh "decision=marked rel=$REL_PATH reason=\"$REASON\""
exit 0
