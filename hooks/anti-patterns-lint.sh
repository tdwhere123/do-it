#!/usr/bin/env bash
# do-it anti-patterns-lint (PostToolUse, matcher: Edit|Write|MultiEdit).
# Scans the lines an edit just added to a source file for three coarse
# anti-patterns and emits ONE advisory system-reminder per edit; never blocks.
#
# Detected families:
#   case-list  — ≥10 consecutive added lines look like a bash case branch
#                pattern (`*"..."*`); flags the "大段 case 语句吞所有变体"
#                shape that should usually be data-driven.
#   no-consumer — a freshly-added TS/JS top-level export whose `<Name>` does not
#                appear in any other .ts/.tsx/.js/.mjs/.cjs file under the repo.
#                Covers `const|let|var|function|class` AND the speculative-
#                abstraction kinds `interface|type|abstract class` — an exported
#                abstraction nobody references is decision-ladder rung 1 (does it
#                need to exist?), the highest-signal YAGNI smell catchable at
#                write time.
#   copy-paste — a contiguous chunk of ≥5 non-trivial added lines whose first
#                AND last lines both appear in another file inside the same
#                directory.
#
# Like comments-lint.sh this hook is advisory only. The family set is
# deliberately small and CLOSED: per do-it-router § Restraint, do not grow it
# into an ever-longer anti-pattern list. Richer YAGNI review (single-impl
# interfaces, one-product factories, pass-through wrappers, reinvented stdlib)
# belongs to the on-demand do-it-review-loop YAGNI lens, not this write-time hook.

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

if ! command -v do_it_in_subagent_context >/dev/null 2>&1; then
  echo "anti-patterns-lint: common.sh out of sync, do_it_in_subagent_context missing" >&2
  exit 0
fi
if do_it_in_subagent_context "$TRANSCRIPT_PATH"; then
  do_it_debug anti-patterns-lint "decision=skip reason=subagent-context"
  exit 0
fi

do_it_session_state_inc "$SESSION_ID" hook_invocations anti_patterns_lint

case "$TOOL_NAME" in
  Edit|Write|MultiEdit) ;;
  *)
    do_it_debug anti-patterns-lint "decision=skip reason=tool-not-edit tool=$TOOL_NAME"
    exit 0
    ;;
esac

if [[ -z "$FILE_PATH" ]]; then
  do_it_debug anti-patterns-lint "decision=skip reason=no-file-path"
  exit 0
fi

case "$FILE_PATH" in
  *.ts|*.tsx|*.js|*.jsx|*.mjs|*.cjs|*.py|*.go|*.rs|*.java|*.rb|*.sh|*.bash) ;;
  *)
    do_it_debug anti-patterns-lint "decision=skip reason=ext-out-of-scope file=$FILE_PATH"
    exit 0
    ;;
esac

if [[ ! -f "$FILE_PATH" ]]; then
  do_it_debug anti-patterns-lint "decision=skip reason=file-missing file=$FILE_PATH"
  exit 0
fi

if [[ -L "$FILE_PATH" ]]; then
  do_it_debug anti-patterns-lint "decision=skip reason=symlink file=$FILE_PATH"
  exit 0
fi

if ! command -v git >/dev/null 2>&1; then
  do_it_debug anti-patterns-lint "decision=skip reason=git-missing"
  exit 0
fi

FILE_DIR="$(dirname "$FILE_PATH")"
# Canonicalize the directory so it matches git's symlink-resolved
# --show-toplevel output. On macOS the temp/working tree can sit under
# /var -> /private/var (or /tmp -> /private/tmp); without this the REPO_ROOT
# prefix strip below would fail, leaving REL_FILE absolute and REL_DIR collapsed
# to ".", which breaks both the diff pathspec and the self-exclusion. pwd -P is
# POSIX-portable; readlink -f is not (BSD lacks it).
FILE_DIR="$(cd "$FILE_DIR" 2>/dev/null && pwd -P || printf '%s' "$FILE_DIR")"
FILE_PATH="$FILE_DIR/$(basename "$FILE_PATH")"
REPO_ROOT="$(git -C "$FILE_DIR" rev-parse --show-toplevel 2>/dev/null)"
if [[ -z "$REPO_ROOT" ]]; then
  do_it_debug anti-patterns-lint "decision=skip reason=not-a-git-repo"
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
      do_it_debug anti-patterns-lint "decision=skip reason=outside-repo-root real=$REAL_PATH"
      exit 0
      ;;
  esac
fi

FILE_BYTES="$(stat -c %s "$FILE_PATH" 2>/dev/null || stat -f %z "$FILE_PATH" 2>/dev/null || echo 0)"
case "$FILE_BYTES" in
  ''|*[!0-9]*) FILE_BYTES=0 ;;
esac
if [[ "$FILE_BYTES" -gt 1048576 ]]; then
  do_it_debug anti-patterns-lint "decision=skip reason=file-too-large bytes=$FILE_BYTES"
  exit 0
fi

if command -v timeout >/dev/null 2>&1; then
  _doit_timeout() { timeout "$@"; }
else
  _doit_timeout() { shift; "$@"; }
fi

# Collect newly-added lines for this file (same strategy as comments-lint.sh).
ADDED_LINES=""
DIFF_OUTPUT="$(_doit_timeout 5s git -C "$REPO_ROOT" diff HEAD -- "$FILE_PATH" 2>/dev/null || true)"
if [[ -n "$DIFF_OUTPUT" ]]; then
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
  do_it_debug anti-patterns-lint "decision=skip reason=no-added-lines"
  exit 0
fi

HIT_FAMILIES=""
HIT_DETAILS=""

_record_family() {
  local fam="$1"
  case ",$HIT_FAMILIES," in
    *",$fam,"*) ;;
    *) HIT_FAMILIES="${HIT_FAMILIES:+$HIT_FAMILIES,}$fam" ;;
  esac
}

_append_detail() {
  HIT_DETAILS="${HIT_DETAILS:+${HIT_DETAILS}$'\n'}${1}"
}

# ------------------------------------------------------------------------
# Family 1: case-list — ≥10 consecutive lines matching a `*"..."*` shape.
# ------------------------------------------------------------------------
CASE_RUN=$(printf '%s\n' "$ADDED_LINES" | awk '
  BEGIN { run = 0; best = 0 }
  /\*"[^"]+"\*/ { run += 1; if (run > best) best = run; next }
  { run = 0 }
  END { print best }
')
if [[ "${CASE_RUN:-0}" -ge 10 ]]; then
  _record_family "case-list"
  _append_detail "case-list: ${CASE_RUN} consecutive case-branch patterns — consider externalising to hooks/data/*.tsv or equivalent data file"
fi

# ------------------------------------------------------------------------
# Family 2: no-consumer — TS/JS top-level export with no other reference.
# Includes the speculative-abstraction kinds (interface / type / abstract
# class): an exported abstraction nobody references is decision-ladder rung 1.
# ------------------------------------------------------------------------
case "$FILE_PATH" in
  *.ts|*.tsx|*.js|*.jsx|*.mjs|*.cjs)
    # Extract the symbol name from any `export ... <name>` declaration on a new
    # line. Two-pass grep+sed instead of gawk's three-arg `match(..., arr)`
    # which is not supported by BSD awk (macOS default). The regex matches:
    #   - `export const|let|var <name>`
    #   - `export function <name>` / `export async function <name>`
    #   - `export class <name>` / `export abstract class <name>`
    #   - `export interface <name>` / `export type <name>`
    #   - `export default function <name>` / `export default class <name>`
    EXPORT_NAMES="$(printf '%s\n' "$ADDED_LINES" \
      | grep -E '^[[:space:]]*export[[:space:]]+(default[[:space:]]+(async[[:space:]]+)?(function|class)|async[[:space:]]+function|abstract[[:space:]]+class|const|let|var|function|class|interface|type)[[:space:]]+[A-Za-z_][A-Za-z0-9_]*' \
      | sed -E 's/^[[:space:]]*export[[:space:]]+(default[[:space:]]+)?(async[[:space:]]+function|abstract[[:space:]]+class|function|class|const|let|var|interface|type)[[:space:]]+([A-Za-z_][A-Za-z0-9_]*).*/\3/' \
      | sort -u)"
    if [[ -n "$EXPORT_NAMES" ]]; then
      NO_CONSUMER_NAMES=""
      while IFS= read -r name; do
        [[ -z "$name" ]] && continue
        # Search for any reference to `name` in other JS/TS files. Use git
        # grep's own `-w` word match with `-F` fixed string — portable to BSD
        # (macOS), unlike a GNU `\b` regex which BSD regcomp does not support.
        # This still catches `Name(`, `Name.`, ` Name `, etc. at word boundaries.
        REFS="$(_doit_timeout 5s git -C "$REPO_ROOT" grep -lwF -e "$name" \
          -- '*.ts' '*.tsx' '*.js' '*.jsx' '*.mjs' '*.cjs' 2>/dev/null || true)"
        # Drop the current file from the result.
        REL_FILE="${FILE_PATH#"${REPO_ROOT}/"}"
        REFS_OTHER="$(printf '%s\n' "$REFS" \
          | grep -vxF -- "$REL_FILE" \
          | grep -vE '^$' \
          | head -n1 || true)"
        if [[ -z "$REFS_OTHER" ]]; then
          NO_CONSUMER_NAMES="${NO_CONSUMER_NAMES:+${NO_CONSUMER_NAMES}, }${name}"
        fi
      done <<<"$EXPORT_NAMES"
      if [[ -n "$NO_CONSUMER_NAMES" ]]; then
        _record_family "no-consumer"
        _append_detail "no-consumer: ${NO_CONSUMER_NAMES} (newly-exported, no other file references it — decision ladder rung 1: does it need to exist, or can it be inlined or dropped?)"
      fi
    fi
    ;;
esac

# ------------------------------------------------------------------------
# Family 3: copy-paste — contiguous ≥5 non-trivial new lines whose body lines
# (skipping first + last, which often carry the function signature / closing
# brace) both appear verbatim in another file in the same directory.
# ------------------------------------------------------------------------
CHUNKS_FILE="$(mktemp 2>/dev/null || echo "/tmp/do-it-anti-patterns-$$")"
trap 'rm -f "$CHUNKS_FILE" 2>/dev/null' EXIT
printf '%s\n' "$ADDED_LINES" | awk '
  function flush() {
    if (size >= 5) {
      print "===CHUNK==="
      for (i = 0; i < size; i++) print buf[i]
    }
    size = 0
    delete buf
  }
  {
    line = $0
    trimmed = line
    sub(/^[[:space:]]+/, "", trimmed)
    sub(/[[:space:]]+$/, "", trimmed)
    if (length(trimmed) < 20) { flush(); next }
    if (trimmed ~ /^(\/\/|#|\*|\/\*)/) { flush(); next }
    buf[size++] = line
  }
  END { flush() }
' > "$CHUNKS_FILE"

REL_DIR="${FILE_DIR#"${REPO_ROOT}/"}"
[[ "$REL_DIR" == "$FILE_DIR" ]] && REL_DIR="."
REL_FILE="${FILE_PATH#"${REPO_ROOT}/"}"

COPYPASTE_HIT=0
COPYPASTE_NEIGHBOR=""

_check_chunk() {
  # Args: <fingerprint_a> <fingerprint_b>. Sets COPYPASTE_HIT / COPYPASTE_NEIGHBOR.
  local fa="$1" fb="$2"
  [[ -z "$fa" || -z "$fb" || "$fa" == "$fb" ]] && return 0
  local cand
  cand="$(_doit_timeout 5s git -C "$REPO_ROOT" grep -lF -- "$fa" "$REL_DIR" 2>/dev/null \
    | grep -vxF -- "$REL_FILE" \
    | head -n5 || true)"
  [[ -z "$cand" ]] && return 0
  local row
  while IFS= read -r row; do
    [[ -z "$row" ]] && continue
    if _doit_timeout 5s git -C "$REPO_ROOT" grep -q -F -- "$fb" "$row" 2>/dev/null; then
      COPYPASTE_HIT=1
      COPYPASTE_NEIGHBOR="$row"
      return 0
    fi
  done <<<"$cand"
}

# Buffer one chunk at a time, then pick lines[1] and lines[N-2] as fingerprints —
# these skip the function signature (line 0) and closing brace (line N-1), which
# would otherwise change with a function rename.
chunk_lines=()
_evaluate_chunk() {
  local n=${#chunk_lines[@]}
  [[ "$n" -lt 5 ]] && { chunk_lines=(); return 0; }
  local fa="${chunk_lines[1]}"
  local fb="${chunk_lines[$((n - 2))]}"
  _check_chunk "$fa" "$fb"
  chunk_lines=()
}

while IFS= read -r line || [[ -n "$line" ]]; do
  if [[ "$line" == "===CHUNK===" ]]; then
    [[ "$COPYPASTE_HIT" -eq 1 ]] && break
    _evaluate_chunk
    continue
  fi
  chunk_lines+=("$line")
done < "$CHUNKS_FILE"

if [[ "$COPYPASTE_HIT" -eq 0 ]]; then
  _evaluate_chunk
fi

rm -f "$CHUNKS_FILE" 2>/dev/null

if [[ "$COPYPASTE_HIT" -eq 1 ]]; then
  _record_family "copy-paste"
  _append_detail "copy-paste: a ≥5-line block looks duplicated against ${COPYPASTE_NEIGHBOR} — consider reusing the existing helper instead of copying"
fi

# ------------------------------------------------------------------------
if [[ -z "$HIT_FAMILIES" ]]; then
  do_it_debug anti-patterns-lint "decision=clean reason=no-anti-patterns file=$FILE_PATH"
  exit 0
fi

PROJECT_ROOT="$(do_it_project_root "$CWD")"
PROJECT_ROOT="${PROJECT_ROOT%/}"
# FILE_PATH was symlink-resolved with pwd -P above; resolve PROJECT_ROOT the same
# way so the display strip still works when CWD is a symlinked path (macOS).
PROJECT_ROOT="$(cd "$PROJECT_ROOT" 2>/dev/null && pwd -P || printf '%s' "$PROJECT_ROOT")"
case "$FILE_PATH" in
  "$PROJECT_ROOT"/*) DISPLAY_PATH="${FILE_PATH#"$PROJECT_ROOT"/}" ;;
  *) DISPLAY_PATH="$FILE_PATH" ;;
esac

REMINDER=$'<system-reminder>\n'
REMINDER+="do-it anti-patterns-lint (advisory): edit on ${DISPLAY_PATH} matched ${HIT_FAMILIES}."$'\n'
while IFS= read -r detail; do
  [[ -z "$detail" ]] && continue
  REMINDER+="- ${detail}"$'\n'
done <<<"$HIT_DETAILS"
REMINDER+="Skill ref: do-it-comments-discipline already covers narrative anti-patterns; for case-list / no-consumer / copy-paste, the lint is the only signal — review and revise before declaring done. Suppress per edit with the literal string anti-patterns-lint-allow in the new lines."
REMINDER+=$'\n</system-reminder>'

do_it_emit_context PostToolUse "$REMINDER"
do_it_debug anti-patterns-lint "decision=flagged families=$HIT_FAMILIES file=$DISPLAY_PATH"

exit 0
