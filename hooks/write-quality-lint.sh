#!/usr/bin/env bash
# do-it write-quality-lint (PostToolUse, matcher: Edit|Write|MultiEdit).
# Merged advisory hook: comment discipline + coarse anti-patterns + integrity
# heuristics. Scans newly-added lines once and emits ONE system-reminder per
# edit (deduped per user turn + file path); never blocks.
#
# Registered in hooks.json as a PostToolUse advisory hook. Legacy entry points
# comments-lint.sh and anti-patterns-lint.sh exec this script.

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
source "${SCRIPT_DIR}/lib/common.sh"
# shellcheck source=lib/debug.sh
source "${SCRIPT_DIR}/lib/debug.sh"
# shellcheck source=lib/write-quality-scan.sh
source "${SCRIPT_DIR}/lib/write-quality-scan.sh"

RAW_INPUT="$(do_it_read_stdin)"
SESSION_ID="$(do_it_json_get "$RAW_INPUT" session_id)"
CWD="$(do_it_json_get "$RAW_INPUT" cwd)"
TOOL_NAME="$(do_it_json_get "$RAW_INPUT" tool_name)"
TRANSCRIPT_PATH="$(do_it_json_get "$RAW_INPUT" transcript_path)"
FILE_PATH="$(do_it_json_get_nested "$RAW_INPUT" tool_input.file_path)"
if [[ -z "$FILE_PATH" ]]; then
  FILE_PATH="$(do_it_json_get_nested "$RAW_INPUT" tool_input.path)"
fi

if ! command -v do_it_in_subagent_context >/dev/null 2>&1; then
  echo "write-quality-lint: common.sh out of sync, do_it_in_subagent_context missing" >&2
  exit 0
fi
if do_it_in_subagent_context "$TRANSCRIPT_PATH"; then
  do_it_debug write-quality-lint "decision=skip reason=subagent-context"
  exit 0
fi

do_it_session_state_inc "$SESSION_ID" hook_invocations write_quality_lint

case "$TOOL_NAME" in
  Edit|Write|MultiEdit) ;;
  *)
    do_it_debug write-quality-lint "decision=skip reason=tool-not-edit tool=$TOOL_NAME"
    exit 0
    ;;
esac

if [[ -z "$FILE_PATH" ]]; then
  do_it_debug write-quality-lint "decision=skip reason=no-file-path"
  exit 0
fi

case "$FILE_PATH" in
  *.ts|*.tsx|*.js|*.jsx|*.mjs|*.cjs|*.py|*.go|*.rs|*.java|*.rb|*.sh|*.bash|*.cpp|*.cc|*.cxx|*.c|*.h|*.hpp) ;;
  *)
    do_it_debug write-quality-lint "decision=skip reason=ext-out-of-scope file=$FILE_PATH"
    exit 0
    ;;
esac

if [[ ! -f "$FILE_PATH" ]]; then
  do_it_debug write-quality-lint "decision=skip reason=file-missing file=$FILE_PATH"
  exit 0
fi

if [[ -L "$FILE_PATH" ]]; then
  do_it_debug write-quality-lint "decision=skip reason=symlink file=$FILE_PATH"
  exit 0
fi

if ! command -v git >/dev/null 2>&1; then
  do_it_debug write-quality-lint "decision=skip reason=git-missing"
  exit 0
fi

FILE_DIR="$(dirname "$FILE_PATH")"
FILE_DIR="$(cd "$FILE_DIR" 2>/dev/null && pwd -P || printf '%s' "$FILE_DIR")"
FILE_PATH="$FILE_DIR/$(basename "$FILE_PATH")"
REPO_ROOT="$(git -C "$FILE_DIR" rev-parse --show-toplevel 2>/dev/null)"
if [[ -z "$REPO_ROOT" ]]; then
  do_it_debug write-quality-lint "decision=skip reason=not-a-git-repo"
  exit 0
fi

REAL_PATH=""
if command -v readlink >/dev/null 2>&1; then
  REAL_PATH="$(readlink -f "$FILE_PATH" 2>/dev/null || true)"
fi
if [[ -n "$REAL_PATH" ]]; then
  case "$REAL_PATH" in
    "$REPO_ROOT"/*|"$REPO_ROOT") ;;
    *)
      do_it_debug write-quality-lint "decision=skip reason=outside-repo-root real=$REAL_PATH"
      exit 0
      ;;
  esac
fi

FILE_BYTES="$(stat -c %s "$FILE_PATH" 2>/dev/null || stat -f %z "$FILE_PATH" 2>/dev/null || echo 0)"
case "$FILE_BYTES" in
  ''|*[!0-9]*) FILE_BYTES=0 ;;
esac
if [[ "$FILE_BYTES" -gt 1048576 ]]; then
  do_it_debug write-quality-lint "decision=skip reason=file-too-large bytes=$FILE_BYTES file=$FILE_PATH"
  exit 0
fi

wq_collect_added_lines "$REPO_ROOT" "$FILE_PATH"

if [[ -z "$WQ_ADDED_LINES" ]]; then
  do_it_debug write-quality-lint "decision=skip reason=no-added-lines file=$FILE_PATH"
  exit 0
fi

if printf '%s\n' "$WQ_ADDED_LINES" \
     | grep -qE 'write-quality-lint-allow|anti-patterns-lint-allow|comments-lint-allow'; then
  do_it_debug write-quality-lint "decision=skip reason=allow-listed file=$FILE_PATH"
  exit 0
fi

TIER="$(do_it_session_state_get "$SESSION_ID" tier)"
[[ -z "$TIER" ]] && TIER="Heavy"

ADDED_LINE_COUNT="$(printf '%s\n' "$WQ_ADDED_LINES" | grep -c . || true)"
case "$TIER" in
  Light)
    do_it_debug write-quality-lint "decision=skip reason=tier-light file=$FILE_PATH"
    exit 0
    ;;
  Standard)
    DIM_TOUCHES_CODE="$(do_it_session_state_get "$SESSION_ID" dim_touches_code)"
    if [[ "$DIM_TOUCHES_CODE" != "1" && "${ADDED_LINE_COUNT:-0}" -lt 5 ]]; then
      do_it_debug write-quality-lint "decision=skip reason=tier-standard-gate touches=$DIM_TOUCHES_CODE added=$ADDED_LINE_COUNT file=$FILE_PATH"
      exit 0
    fi
    ;;
esac

PROJECT_ROOT="$(do_it_project_root "$CWD")"
PROJECT_ROOT="${PROJECT_ROOT%/}"
PROJECT_ROOT="$(cd "$PROJECT_ROOT" 2>/dev/null && pwd -P || printf '%s' "$PROJECT_ROOT")"
case "$FILE_PATH" in
  "$PROJECT_ROOT"/*) DISPLAY_PATH="${FILE_PATH#"$PROJECT_ROOT"/}" ;;
  *) DISPLAY_PATH="$FILE_PATH" ;;
esac

SANITIZED_PATH="$(printf '%s' "$DISPLAY_PATH" | tr '/\\' '__' | tr -cd '[:alnum:]_.-')"
[[ -z "$SANITIZED_PATH" ]] && SANITIZED_PATH="path"
DEDUP_KEY="wql_seen_${SANITIZED_PATH}"
CURRENT_TURN="$(do_it_user_turn_get "$SESSION_ID")"
if [[ "$(do_it_session_state_get "$SESSION_ID" "$DEDUP_KEY")" == "$CURRENT_TURN" ]]; then
  do_it_debug write-quality-lint "decision=skip reason=dedup turn=$CURRENT_TURN file=$DISPLAY_PATH"
  exit 0
fi

WQ_HIT_FAMILIES=""
WQ_HIT_DETAILS=""
WQ_COMMENT_HITS=0

wq_scan_comment_families
wq_scan_antipattern_families "$REPO_ROOT" "$FILE_PATH" "$CWD"
wq_scan_extra_families "$FILE_PATH"

if [[ -z "$WQ_HIT_FAMILIES" ]]; then
  do_it_debug write-quality-lint "decision=clean file=$DISPLAY_PATH"
  exit 0
fi

do_it_session_state_set "$SESSION_ID" "$DEDUP_KEY" "$CURRENT_TURN"

COMMENT_HITS_DISPLAY="$WQ_COMMENT_HITS"
if [[ "${WQ_COMMENT_HITS:-0}" -gt 50 ]]; then
  COMMENT_HITS_DISPLAY=">50"
fi

REMINDER=$'<system-reminder>\n'
REMINDER+="do-it write-quality-lint (advisory): edit on ${DISPLAY_PATH} matched ${WQ_HIT_FAMILIES}."
if [[ "${WQ_COMMENT_HITS:-0}" -gt 0 ]]; then
  REMINDER+=$'\n'"Comments discipline: ${COMMENT_HITS_DISPLAY} likely-violating new comment(s) (see do-it-comments-discipline)."
  REMINDER+=$'\n'"注释纪律：新增 ${COMMENT_HITS_DISPLAY} 处可能违反 do-it-comments-discipline 的注释，请改写为索引锚点或删除。"
fi
while IFS= read -r detail; do
  [[ -z "$detail" ]] && continue
  REMINDER+=$'\n'"- ${detail}"
done <<<"$WQ_HIT_DETAILS"
REMINDER+=$'\n'"Suppress per edit with write-quality-lint-allow (legacy: comments-lint-allow, anti-patterns-lint-allow). Review flagged families before declaring done."
REMINDER+=$'\n</system-reminder>'

do_it_emit_context PostToolUse "$REMINDER"
do_it_debug write-quality-lint "decision=flagged families=$WQ_HIT_FAMILIES comment_hits=$WQ_COMMENT_HITS file=$DISPLAY_PATH"

exit 0
