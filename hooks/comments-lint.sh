#!/usr/bin/env bash
# do-it comments-lint (PostToolUse, matcher: Edit|Write|MultiEdit).
# Scans the lines an edit just added to a source file and flags comment lines
# that match the anti-patterns documented in the do-it-comments-discipline
# skill (history narrative, task references, orphan TODOs, tombstones, fix
# narrative). Emits ONE advisory system-reminder per edit; never blocks.
#
# Wave 2 will register this in hooks.json. This file is independent and safe
# to invoke directly via stdin for ad-hoc testing.

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
source "${SCRIPT_DIR}/lib/common.sh"
# shellcheck source=lib/debug.sh
source "${SCRIPT_DIR}/lib/debug.sh"

RAW_INPUT="$(do_it_read_stdin)"
SESSION_ID="$(do_it_json_get "$RAW_INPUT" session_id)"
CWD="$(do_it_json_get "$RAW_INPUT" cwd)"
TOOL_NAME="$(do_it_json_get "$RAW_INPUT" tool_name)"
TRANSCRIPT_PATH="$(do_it_json_get "$RAW_INPUT" transcript_path)"
FILE_PATH="$(do_it_json_get_nested "$RAW_INPUT" tool_input.file_path)"
if [[ -z "$FILE_PATH" ]]; then
  FILE_PATH="$(do_it_json_get_nested "$RAW_INPUT" tool_input.path)"
fi

# Subagent context: bail. common.sh always defines do_it_in_subagent_context;
# guard only against an out-of-sync source so a missing helper does not crash
# the hook at PostToolUse time. The dual-fallback else-branch from earlier
# revisions was unreachable and is removed.
if ! command -v do_it_in_subagent_context >/dev/null 2>&1; then
  echo "comments-lint: common.sh out of sync, do_it_in_subagent_context missing" >&2
  exit 0
fi
if do_it_in_subagent_context "$TRANSCRIPT_PATH"; then
  do_it_debug comments-lint "decision=skip reason=subagent-context"
  exit 0
fi

do_it_session_state_inc "$SESSION_ID" hook_invocations comments_lint

case "$TOOL_NAME" in
  Edit|Write|MultiEdit) ;;
  *)
    do_it_debug comments-lint "decision=skip reason=tool-not-edit tool=$TOOL_NAME"
    exit 0
    ;;
esac

if [[ -z "$FILE_PATH" ]]; then
  do_it_debug comments-lint "decision=skip reason=no-file-path"
  exit 0
fi

# Source-file extension gate. Anything else is out of scope.
case "$FILE_PATH" in
  *.ts|*.tsx|*.js|*.jsx|*.mjs|*.cjs|*.py|*.go|*.rs|*.java|*.rb|*.cpp|*.cc|*.cxx|*.c|*.h|*.hpp) ;;
  *)
    do_it_debug comments-lint "decision=skip reason=ext-out-of-scope file=$FILE_PATH"
    exit 0
    ;;
esac

if [[ ! -f "$FILE_PATH" ]]; then
  do_it_debug comments-lint "decision=skip reason=file-missing file=$FILE_PATH"
  exit 0
fi

# Symlink rejection: never follow links. A symlink could point to /etc/passwd,
# a file outside the repo, or a recursive loop; the lint output would also
# leak excerpts back into the system-reminder.
if [[ -L "$FILE_PATH" ]]; then
  do_it_debug comments-lint "decision=skip reason=symlink file=$FILE_PATH"
  exit 0
fi

# Resolve repo root for the file. If git isn't available or the file isn't in
# a repo, exit 0 — comments-lint is best-effort.
if ! command -v git >/dev/null 2>&1; then
  do_it_debug comments-lint "decision=skip reason=git-missing"
  exit 0
fi

FILE_DIR="$(dirname "$FILE_PATH")"
REPO_ROOT="$(git -C "$FILE_DIR" rev-parse --show-toplevel 2>/dev/null)"
if [[ -z "$REPO_ROOT" ]]; then
  do_it_debug comments-lint "decision=skip reason=not-a-git-repo"
  exit 0
fi

# Resolved-path containment check: refuse to lint anything that, after
# realpath, lands outside REPO_ROOT. Belt-and-suspenders against `..` segments
# in tool_input.file_path or weird mounts; the symlink check above already
# covers the simple case.
REAL_PATH=""
if command -v readlink >/dev/null 2>&1; then
  REAL_PATH="$(readlink -f "$FILE_PATH" 2>/dev/null || true)"
fi
if [[ -n "$REAL_PATH" ]]; then
  case "$REAL_PATH" in
    "$REPO_ROOT"/*|"$REPO_ROOT") ;;
    *)
      do_it_debug comments-lint "decision=skip reason=outside-repo-root real=$REAL_PATH"
      exit 0
      ;;
  esac
fi

# File-size cap: skip anything larger than 1 MiB. Big files blow the awk
# pass and would only surface noise in the reminder.
FILE_BYTES="$(stat -c %s "$FILE_PATH" 2>/dev/null || stat -f %z "$FILE_PATH" 2>/dev/null || echo 0)"
case "$FILE_BYTES" in
  ''|*[!0-9]*) FILE_BYTES=0 ;;
esac
if [[ "$FILE_BYTES" -gt 1048576 ]]; then
  do_it_debug comments-lint "decision=skip reason=file-too-large bytes=$FILE_BYTES file=$FILE_PATH"
  exit 0
fi

# `timeout` may not exist on minimal images. Fall back to a no-op wrapper so
# the rest of the script does not need to branch.
if command -v timeout >/dev/null 2>&1; then
  _doit_timeout() { timeout "$@"; }
else
  _doit_timeout() { shift; "$@"; }
fi

# Collect newly-added lines for this file. Strategy:
#   1. `git diff HEAD -- <file>` for tracked files with staged or unstaged
#      changes;
#   2. if that diff is empty, check if the file is untracked / newly-added
#      and read the whole file as "added";
#   3. if neither yields anything, exit 0.
ADDED_LINES=""

DIFF_OUTPUT="$(_doit_timeout 5s git -C "$REPO_ROOT" diff HEAD -- "$FILE_PATH" 2>/dev/null || true)"
if [[ -n "$DIFF_OUTPUT" ]]; then
  # Keep lines starting with a single `+` but skip the `+++ b/...` header.
  ADDED_LINES="$(printf '%s\n' "$DIFF_OUTPUT" \
    | awk '/^\+\+\+/ {next} /^\+/ {sub(/^\+/, ""); print}')"
fi

if [[ -z "$ADDED_LINES" ]]; then
  STATUS_LINE="$(_doit_timeout 5s git -C "$REPO_ROOT" status --porcelain -- "$FILE_PATH" 2>/dev/null | head -n1)"
  case "$STATUS_LINE" in
    \?\?*|A*|*A\ *)
      ADDED_LINES="$(_doit_timeout 5s cat "$FILE_PATH" 2>/dev/null || true)"
      ;;
  esac
fi

if [[ -z "$ADDED_LINES" ]]; then
  do_it_debug comments-lint "decision=skip reason=no-added-lines file=$FILE_PATH"
  exit 0
fi

# Filter to comment-shaped lines only. A line counts if it either starts with
# a comment marker or contains a trailing `//`/`#` comment (inline comments).
# For inline comments we keep the comment tail so the matchers below scan only
# the comment text, not surrounding code.
COMMENT_LINES="$(printf '%s\n' "$ADDED_LINES" \
  | awk '
    {
      original=$0
      stripped=$0
      sub(/^[[:space:]]+/, "", stripped)
      # Full-line comment markers.
      if (stripped ~ /^\/\//)         { print stripped; next }
      if (stripped ~ /^#( |$)/)       { print stripped; next }
      if (stripped ~ /^#!/)           { next }
      if (stripped ~ /^\/\*/)         { print stripped; next }
      if (stripped ~ /^\*( |$|\/)/)   { print stripped; next }   # jsdoc body
      if (stripped ~ /^"""/)          { print stripped; next }   # py triple
      if (stripped ~ /^\x27\x27\x27/) { print stripped; next }   # py triple-single
      # Inline `//` comment tail. Trim everything before the first `//` so the
      # matcher does not see surrounding code. Cheap and good enough; does not
      # try to parse strings that contain `//`.
      if (match(original, /\/\/.*/)) {
        print substr(original, RSTART, RLENGTH)
        next
      }
      # Inline `#` comment tail for shebang-free shell/python/ruby. Avoid
      # `#` that is the first non-space character (already handled above) and
      # avoid matching `#` inside strings via a coarse heuristic: require the
      # `#` to be preceded by whitespace.
      if (match(original, /[[:space:]]#[^!].*/)) {
        print substr(original, RSTART, RLENGTH)
        next
      }
    }
  ')"

if [[ -z "$COMMENT_LINES" ]]; then
  do_it_debug comments-lint "decision=clean reason=no-comments-added file=$FILE_PATH"
  exit 0
fi

# Anti-pattern matchers. Keep these as separate buckets so the reminder can
# name which families fired.
HITS=0
HIT_FAMILIES=""

_record_family() {
  local fam="$1"
  case ",$HIT_FAMILIES," in
    *",$fam,"*) ;;
    *) HIT_FAMILIES="${HIT_FAMILIES:+$HIT_FAMILIES,}$fam" ;;
  esac
}

# Allow-list escape: a line containing `comments-lint-allow` is suppressed.
FILTERED="$(printf '%s\n' "$COMMENT_LINES" | grep -v 'comments-lint-allow' || true)"
if [[ -z "$FILTERED" ]]; then
  do_it_debug comments-lint "decision=clean reason=all-allowlisted file=$FILE_PATH"
  exit 0
fi

# Family names below match the `category` slot in
# do-it-comments-discipline (`history` / `task-ref` / `fix-narrative` /
# `orphan-todo` / `tombstone`) so reviewer findings and hook reminders use
# the same vocabulary.

# 1. History / change narrative (Chinese + English).
#    Excludes `修复` / `fixed` / etc. — those land in fix-narrative below.
HISTORY_HITS=$(printf '%s\n' "$FILTERED" \
  | grep -cE '修改了|添加了|新增了|删除了|去掉了|之前是|原来是|改成|曾经|\badded\b|\bpreviously\b|used to|changed to|\bmoved\b' \
  || true)
if [[ "${HISTORY_HITS:-0}" -gt 0 ]]; then
  HITS=$((HITS + HISTORY_HITS))
  _record_family "history"
fi

# 1b. Bare `removed` / `deleted` (no trailing colon) — narrative form, not a
#     tombstone marker. `removed:` / `deleted:` get caught by the tombstone
#     check below.
NARR_TOMB_HITS=$(printf '%s\n' "$FILTERED" \
  | grep -E '\b(removed|deleted)\b' \
  | grep -cvE '\b(removed|deleted):' \
  || true)
if [[ "${NARR_TOMB_HITS:-0}" -gt 0 ]]; then
  HITS=$((HITS + NARR_TOMB_HITS))
  _record_family "history"
fi

# 2. Fix narrative — separate category in do-it-comments-discipline.
FIX_HITS=$(printf '%s\n' "$FILTERED" \
  | grep -ciE '修复|修正|\bfixed\b|fix:|\bbugfix\b|\bhotfix\b|\bpatched\b' \
  || true)
if [[ "${FIX_HITS:-0}" -gt 0 ]]; then
  HITS=$((HITS + FIX_HITS))
  _record_family "fix-narrative"
fi

# 3. Task references
TASKREF_HITS=$(printf '%s\n' "$FILTERED" \
  | grep -ciE 'issue #|pr #|ticket #|jira-' \
  || true)
if [[ "${TASKREF_HITS:-0}" -gt 0 ]]; then
  HITS=$((HITS + TASKREF_HITS))
  _record_family "task-ref"
fi

# 4. Orphan TODO / FIXME — flagged when the marker has no `:` or `(@owner)`
#    immediately following.
ORPHAN_HITS=$(printf '%s\n' "$FILTERED" \
  | grep -E '\b(TODO|FIXME|XXX)\b' \
  | grep -cvE '\b(TODO|FIXME|XXX)(:|\(@)' \
  || true)
if [[ "${ORPHAN_HITS:-0}" -gt 0 ]]; then
  HITS=$((HITS + ORPHAN_HITS))
  _record_family "orphan-todo"
fi

# 5. Tombstones — explicit `removed:` / `deleted:` / `gone:` markers.
TOMB_HITS=$(printf '%s\n' "$FILTERED" \
  | grep -ciE 'removed:|deleted:|gone:' \
  || true)
if [[ "${TOMB_HITS:-0}" -gt 0 ]]; then
  HITS=$((HITS + TOMB_HITS))
  _record_family "tombstone"
fi

if [[ "$HITS" -eq 0 ]]; then
  do_it_debug comments-lint "decision=clean reason=no-anti-patterns file=$FILE_PATH"
  exit 0
fi

# Compose the advisory. Single reminder per file, naming the families fired.
PROJECT_ROOT="$(do_it_project_root "$CWD")"
PROJECT_ROOT="${PROJECT_ROOT%/}"
case "$FILE_PATH" in
  "$PROJECT_ROOT"/*) DISPLAY_PATH="${FILE_PATH#"$PROJECT_ROOT"/}" ;;
  *) DISPLAY_PATH="$FILE_PATH" ;;
esac

# Output volume cap: when the file got hit > 50 times, summarize instead of
# enumerating. Counts above the cap are reported as `>50` so the reminder
# stays compact regardless of input size.
HITS_DISPLAY="$HITS"
if [[ "$HITS" -gt 50 ]]; then
  HITS_DISPLAY=">50"
fi

REMINDER=$'<system-reminder>\n'
REMINDER+="Comments discipline: detected ${HITS_DISPLAY} likely-violating new comments in ${DISPLAY_PATH} (matched: ${HIT_FAMILIES}). Comments should be greppable anchors (type annotations / @anchor: / see also: / invariant: / tool directives), not narrative. Rewrite or remove. Full rules: load skill do-it-comments-discipline."
REMINDER+=$'\n'
REMINDER+="注释纪律提示：本次编辑在 ${DISPLAY_PATH} 新增了 ${HITS_DISPLAY} 处可能违反 do-it-comments-discipline 的注释（命中关键词：${HIT_FAMILIES}）。请改写为索引锚点或删除。"
REMINDER+=$'\n</system-reminder>'

do_it_emit_context PostToolUse "$REMINDER"
do_it_debug comments-lint "decision=flagged hits=$HITS families=$HIT_FAMILIES file=$DISPLAY_PATH"

exit 0
