#!/usr/bin/env bash
# Compact session context; malformed host input is advisory and fail-open.
set -uo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
source "${SCRIPT_DIR}/lib/common.sh"
RAW_INPUT="$(do_it_read_stdin)"
SESSION_ID="$(do_it_json_get "$RAW_INPUT" session_id)"
PROMPT="$(do_it_json_get_prompt "$RAW_INPUT")"
CWD="$(do_it_json_get "$RAW_INPUT" cwd)"
TRANSCRIPT_PATH="$(do_it_json_get "$RAW_INPUT" transcript_path)"
do_it_user_turn_bump "$SESSION_ID" >/dev/null 2>&1 || true
text="$(do_it_kernel_context_collect "$SESSION_ID" "${CWD:-.}" "$PROMPT" "$TRANSCRIPT_PATH")"
[[ -z "$text" ]] || do_it_emit_context "${DO_IT_KERNEL_EVENT:-UserPromptSubmit}" "$text"
exit 0
