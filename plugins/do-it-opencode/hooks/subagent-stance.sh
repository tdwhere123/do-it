#!/usr/bin/env bash
# do-it subagent stance (UserPromptSubmit hook).
# Parent router/grill hooks intentionally skip subagent transcripts. This hook
# gives child agents the small amount of do-it posture they still need without
# injecting the full parent workflow.

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
source "${SCRIPT_DIR}/lib/common.sh"
# shellcheck source=lib/debug.sh
source "${SCRIPT_DIR}/lib/debug.sh"

RAW_INPUT="$(do_it_read_stdin)"
SESSION_ID="$(do_it_json_get "$RAW_INPUT" session_id)"
TRANSCRIPT_PATH="$(do_it_json_get "$RAW_INPUT" transcript_path)"

if ! do_it_in_subagent_context "$TRANSCRIPT_PATH"; then
  do_it_debug subagent-stance "decision=skip reason=parent-context"
  exit 0
fi

do_it_session_state_inc "$SESSION_ID" hook_invocations subagent_stance

if [[ "$(do_it_session_state_get "$SESSION_ID" subagent_stance_seen)" == "1" ]]; then
  do_it_debug subagent-stance "decision=skip reason=already-seen"
  exit 0
fi

do_it_session_state_set "$SESSION_ID" subagent_stance_seen 1

do_it_emit_context UserPromptSubmit "<system-reminder>
do-it subagent stance: stay in the delegated slice (Standard tier); return evidence and stop at the contract boundary — no Heavy self-promotion, forbidden paths, or integration claims.
</system-reminder>"

exit 0
