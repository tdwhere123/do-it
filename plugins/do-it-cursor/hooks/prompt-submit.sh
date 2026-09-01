#!/usr/bin/env bash
# Serialized UserPromptSubmit entrypoint.
#
# DO_IT_ROUTER_MODE=thin (default): compact kernel + adaptive; classifier skipped.
# shadow: compact kernel + adaptive; classifier records diagnostics only.
# legacy: router then grill — 0.16 rollback and eval baseline.
#
# Fail-open: a missing kernel/adaptive script never crashes the turn.
# Router guidance is computed in-memory, so legacy still emits the tier
# advisory when the transaction lock is unavailable. Grill stays gated on
# persisted router state.

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
source "${SCRIPT_DIR}/lib/common.sh"
if [[ -f "${SCRIPT_DIR}/lib/task-state.sh" ]]; then
  # shellcheck source=lib/task-state.sh
  source "${SCRIPT_DIR}/lib/task-state.sh"
fi

RAW_INPUT="$(do_it_read_stdin)"
SESSION_ID="$(do_it_json_get "$RAW_INPUT" session_id)"
PROMPT="$(do_it_json_get_prompt "$RAW_INPUT")"
CWD="$(do_it_json_get "$RAW_INPUT" cwd)"
TRANSCRIPT_PATH="$(do_it_json_get "$RAW_INPUT" transcript_path)"
[[ -n "$CWD" ]] || CWD="."
turn_pid="${BASHPID:-$$}"
export DO_IT_PROMPT_TURN_TOKEN="${turn_pid}-${RANDOM}-${RANDOM}"
CONTEXT=""
MODE="$(do_it_router_mode)"

_append_context() {
  local chunk="$1"
  [[ -n "$chunk" ]] || return 0
  if [[ -n "$CONTEXT" ]]; then
    CONTEXT="${CONTEXT}"$'\n\n'
  fi
  CONTEXT="${CONTEXT}${chunk}"
}

_run_prompt_component() {
  local script_name="$1" output status
  if [[ ! -f "${SCRIPT_DIR}/${script_name}" ]]; then
    return 0
  fi
  output="$(
    printf '%s' "$RAW_INPUT" \
      | DO_IT_CONTEXT_OUTPUT=plain "$BASH" "${SCRIPT_DIR}/${script_name}"
  )"
  status=$?
  # Keep whatever the component emitted even when it exits non-zero (router
  # exit 2 = guidance emitted with failed state persistence).
  _append_context "$output"
  return "$status"
}

_run_kernel_prefix() {
  local text
  do_it_session_state_inc "$SESSION_ID" hook_invocations kernel_context 2>/dev/null || true
  text="$(do_it_kernel_context_collect "$SESSION_ID" "$CWD" "$PROMPT" "$TRANSCRIPT_PATH")"
  _append_context "$text"
  _run_prompt_component adaptive-context.sh || true
}

_run_legacy_transaction() {
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

_run_shadow_transaction() {
  _run_kernel_prefix
  _run_prompt_component router.sh
  local router_status=$?
  case "$router_status" in
    0)
      _run_prompt_component grill-prompt.sh || true
      ;;
    2)
      printf 'do-it: prompt router state unavailable; grill skipped\n' >&2
      ;;
  esac
}

_run_thin_transaction() {
  _run_kernel_prefix
  _run_prompt_component grill-prompt.sh || true
}

_run_prompt_transaction() {
  case "$MODE" in
    shadow) _run_shadow_transaction ;;
    thin) _run_thin_transaction ;;
    *) _run_legacy_transaction ;;
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
  # Lock acquisition failed and nothing was emitted yet. Never run the
  # transaction twice for one turn when CONTEXT is already populated.
  if [[ "$MODE" == "legacy" ]]; then
    printf 'do-it: prompt transaction lock unavailable; router guidance only\n' >&2
    _run_prompt_component router.sh || true
  else
    printf 'do-it: prompt transaction lock unavailable; kernel guidance only\n' >&2
    _run_kernel_prefix
  fi
fi

[[ -n "$CONTEXT" ]] && do_it_emit_context UserPromptSubmit "$CONTEXT"
exit 0
