#!/usr/bin/env bash
# do-it write-quality-lint (PostToolUse, matcher: Edit|Write|MultiEdit).
# Merged advisory hook: comment discipline + coarse anti-patterns + integrity
# heuristics. Scans newly-added lines once and emits ONE reminder per edit
# (deduped per user turn + file path + unchanged added-line hash); never blocks.

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

if ! command -v do_it_effective_session_id >/dev/null 2>&1; then
  echo "write-quality-lint: common.sh out of sync, do_it_effective_session_id missing" >&2
  exit 0
fi

SESSION_ID="$(do_it_effective_session_id "$SESSION_ID" "$TRANSCRIPT_PATH" "$RAW_INPUT")"
do_it_session_state_inc "$SESSION_ID" hook_invocations write_quality_lint

case "$TOOL_NAME" in
  Edit|Write|MultiEdit|NotebookEdit|StrReplace|EditNotebook) ;;
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

PROJECT_ROOT="$(do_it_project_root "$CWD")"
PROJECT_ROOT="${PROJECT_ROOT%/}"
PROJECT_ROOT="$(cd "$PROJECT_ROOT" 2>/dev/null && pwd -P || printf '%s' "$PROJECT_ROOT")"
case "$FILE_PATH" in
  "$PROJECT_ROOT"/*) DISPLAY_PATH="${FILE_PATH#"$PROJECT_ROOT"/}" ;;
  *) DISPLAY_PATH="$FILE_PATH" ;;
esac
case "$FILE_PATH" in
  "$REPO_ROOT"/*) REL_FILE="${FILE_PATH#"$REPO_ROOT"/}" ;;
  *) REL_FILE="$(basename "$FILE_PATH")" ;;
esac

SANITIZED_PATH="$(printf '%s' "$DISPLAY_PATH" | tr '/\\' '__' | tr -cd '[:alnum:]_.-')"
[[ -z "$SANITIZED_PATH" ]] && SANITIZED_PATH="path"
DEDUP_KEY="wql_seen_${SANITIZED_PATH}"
HASH_KEY="wql_hash_${SANITIZED_PATH}"
CURRENT_TURN="$(do_it_user_turn_get "$SESSION_ID")"
if [[ "$(do_it_session_state_get "$SESSION_ID" "$DEDUP_KEY")" == "$CURRENT_TURN" ]]; then
  do_it_debug write-quality-lint "decision=skip reason=dedup turn=$CURRENT_TURN file=$DISPLAY_PATH"
  exit 0
fi

ADDED_HASH="$(printf '%s' "$WQ_ADDED_LINES" | _do_it_hash_key)"
if [[ -n "$ADDED_HASH" && "$(do_it_session_state_get "$SESSION_ID" "$HASH_KEY")" == "$ADDED_HASH" ]]; then
  do_it_debug write-quality-lint "decision=skip reason=unchanged-added-lines file=$DISPLAY_PATH"
  exit 0
fi

WQ_HIT_FAMILIES=""
WQ_HIT_DETAILS=""
WQ_COMMENT_HITS=0

wq_scan_comment_families
wq_scan_antipattern_families "$REPO_ROOT" "$FILE_PATH" "$CWD" "$TOOL_NAME"
wq_scan_extra_families "$FILE_PATH" "$REPO_ROOT" "$REL_FILE" "$TOOL_NAME"

# Suppress individual advisory families with a reason-bearing marker, never the
# entire scan. Secret-leak is intentionally unsuppressible: a marker must not
# hide a possible credential.
WQ_ALLOW_FAMILIES="$(printf '%s\n' "$WQ_ADDED_LINES" \
  | sed -nE \
      -e 's/.*write-quality-lint-allow:[[:space:]]*([a-z0-9-]+)[[:space:]]+-[[:space:]]+.+/\1/p' \
      -e 's/.*write-quality-lint-allow:[[:space:]]*([a-z0-9-]+)[[:space:]]+—[[:space:]]+.+/\1/p' \
  | sort -u | paste -sd, -)"
if [[ -n "$WQ_ALLOW_FAMILIES" && -n "$WQ_HIT_FAMILIES" ]]; then
  WQ_FILTERED_FAMILIES=""
  while IFS= read -r _family || [[ -n "$_family" ]]; do
    [[ -z "$_family" ]] && continue
    case ",${WQ_ALLOW_FAMILIES}," in
      *,"$_family",*)
        if [[ "$_family" == "secret-leak" ]]; then
          WQ_FILTERED_FAMILIES="${WQ_FILTERED_FAMILIES:+$WQ_FILTERED_FAMILIES,}$_family"
          _wq_append_detail "secret-leak: suppression markers never hide possible credentials"
        else
          _wq_append_detail "$_family: advisory suppressed for this edit with a stated reason"
        fi
        ;;
      *) WQ_FILTERED_FAMILIES="${WQ_FILTERED_FAMILIES:+$WQ_FILTERED_FAMILIES,}$_family" ;;
    esac
  done < <(printf '%s' "$WQ_HIT_FAMILIES" | tr ',' '\n')
  WQ_HIT_FAMILIES="$WQ_FILTERED_FAMILIES"
fi

if [[ -z "$WQ_HIT_FAMILIES" ]]; then
  do_it_debug write-quality-lint "decision=clean file=$DISPLAY_PATH"
  exit 0
fi

if [[ -n "$ADDED_HASH" ]]; then
  do_it_session_state_set_many "$SESSION_ID" "$DEDUP_KEY" "$CURRENT_TURN" "$HASH_KEY" "$ADDED_HASH"
else
  do_it_session_state_set "$SESSION_ID" "$DEDUP_KEY" "$CURRENT_TURN"
fi

COMMENT_HITS_DISPLAY="$WQ_COMMENT_HITS"
if [[ "${WQ_COMMENT_HITS:-0}" -gt 50 ]]; then
  COMMENT_HITS_DISPLAY=">50"
fi

if [[ "${DO_IT_EVENT_HOST:-}" == "grok" || "${DO_IT_EVENT_HOST:-}" == "agy" ]]; then
  REMINDER="do-it write-quality-lint (advisory): edit on ${DISPLAY_PATH} matched ${WQ_HIT_FAMILIES}."
else
  REMINDER=$'<system-reminder>\n'
  REMINDER+="do-it write-quality-lint (advisory): edit on ${DISPLAY_PATH} matched ${WQ_HIT_FAMILIES}."
fi
if [[ "${WQ_COMMENT_HITS:-0}" -gt 0 ]]; then
  REMINDER+=$'\n'"Comments discipline: ${COMMENT_HITS_DISPLAY} likely-violating new comment(s) (see do-it-code-quality)."
  REMINDER+=$'\n'"注释纪律：新增 ${COMMENT_HITS_DISPLAY} 处可能违反注释元规则的注释，请改写为索引锚点或删除（见 do-it-code-quality）。"
fi
while IFS= read -r detail; do
  [[ -z "$detail" ]] && continue
  REMINDER+=$'\n'"- ${detail}"
done <<<"$WQ_HIT_DETAILS"
REMINDER+=$'\n'"Suppress one advisory family with write-quality-lint-allow: <family-id> — <reason>. Possible secrets are never suppressible. Review flagged families before declaring done."
if [[ "${DO_IT_EVENT_HOST:-}" != "grok" && "${DO_IT_EVENT_HOST:-}" != "agy" ]]; then
  REMINDER+=$'\n</system-reminder>'
fi

do_it_emit_context PostToolUse "$REMINDER"
do_it_debug write-quality-lint "decision=flagged families=$WQ_HIT_FAMILIES comment_hits=$WQ_COMMENT_HITS file=$DISPLAY_PATH"

exit 0
