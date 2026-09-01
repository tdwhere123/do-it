#!/usr/bin/env bash
# do-it sessionStart bootstrap (Cursor plugin).
# Injects compact workflow awareness once per session.

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
source "${SCRIPT_DIR}/lib/common.sh"

RAW_INPUT="$(do_it_read_stdin)"
SESSION_ID="$(do_it_json_get "$RAW_INPUT" session_id)"
CWD="$(do_it_json_get "$RAW_INPUT" cwd)"
PROMPT="$(do_it_json_get_prompt "$RAW_INPUT")"
TRANSCRIPT_PATH="$(do_it_json_get "$RAW_INPUT" transcript_path)"
[[ -n "$CWD" ]] || CWD="."

do_it_session_state_inc "$SESSION_ID" hook_invocations session_start 2>/dev/null || true

if [[ -f "${SCRIPT_DIR}/lib/task-state.sh" ]]; then
  # shellcheck source=lib/task-state.sh
  source "${SCRIPT_DIR}/lib/task-state.sh"
fi

CONTEXT=""
if [[ "$(do_it_router_mode)" != "legacy" ]]; then
  CONTEXT="$(do_it_kernel_context_collect "$SESSION_ID" "$CWD" "$PROMPT" "$TRANSCRIPT_PATH")"
  # SessionStart is the host's once-per-session event. If collect is empty
  # (missing session dir, already-hashed, or doctor smoke), still emit the
  # kernel so Cursor additional_context is never blank in thin/shadow.
  if [[ -z "$CONTEXT" ]]; then
    CONTEXT="$(do_it_kernel_body)"
  fi
else
  read -r -d '' CONTEXT <<'EOF' || true
do-it is active. Match depth to the task: choose skills or subagents when they help, and keep direct user intent above hook labels.

Read current truth before changing a repo. Keep external or destructive actions confirmed; for local work, choose task-relevant evidence and state any remaining uncertainty before claiming completion.
EOF
fi

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
