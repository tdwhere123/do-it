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
do_it_session_state_inc "$SESSION_ID" hook_invocations subagent_dispatch
do_it_debug subagent-stance "decision=emit event=subagent_dispatch"

# do-it-contract:agent.child-contract
# do-it-contract:delegation.child-write-boundary
do_it_emit_context UserPromptSubmit "<system-reminder>
do-it subagent stance: gather evidence and reach conclusions independently on the delegated slice; parent opinions are hypotheses, not authority; keep writes and side effects within stated ownership. Preserve assigned review-only and no-write boundaries and existing authorization. Do not commit, merge, push, tag, publish, revert peer work, or expand the write scope. For external writes, destructive or irreversible actions, material cost, or material scope expansion not already authorized, ask the parent to obtain confirmation. Return useful evidence or uncertainty; let the parent integrate the result. The parent owns the task contract and the completion claim.
</system-reminder>"

exit 0
