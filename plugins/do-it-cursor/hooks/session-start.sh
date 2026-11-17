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

if do_it_in_subagent_context "$TRANSCRIPT_PATH" "$RAW_INPUT"; then
  exit 0
fi

do_it_prune_stale_sessions "$SESSION_ID" >/dev/null 2>&1 || true
do_it_session_state_inc "$SESSION_ID" hook_invocations session_start 2>/dev/null || true

CONTEXT="$(do_it_kernel_context_collect "$SESSION_ID" "$CWD" "$PROMPT" "$TRANSCRIPT_PATH" "$RAW_INPUT")"
[[ -n "$CONTEXT" ]] || CONTEXT="$(do_it_kernel_body)"

do_it_emit_context SessionStart "$CONTEXT"
exit 0
