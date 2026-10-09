#!/usr/bin/env bash
# Adapt native Codex apply_patch events to the canonical per-file lint.
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
source "${SCRIPT_DIR}/lib/common.sh"

RAW_INPUT="$(do_it_read_stdin)"
TOOL_NAME="$(do_it_json_get "$RAW_INPUT" tool_name)"
CWD="$(do_it_json_get "$RAW_INPUT" cwd)"
# Native post-tool output is always JSON, even if another adapter uses plain text.
unset DO_IT_CONTEXT_OUTPUT

case "$TOOL_NAME" in
  Edit|Write|MultiEdit|NotebookEdit|StrReplace|EditNotebook)
    if [[ -n "$CWD" ]]; then cd -- "$CWD" 2>/dev/null || exit 0; fi
    printf '%s' "$RAW_INPUT" | bash "${SCRIPT_DIR}/write-quality-lint.sh" || true
    exit 0
    ;;
  apply_patch) ;;
  *) exit 0 ;;
esac

PATCH="$(do_it_json_get_nested "$RAW_INPUT" tool_input.command)"
# Parse patch headers only as data. An incomplete envelope cannot name targets.
[[ "$PATCH" == $'*** Begin Patch\n'* && "$PATCH" == *$'\n*** End Patch' ]] || exit 0
[[ -n "$CWD" ]] || exit 0
cd -- "$CWD" 2>/dev/null || exit 0
SESSION_ID="$(do_it_json_get "$RAW_INPUT" session_id)"
TRANSCRIPT_PATH="$(do_it_json_get "$RAW_INPUT" transcript_path)"
TARGETS=()
PENDING=""
while IFS= read -r line; do
  case "$line" in
    '*** Add File: '*|'*** Update File: '*|'*** Delete File: '*|'*** End Patch')
      if [[ -n "$PENDING" ]]; then TARGETS+=("$PENDING"); fi
      PENDING=""
      case "$line" in
        '*** Add File: '*) PENDING="${line#'*** Add File: '}" ;;
        '*** Update File: '*) PENDING="${line#'*** Update File: '}" ;;
      esac
      ;;
    '*** Move to: '*)
      if [[ -n "$PENDING" ]]; then PENDING="${line#'*** Move to: '}"; fi
      ;;
  esac
done <<< "$PATCH"

SEEN=()
CONTEXT=""
# Bash 3.2 treats empty arrays as unset under nounset.
for target in ${TARGETS[@]+"${TARGETS[@]}"}; do
  [[ "$target" == /* ]] || target="$PWD/$target"
  # Retain the final path component so the canonical symlink guard still sees it.
  [[ -f "$target" && ! -L "$target" ]] || continue
  directory="$(cd -- "${target%/*}" 2>/dev/null && pwd -P)" || continue
  target="$directory/${target##*/}"
  duplicate=0
  for seen in ${SEEN[@]+"${SEEN[@]}"}; do
    if [[ "$seen" == "$target" ]]; then duplicate=1; break; fi
  done
  [[ "$duplicate" == 0 ]] || continue
  SEEN+=("$target")
  input="$(printf '{"tool_name":"Edit","tool_input":{"file_path":"%s"},"cwd":"%s","session_id":"%s","transcript_path":"%s"}' \
    "$(_do_it_json_escape "$target")" "$(_do_it_json_escape "$CWD")" \
    "$(_do_it_json_escape "$SESSION_ID")" "$(_do_it_json_escape "$TRANSCRIPT_PATH")")"
  output="$(printf '%s' "$input" | bash "${SCRIPT_DIR}/write-quality-lint.sh")"
  advisory="$(do_it_json_get_nested "$output" hookSpecificOutput.additionalContext)"
  if [[ -n "$advisory" ]]; then CONTEXT+="${CONTEXT:+$'\n'}$advisory"; fi
done
if [[ -n "$CONTEXT" ]]; then do_it_emit_context PostToolUse "$CONTEXT"; fi
exit 0
