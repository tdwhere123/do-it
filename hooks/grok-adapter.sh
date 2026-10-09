#!/usr/bin/env bash
# Grok command-hook adapter. Core arrives after the first completed tool;
# Grok discards SessionStart and allowing UserPromptSubmit context.
set -uo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
source "${SCRIPT_DIR}/lib/common.sh"
export DO_IT_EVENT_HOST=grok
unset DO_IT_CONTEXT_OUTPUT
# Grok supplies writable plugin data outside the installed bundle. Its Claude
# aliases are compatibility values, not evidence that this is a Claude event.
if [[ -n "${GROK_PLUGIN_DATA:-}" ]]; then
  export DO_IT_HOOK_DATA="$GROK_PLUGIN_DATA"
  export CLAUDE_PLUGIN_DATA="$GROK_PLUGIN_DATA"
fi
RAW_INPUT="$(do_it_read_stdin)"
field() { do_it_json_get_nested "$RAW_INPUT" "$1"; }
EVENT="$(field hook_event_name)"
[[ -n "$EVENT" ]] || EVENT="$(field hookEventName)"
[[ -n "$EVENT" ]] || EVENT="${GROK_HOOK_EVENT:-}"
case "${1:-}:$EVENT" in
  user-turn:UserPromptSubmit|user-turn:user_prompt_submit) ;;
  core:PostToolUse|core:post_tool_use|write-quality:PostToolUse|write-quality:post_tool_use) ;;
  *) exit 0 ;;
esac
SESSION_ID="$(field sessionId)"
[[ -n "$SESSION_ID" ]] || SESSION_ID="${GROK_SESSION_ID:-}"
# Missing identity must not share an unrelated session's Core/dedup state.
[[ -n "$SESSION_ID" ]] || exit 0
CWD="$(field cwd)"
[[ -n "$CWD" ]] || CWD="$(field workspaceRoot)"
[[ -n "$CWD" ]] || CWD="${GROK_WORKSPACE_ROOT:-}"
[[ -d "$CWD" ]] || exit 0
TRANSCRIPT="$(field transcriptPath)"
case "${1:-}" in
  user-turn)
    # Prompt stdout is discarded by Grok: update state only, never consume Core.
    do_it_user_turn_bump "$SESSION_ID" >/dev/null 2>&1 || true
    ;;
  core)
    TEXT="$(do_it_kernel_context_collect "$SESSION_ID" "$CWD" "" "$TRANSCRIPT")"
    [[ -z "$TEXT" ]] || do_it_emit_context PostToolUse "$TEXT"
    ;;
  write-quality)
    TOOL="$(field toolName)"
    case "$TOOL" in search_replace|Edit|Write|MultiEdit) ;; *) exit 0 ;; esac
    FILE_PATH="$(field toolInput.file_path)"
    [[ -n "$FILE_PATH" ]] || FILE_PATH="$(field toolInput.path)"
    [[ -n "$FILE_PATH" ]] || FILE_PATH="$(field toolInput.filePath)"
    [[ -n "$FILE_PATH" ]] || exit 0
    [[ "$FILE_PATH" == /* ]] || FILE_PATH="$CWD/$FILE_PATH"
    printf '{"session_id":"%s","cwd":"%s","tool_name":"Edit","transcript_path":"%s","tool_input":{"file_path":"%s"}}' \
      "$(_do_it_json_escape "$SESSION_ID")" "$(_do_it_json_escape "$CWD")" \
      "$(_do_it_json_escape "$TRANSCRIPT")" "$(_do_it_json_escape "$FILE_PATH")" \
      | bash "$SCRIPT_DIR/write-quality-lint.sh" || true
    ;;
esac
exit 0
