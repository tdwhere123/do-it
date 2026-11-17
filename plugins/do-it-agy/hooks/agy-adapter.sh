#!/usr/bin/env bash
# Antigravity (agy) command-hook adapter.
# Normalizes camelCase protojson payloads, isolates root vs subagent sessions via
# transcript step 0, and relays PostToolUse lint advisories through PostInvocation.
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
source "${SCRIPT_DIR}/lib/common.sh"

export DO_IT_EVENT_HOST=agy
unset DO_IT_CONTEXT_OUTPUT

if [[ -n "${PLUGIN_DATA:-}" ]]; then
  export DO_IT_HOOK_DATA="$PLUGIN_DATA"
fi

_agy_emit_empty() {
  printf '{}\n'
  exit 0
}

_agy_emit_inject_system() {
  local text="${1:-}"
  [[ -n "$text" ]] || _agy_emit_empty
  if [[ "$DO_IT_HAVE_JQ" == "1" ]]; then
    jq -nc --arg t "$text" '{injectSteps:[{systemMessage:{systemMessage:$t}}]}'
  else
    printf '{"injectSteps":[{"systemMessage":{"systemMessage":"%s"}}]}\n' \
      "$(_do_it_json_escape "$text")"
  fi
  exit 0
}

_agy_first_workspace_path() {
  local raw="$1"
  if [[ "$DO_IT_HAVE_JQ" == "1" ]]; then
    printf '%s' "$raw" | jq -r '.workspacePaths[0] // ""' 2>/dev/null
    return 0
  fi
  if command -v node >/dev/null 2>&1; then
    printf '%s' "$raw" | node -e '
      let s = "";
      process.stdin.setEncoding("utf8");
      process.stdin.on("data", (c) => { s += c; });
      process.stdin.on("end", () => {
        try {
          const d = JSON.parse(s);
          const v = Array.isArray(d?.workspacePaths) ? d.workspacePaths[0] : "";
          if (typeof v === "string") process.stdout.write(v);
        } catch {}
      });
    ' 2>/dev/null
    return 0
  fi
  if command -v python3 >/dev/null 2>&1; then
    printf '%s' "$raw" | python3 -c '
import json, sys
try:
    d = json.load(sys.stdin)
    ws = d.get("workspacePaths") if isinstance(d, dict) else None
    if isinstance(ws, list) and ws and isinstance(ws[0], str):
        sys.stdout.write(ws[0])
except Exception:
    pass
    ' 2>/dev/null
  fi
}

_agy_append_pending_locked() {
  local pending="$1" text="$2"
  if [[ -s "$pending" ]]; then
    printf '\n%s\n' "$text" >> "$pending" 2>/dev/null || true
  else
    printf '%s\n' "$text" > "$pending" 2>/dev/null || true
  fi
}

_agy_drain_pending_locked() {
  local pending="$1" out="$2"
  [[ -s "$pending" ]] || return 0
  cp "$pending" "$out" 2>/dev/null || return 1
  rm -f "$pending" 2>/dev/null || true
}

RAW_INPUT="$(do_it_read_stdin)"
field() { do_it_json_get_nested "$RAW_INPUT" "$1"; }

EVENT="$(field hookEventName)"
case "${1:-}:$EVENT" in
  session-start:SessionStart|pre-invocation:PreInvocation) ;;
  post-tool:PostToolUse|post-invocation:PostInvocation) ;;
  *) _agy_emit_empty ;;
esac

SESSION_ID="$(field conversationId)"
[[ -n "$SESSION_ID" ]] || _agy_emit_empty

CWD="$(field cwd)"
[[ -n "$CWD" ]] || CWD="$(_agy_first_workspace_path "$RAW_INPUT")"
[[ -d "$CWD" ]] || _agy_emit_empty

TRANSCRIPT="$(field transcriptPath)"
LAST_INPUT="$(field lastUserInput)"

case "${1:-}" in
  session-start)
    do_it_prune_stale_sessions "$SESSION_ID" >/dev/null 2>&1 || true
    # Wait for PreInvocation if step 0 is not written yet so child sessions
    # never receive root Core before transcript identity is available.
    if [[ -z "$TRANSCRIPT" || ! -s "$TRANSCRIPT" ]]; then
      _agy_emit_empty
    fi
    if do_it_in_subagent_context "$TRANSCRIPT" "$RAW_INPUT"; then
      STANCE_TEXT="$(printf '{"session_id":"%s","transcript_path":"%s","hook_event_name":"SessionStart"}' \
        "$(_do_it_json_escape "$SESSION_ID")" "$(_do_it_json_escape "$TRANSCRIPT")" \
        | DO_IT_CONTEXT_OUTPUT=plain bash "$SCRIPT_DIR/subagent-stance.sh" || true)"
      _agy_emit_inject_system "$STANCE_TEXT"
    fi
    TEXT="$(do_it_kernel_context_collect "$SESSION_ID" "$CWD" "$LAST_INPUT" "$TRANSCRIPT" "$RAW_INPUT")"
    _agy_emit_inject_system "$TEXT"
    ;;
  pre-invocation)
    do_it_prune_stale_sessions "$SESSION_ID" >/dev/null 2>&1 || true
    if do_it_in_subagent_context "$TRANSCRIPT" "$RAW_INPUT"; then
      STANCE_TEXT="$(printf '{"session_id":"%s","transcript_path":"%s","hook_event_name":"PreInvocation"}' \
        "$(_do_it_json_escape "$SESSION_ID")" "$(_do_it_json_escape "$TRANSCRIPT")" \
        | DO_IT_CONTEXT_OUTPUT=plain bash "$SCRIPT_DIR/subagent-stance.sh" || true)"
      _agy_emit_inject_system "$STANCE_TEXT"
    fi
    if [[ -n "$LAST_INPUT" ]]; then
      INPUT_HASH="$(printf '%s' "$LAST_INPUT" | _do_it_hash_key)"
      if [[ -n "$INPUT_HASH" && "$(do_it_session_state_get "$SESSION_ID" agy_last_input_hash)" != "$INPUT_HASH" ]]; then
        do_it_user_turn_bump "$SESSION_ID" >/dev/null 2>&1 || true
        do_it_session_state_set "$SESSION_ID" agy_last_input_hash "$INPUT_HASH" >/dev/null 2>&1 || true
      fi
    fi
    TEXT="$(do_it_kernel_context_collect "$SESSION_ID" "$CWD" "$LAST_INPUT" "$TRANSCRIPT" "$RAW_INPUT")"
    _agy_emit_inject_system "$TEXT"
    ;;
  post-tool)
    ERROR_VAL="$(field error)"
    [[ -z "$ERROR_VAL" ]] || _agy_emit_empty
    TOOL="$(field toolCall.name)"
    case "$TOOL" in
      write_file) MAPPED_TOOL="Write" ;;
      edit_file|replace_file_content|multi_replace_file_content) MAPPED_TOOL="Edit" ;;
      *) _agy_emit_empty ;;
    esac
    FILE_PATH="$(field toolCall.args.Path)"
    [[ -n "$FILE_PATH" ]] || FILE_PATH="$(field toolCall.args.TargetFile)"
    [[ -n "$FILE_PATH" ]] || FILE_PATH="$(field toolCall.args.file_path)"
    [[ -n "$FILE_PATH" ]] || FILE_PATH="$(field toolCall.args.path)"
    [[ -n "$FILE_PATH" ]] || _agy_emit_empty
    [[ "$FILE_PATH" == /* ]] || FILE_PATH="$CWD/$FILE_PATH"
    ADVISORY="$(printf '{"session_id":"%s","cwd":"%s","tool_name":"%s","transcript_path":"%s","tool_input":{"file_path":"%s"}}' \
      "$(_do_it_json_escape "$SESSION_ID")" "$(_do_it_json_escape "$CWD")" \
      "$MAPPED_TOOL" "$(_do_it_json_escape "$TRANSCRIPT")" "$(_do_it_json_escape "$FILE_PATH")" \
      | DO_IT_CONTEXT_OUTPUT=plain bash "$SCRIPT_DIR/write-quality-lint.sh" || true)"
    if [[ -n "$ADVISORY" ]]; then
      SESSION_DIR="$(do_it_session_dir "$SESSION_ID")"
      mkdir -p "$SESSION_DIR" 2>/dev/null || _agy_emit_empty
      _do_it_with_state_lock "${SESSION_DIR}/.state.lock" \
        _agy_append_pending_locked "${SESSION_DIR}/agy-pending-lint.txt" "$ADVISORY" || true
    fi
    _agy_emit_empty
    ;;
  post-invocation)
    SESSION_DIR="$(do_it_session_dir "$SESSION_ID")"
    PENDING="${SESSION_DIR}/agy-pending-lint.txt"
    [[ -s "$PENDING" ]] || _agy_emit_empty
    TMP_OUT="$(mktemp 2>/dev/null || printf '%s' "${SESSION_DIR}/.pending-drain.$$.$RANDOM")"
    _do_it_with_state_lock "${SESSION_DIR}/.state.lock" \
      _agy_drain_pending_locked "$PENDING" "$TMP_OUT" || true
    PENDING_TEXT="$(cat "$TMP_OUT" 2>/dev/null || true)"
    rm -f "$TMP_OUT" 2>/dev/null || true
    _agy_emit_inject_system "$PENDING_TEXT"
    ;;
esac

_agy_emit_empty
