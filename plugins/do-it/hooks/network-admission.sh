#!/usr/bin/env bash
# Live-network admission for thin/shadow. Inspects the shell command only.
# Claude PreToolUse: permissionDecision ask. Hosts that cannot veto: observe
# reminder. Fail-open: never crash, never echo the raw command.

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
source "${SCRIPT_DIR}/lib/common.sh"
# shellcheck source=lib/debug.sh
source "${SCRIPT_DIR}/lib/debug.sh"

RAW_INPUT="$(do_it_read_stdin || true)"

# Pull a bash/shell command from common host JSON shapes. Empty on parse miss.
_doit_network_command() {
  local raw="${1:-}" cmd="" pathspec
  for pathspec in tool_input.command tool_input.cmd command input.command; do
    cmd="$(do_it_json_get_nested "$raw" "$pathspec" 2>/dev/null || true)"
    cmd="${cmd%$'\n'}"
    if [[ -n "$cmd" && "$cmd" != "null" ]]; then
      printf '%s' "$cmd"
      return 0
    fi
  done
  return 0
}

# Claude PreToolUse can ask. Pi/OpenCode set CLAUDE_PLUGIN_ROOT for data dirs
# but cannot veto; Cursor/Kimi/Codex are PostToolUse-only.
_doit_network_can_ask() {
  local event="${1:-}"
  case "${DO_IT_NETWORK_ADMISSION:-}" in
    observe|OBSERVE) return 1 ;;
  esac
  case "${DO_IT_EVENT_HOST:-}" in
    pi|opencode|cursor|codex|kimi) return 1 ;;
  esac
  [[ -n "${CURSOR_PLUGIN_ROOT:-}" ]] && return 1
  [[ -n "${KIMI_CODE_HOME:-}" || -n "${KIMI_PLUGIN_ROOT:-}" ]] && return 1
  case "$event" in
    PostToolUse|postToolUse) return 1 ;;
  esac
  if [[ -n "${CLAUDE_PLUGIN_ROOT:-}" ]]; then
    return 0
  fi
  case "$event" in
    PreToolUse) return 0 ;;
  esac
  return 1
}

_doit_network_remind() {
  local event="${1:-PostToolUse}" text
  if text="$(do_it_core_rule r-boundary)"; then
    do_it_emit_context "$event" "<system-reminder>
${text}
</system-reminder>"
  else
    do_it_emit_context "$event" "<system-reminder>
do-it core §r-boundary.
</system-reminder>"
  fi
}

if [[ "$(do_it_router_mode)" == "legacy" ]]; then
  do_it_debug network-admission "decision=skip reason=legacy"
  exit 0
fi

COMMAND="$(_doit_network_command "$RAW_INPUT")"
if [[ -z "$COMMAND" ]]; then
  do_it_debug network-admission "decision=skip reason=no-command"
  exit 0
fi

if ! declare -F do_it_command_has_unauth_live_network >/dev/null 2>&1; then
  do_it_debug network-admission "decision=skip reason=detector-missing"
  exit 0
fi

if ! do_it_command_has_unauth_live_network "$COMMAND" >/dev/null; then
  do_it_debug network-admission "decision=skip reason=not-unauth-live"
  exit 0
fi

EVENT="$(do_it_json_get "$RAW_INPUT" hook_event_name 2>/dev/null || true)"
EVENT="${EVENT%$'\n'}"
if [[ -z "$EVENT" ]]; then
  EVENT="$(do_it_json_get "$RAW_INPUT" hookEventName 2>/dev/null || true)"
  EVENT="${EVENT%$'\n'}"
fi

if _doit_network_can_ask "$EVENT"; then
  do_it_debug network-admission "decision=ask"
  printf '%s\n' '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"ask","permissionDecisionReason":"do-it: live network request needs explicit user authorization."}}'
  exit 0
fi

do_it_debug network-admission "decision=remind"
_doit_network_remind "${EVENT:-PostToolUse}"
exit 0
