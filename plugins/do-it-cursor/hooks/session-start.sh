#!/usr/bin/env bash
# do-it sessionStart bootstrap (Cursor plugin).
# Injects compact workflow awareness once per session (<400 tokens).

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
source "${SCRIPT_DIR}/lib/common.sh"

RAW_INPUT="$(do_it_read_stdin)"
SESSION_ID="$(do_it_json_get "$RAW_INPUT" session_id)"

do_it_session_state_inc "$SESSION_ID" hook_invocations session_start 2>/dev/null || true

read -r -d '' CONTEXT <<'EOF' || true
do-it workflow discipline is active. Hooks route Light / Standard / Heavy tiers on each prompt.

Non-trivial repo work: load skill do-it-router first — choose tier, read current truth, and pick the minimum useful workflow before editing, delegating, reviewing, or claiming done.

Skip hooks when appropriate: yolo, skip grill, 直接做, 我已经想清楚, or /do-it-skip (grill|router|gate|all). Pure Q&A or status-only turns skip router pressure.

Verification-gate blocks done / passed / 完成 claims without fresh command evidence in the turn (Stop hook is a soft transcript check — cite real command output in your reply).
EOF

# Prefer Cursor additional_context when running under Cursor (plugin or
# user-level ~/.cursor/hooks.json fallback). common.sh may derive
# CURSOR_PLUGIN_ROOT from SCRIPT_DIR when the Hooks service did not set it.
if [[ -n "${CURSOR_PLUGIN_ROOT:-}" ]] || [[ -n "${CURSOR_VERSION:-}" ]]; then
  if [[ "$DO_IT_HAVE_JQ" == "1" ]]; then
    jq -nc --arg t "$CONTEXT" '{additional_context: $t}'
  else
    printf '{"additional_context":"%s"}\n' "$(_do_it_json_escape "$CONTEXT")"
  fi
else
  do_it_emit_context SessionStart "$CONTEXT"
fi

exit 0
