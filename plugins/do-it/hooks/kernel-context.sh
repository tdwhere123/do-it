#!/usr/bin/env bash
# Compact kernel injection for DO_IT_ROUTER_MODE=shadow|thin.
# Once per session (digest of kernel body). Active-task re-injects on pointer change.
# No-write reminder is every turn and is never dropped by once-dedup.
# Missing profile/active-task adds no extra lines. Fail-open: never crash.

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
source "${SCRIPT_DIR}/lib/common.sh"
# shellcheck source=lib/debug.sh
source "${SCRIPT_DIR}/lib/debug.sh"
if [[ -f "${SCRIPT_DIR}/lib/task-state.sh" ]]; then
  # shellcheck source=lib/task-state.sh
  source "${SCRIPT_DIR}/lib/task-state.sh"
fi

RAW_INPUT="$(do_it_read_stdin)"
PROMPT="$(do_it_json_get_prompt "$RAW_INPUT")"
SESSION_ID="$(do_it_json_get "$RAW_INPUT" session_id)"
CWD="$(do_it_json_get "$RAW_INPUT" cwd)"
TRANSCRIPT_PATH="$(do_it_json_get "$RAW_INPUT" transcript_path)"
[[ -n "$CWD" ]] || CWD="."

if [[ "$(do_it_router_mode)" == "legacy" ]]; then
  do_it_debug kernel-context "decision=skip reason=legacy"
  exit 0
fi

if do_it_in_subagent_context "$TRANSCRIPT_PATH"; then
  do_it_debug kernel-context "decision=skip reason=subagent"
  exit 0
fi

do_it_session_state_inc "$SESSION_ID" hook_invocations kernel_context 2>/dev/null || true

text="$(do_it_kernel_context_collect "$SESSION_ID" "$CWD" "$PROMPT" "$TRANSCRIPT_PATH")"
if [[ -z "$text" ]]; then
  do_it_debug kernel-context "decision=skip reason=unchanged"
  exit 0
fi

do_it_debug kernel-context "decision=inject mode=$(do_it_router_mode)"
do_it_emit_context "${DO_IT_KERNEL_EVENT:-UserPromptSubmit}" "$text"
exit 0
