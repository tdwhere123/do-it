#!/usr/bin/env bash
# do-it subagent stance (SubagentStart / UserPromptSubmit / adapter hook).
# Parent context hooks skip recognized subagent transcripts. This hook supplies
# compact child ownership and confirmation boundaries without root context.

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
source "${SCRIPT_DIR}/lib/common.sh"
# shellcheck source=lib/debug.sh
source "${SCRIPT_DIR}/lib/debug.sh"

RAW_INPUT="$(do_it_read_stdin)"
SESSION_ID="$(do_it_json_get "$RAW_INPUT" session_id)"
[[ -n "$SESSION_ID" ]] || SESSION_ID="$(do_it_json_get "$RAW_INPUT" sessionId)"
TRANSCRIPT_PATH="$(do_it_json_get "$RAW_INPUT" transcript_path)"
[[ -n "$TRANSCRIPT_PATH" ]] || TRANSCRIPT_PATH="$(do_it_json_get "$RAW_INPUT" transcriptPath)"

if ! do_it_in_subagent_context "$TRANSCRIPT_PATH" "$RAW_INPUT"; then
  do_it_debug subagent-stance "decision=skip reason=parent-context"
  exit 0
fi

SESSION_ID="$(do_it_effective_session_id "$SESSION_ID" "$TRANSCRIPT_PATH" "$RAW_INPUT")"
do_it_session_state_inc "$SESSION_ID" hook_invocations subagent_stance

# Pi deduplicates from actual persisted custom-message delivery. Hook output
# can be lost to timeout/cancellation before the SDK stores it, so a pre-output
# state flag is not a receipt. Keep the historical once-only behavior elsewhere.
if [[ "${DO_IT_EVENT_HOST:-}" != "pi" || "${DO_IT_PI_SESSION_ROLE:-}" != "child" ]]; then
  if [[ "$(do_it_session_state_get "$SESSION_ID" subagent_stance_seen)" == "1" ]]; then
    do_it_debug subagent-stance "decision=skip reason=already-seen"
    exit 0
  fi
  do_it_session_state_set "$SESSION_ID" subagent_stance_seen 1
fi
do_it_session_state_inc "$SESSION_ID" hook_invocations subagent_dispatch
do_it_debug subagent-stance "decision=emit event=subagent_dispatch"

EVENT="$(do_it_json_get "$RAW_INPUT" hook_event_name)"
[[ -n "$EVENT" ]] || EVENT="$(do_it_json_get "$RAW_INPUT" hookEventName)"
[[ -n "$EVENT" ]] || EVENT="UserPromptSubmit"

STANCE_BODY="do-it subagent stance: gather evidence and reach conclusions independently on the delegated slice; parent opinions are hypotheses, not authority; keep writes and side effects within stated ownership. Preserve assigned review-only and no-write boundaries and existing authorization. Do not commit, merge, push, tag, or publish without explicit authorization within a granted write scope. Never revert peer work or expand that scope. For external writes, destructive or irreversible actions, material cost, or material scope expansion not already authorized, ask the parent to obtain confirmation. Return useful evidence or uncertainty; let the parent integrate the result. The parent owns the task contract and the completion claim."

# Grok and AGY wrap hook injections at the host layer; nesting XML tags gets escaped.
# do-it-contract:agent.child-contract
# do-it-contract:delegation.child-write-boundary
if [[ "${DO_IT_EVENT_HOST:-}" == "grok" || "${DO_IT_EVENT_HOST:-}" == "agy" ]]; then
  do_it_emit_context "$EVENT" "$STANCE_BODY"
else
  do_it_emit_context "$EVENT" "<system-reminder>
${STANCE_BODY}
</system-reminder>"
fi

exit 0
