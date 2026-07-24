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

# Session identity is host-supplied. This can preserve a boundary for a child
# only when the host provides the same session state; never infer a parent
# boundary across distinct session IDs.
NO_WRITE_NOTE=""
if [[ "$(do_it_session_state_get "$SESSION_ID" no_write_boundary)" == "1" ]]; then
  NO_WRITE_NOTE=" A no-write boundary is active for this hook session: inspect, diagnose, plan, or review only; do not edit or delegate implementation until the user explicitly reopens writes."
fi

do_it_emit_context UserPromptSubmit "<system-reminder>
do-it subagent stance: work autonomously on the delegated slice; keep writes and side effects within stated ownership. Before external writes, destructive or irreversible actions, material cost, or material scope expansion, ask the parent to obtain confirmation. Return useful evidence or uncertainty; let the parent integrate the result.
${NO_WRITE_NOTE}
</system-reminder>"

exit 0
