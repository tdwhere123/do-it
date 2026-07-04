#!/usr/bin/env bash
# do-it grill (PreToolUse half, matcher: Edit|Write).
# Blocks Heavy / explicit durable-plan writes to .do-it/plans/** without a
# "## Grill" section, and blocks Heavy / durable-plan source writes when no
# plan exists for this session. Standard source edits may use an inline
# modification map instead of a tracked plan file.

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
TRANSCRIPT_PATH="$(do_it_json_get "$RAW_INPUT" transcript_path)"
FILE_PATH="$(do_it_json_get_nested "$RAW_INPUT" tool_input.file_path)"

# Subagent context: bail before any state mutation. Subagents in a Heavy
# parent session are running their own delegated slice and must not be
# blocked by the parent's plan-gate. Mirrors the same skip used in router.sh
# and comments-lint.sh.
if do_it_in_subagent_context "$TRANSCRIPT_PATH"; then
  do_it_debug grill-pretool "decision=skip reason=subagent-context"
  exit 0
fi

do_it_session_state_inc "$SESSION_ID" hook_invocations grill_pretool

if do_it_check_skip "$SESSION_ID" grill; then
  do_it_debug grill-pretool "decision=skip-flag"
  exit 0
fi

case "$TOOL_NAME" in
  Edit|Write|MultiEdit|NotebookEdit|StrReplace|EditNotebook) ;;
  *) exit 0 ;;
esac

if [[ -z "$FILE_PATH" ]]; then
  exit 0
fi

PROJECT_ROOT="$(do_it_project_root "$CWD")"
PROJECT_ROOT="${PROJECT_ROOT%/}"
TIER="$(do_it_session_state_get "$SESSION_ID" tier)"
DURABLE_PLAN_REQUIRED="$(do_it_session_state_get "$SESSION_ID" durable_plan_required)"

PLAN_GATE_REQUIRED=0
if [[ "$TIER" == "Heavy" || "$DURABLE_PLAN_REQUIRED" == "1" ]]; then
  PLAN_GATE_REQUIRED=1
fi

# Only act on paths inside the project root.
case "$FILE_PATH" in
  "$PROJECT_ROOT"/*) REL_PATH="${FILE_PATH#"$PROJECT_ROOT"/}" ;;
  *) exit 0 ;;
esac

# Rule 1: Heavy / durable-plan creation or overwrite of .do-it/plans/** must
# include a "## Grill" section. Local edits to an existing plan do not have to
# repeat the heading in the edited fragment.
if [[ "$REL_PATH" == .do-it/plans/* ]]; then
  if [[ "$PLAN_GATE_REQUIRED" == "1" ]]; then
    REQUIRE_PLAN_GRILL=0
    if [[ "$TOOL_NAME" == "Write" || ! -e "$FILE_PATH" ]]; then
      REQUIRE_PLAN_GRILL=1
    fi

    if [[ "$REQUIRE_PLAN_GRILL" == "1" ]]; then
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
          do_it_debug grill-pretool "decision=block reason=plan-missing-grill path=$REL_PATH tier=$TIER durable=$DURABLE_PLAN_REQUIRED"
          echo "do-it grill-pretool: Heavy or durable plan creation has no '## Grill' section. Run grill before landing the plan, or include skip 'grill' / yolo." >&2
          exit 2
        fi
      fi
    fi
  fi
  exit 0
fi

# Rule 2: Heavy or explicit durable-plan writes to src/**, packages/**, apps/**
# require an existing plan. Standard work can proceed with an inline
# modification map.
case "$REL_PATH" in
  src/*|packages/*|apps/*)
    if [[ "$PLAN_GATE_REQUIRED" == "1" ]]; then
      PLANS_DIR="$PROJECT_ROOT/.do-it/plans"
      if ! ls "$PLANS_DIR"/*.md >/dev/null 2>&1; then
        do_it_debug grill-pretool "decision=block reason=src-without-plan path=$REL_PATH tier=$TIER durable=$DURABLE_PLAN_REQUIRED"
        echo "do-it grill-pretool: Heavy or explicit durable-plan work has no .do-it/plans/* file. Land a plan card before editing src/packages/apps, or bypass with /do-it-skip grill." >&2
        exit 2
      fi
    fi
    ;;
esac

exit 0
