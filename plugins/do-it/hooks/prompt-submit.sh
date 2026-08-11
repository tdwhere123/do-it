#!/usr/bin/env bash
# Serialized UserPromptSubmit entrypoint for router + grill-prompt.
# Hosts may run matching hook commands concurrently; these two scripts have a
# producer -> consumer state contract and therefore execute behind one command.
#
# Fail-open contract: router's guidance is computed in-memory, so the model
# always gets the tier advisory for the turn even when the transaction lock is
# unavailable or router state persistence fails. Only grill — a consumer of
# router's persisted state — is gated on those conditions.

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
source "${SCRIPT_DIR}/lib/common.sh"

RAW_INPUT="$(do_it_read_stdin)"
SESSION_ID="$(do_it_json_get "$RAW_INPUT" session_id)"
turn_pid="${BASHPID:-$$}"
export DO_IT_PROMPT_TURN_TOKEN="${turn_pid}-${RANDOM}-${RANDOM}"
CONTEXT=""

_run_prompt_component() {
  local script_name="$1" output status
  output="$(
    printf '%s' "$RAW_INPUT" \
      | DO_IT_CONTEXT_OUTPUT=plain "$BASH" "${SCRIPT_DIR}/${script_name}"
  )"
  status=$?
  # Keep whatever the component emitted even when it exits non-zero (router
  # exit 2 = guidance emitted with failed state persistence).
  if [[ -n "$output" ]]; then
    if [[ -n "$CONTEXT" ]]; then
      CONTEXT="${CONTEXT}"$'\n\n'
    fi
    CONTEXT="${CONTEXT}${output}"
  fi
  return "$status"
}

_run_prompt_transaction() {
  _run_prompt_component router.sh
  local router_status=$?
  case "$router_status" in
    0)
      _run_prompt_component grill-prompt.sh || true
      ;;
    2)
      # Router emitted guidance but could not persist session state; grill
      # reads the persisted tier and must not run on stale or absent data.
      printf 'do-it: prompt router state unavailable; grill skipped\n' >&2
      ;;
    *)
      return 1
      ;;
  esac
}

session_dir="$(do_it_session_dir "$SESSION_ID")"
if ! mkdir -p "$session_dir" 2>/dev/null; then
  printf 'do-it: prompt-submit session dir unavailable (%s); router guidance skipped\n' "$session_dir" >&2
  exit 0
fi

_do_it_with_state_lock "$session_dir/.prompt.lock" _run_prompt_transaction
lock_status=$?
if [[ "$lock_status" -eq 1 && -z "$CONTEXT" ]]; then
  # Lock acquisition failed (concurrent turn or stale lock) and nothing was
  # emitted yet: router's guidance is computed in-memory and its state writes
  # are independently locked, so emit it rather than dropping the turn's
  # advisory entirely. A non-empty CONTEXT means the transaction already ran
  # (e.g. release-failure corner) — never run router twice for one turn.
  printf 'do-it: prompt transaction lock unavailable; router guidance only\n' >&2
  _run_prompt_component router.sh || true
fi

[[ -n "$CONTEXT" ]] && do_it_emit_context UserPromptSubmit "$CONTEXT"
exit 0
