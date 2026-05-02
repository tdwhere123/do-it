#!/usr/bin/env bash
# do-it grill (PreToolUse half, matcher: Edit|Write).
# Blocks writes to .do-it/plans/** without a "## Grill" section, and writes to
# src/**, packages/**, apps/** when no plan exists for this session.

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
source "${SCRIPT_DIR}/lib/common.sh"
# shellcheck source=lib/keywords.sh
source "${SCRIPT_DIR}/lib/keywords.sh"
# shellcheck source=lib/debug.sh
source "${SCRIPT_DIR}/lib/debug.sh"

RAW_INPUT="$(do_it_read_stdin)"
SESSION_ID="$(do_it_json_get "$RAW_INPUT" session_id)"
CWD="$(do_it_json_get "$RAW_INPUT" cwd)"
TOOL_NAME="$(do_it_json_get "$RAW_INPUT" tool_name)"
FILE_PATH="$(do_it_json_get_nested "$RAW_INPUT" tool_input.file_path)"

do_it_session_state_inc "$SESSION_ID" hook_invocations grill_pretool

if do_it_check_skip "$SESSION_ID" grill; then
  do_it_debug grill-pretool "decision=skip-flag"
  exit 0
fi

case "$TOOL_NAME" in
  Edit|Write|MultiEdit) ;;
  *) exit 0 ;;
esac

if [[ -z "$FILE_PATH" ]]; then
  exit 0
fi

PROJECT_ROOT="$(do_it_project_root "$CWD")"
PROJECT_ROOT="${PROJECT_ROOT%/}"

# Only act on paths inside the project root.
case "$FILE_PATH" in
  "$PROJECT_ROOT"/*) REL_PATH="${FILE_PATH#"$PROJECT_ROOT"/}" ;;
  *) exit 0 ;;
esac

# Rule 1: writes to .do-it/plans/** must include a "## Grill" section.
if [[ "$REL_PATH" == .do-it/plans/* ]]; then
  CONTENT="$(do_it_json_get_nested "$RAW_INPUT" tool_input.content)"
  NEW_STRING="$(do_it_json_get_nested "$RAW_INPUT" tool_input.new_string)"
  # MultiEdit ships an `edits` array of {old_string,new_string,...}; flatten
  # all new_string values into the body we scan.
  MULTI_NEW=""
  if [[ "$DO_IT_HAVE_JQ" == "1" && "$TOOL_NAME" == "MultiEdit" ]]; then
    MULTI_NEW="$(printf '%s' "$RAW_INPUT" | jq -r '.tool_input.edits[]?.new_string // ""' 2>/dev/null | tr '\n' '\f')"
  fi
  COMBINED="${CONTENT}${NEW_STRING}${MULTI_NEW}"
  if [[ -n "$COMBINED" ]]; then
    if ! printf '%s' "$COMBINED" | grep -qE '^##[[:space:]]+[Gg]rill'; then
      do_it_debug grill-pretool "decision=block reason=plan-missing-grill path=$REL_PATH"
      echo "do-it grill-pretool: plan being written has no '## Grill' section. Run grill before landing the plan, or include skip 'grill' / yolo." >&2
      exit 2
    fi
  fi
  exit 0
fi

# Rule 2: writes to src/** or packages/** require an existing plan in this session.
case "$REL_PATH" in
  src/*|packages/*|apps/*)
    PLANS_DIR="$PROJECT_ROOT/.do-it/plans"
    if [[ ! -d "$PLANS_DIR" ]] || [[ -z "$(ls -A "$PLANS_DIR" 2>/dev/null)" ]]; then
      do_it_debug grill-pretool "decision=block reason=src-without-plan path=$REL_PATH"
      echo "do-it grill-pretool: no .do-it/plans/* exists. Run do-it-grill + do-it-planning to land a plan card before editing src/packages/apps. Bypass: /do-it-skip grill." >&2
      exit 2
    fi
    ;;
esac

exit 0
