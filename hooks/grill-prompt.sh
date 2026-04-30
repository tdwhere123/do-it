#!/usr/bin/env bash
# do-it grill (UserPromptSubmit half).
# Triggers when the prompt contains intent verbs / uncertainty words / long
# input with topical hints. Injects "list 5 most-likely-wrong premises" guidance.

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
source "${SCRIPT_DIR}/lib/common.sh"
# shellcheck source=lib/keywords.sh
source "${SCRIPT_DIR}/lib/keywords.sh"

RAW_INPUT="$(do_it_read_stdin)"
PROMPT="$(do_it_json_get "$RAW_INPUT" prompt)"
SESSION_ID="$(do_it_json_get "$RAW_INPUT" session_id)"
CWD="$(do_it_json_get "$RAW_INPUT" cwd)"

do_it_source_local_keywords "$CWD"

# Escape keywords: write skip flags and bail.
if do_it_prompt_has_escape "$PROMPT"; then
  do_it_write_skip "$SESSION_ID" router grill gate
  exit 0
fi

if do_it_check_skip "$SESSION_ID" grill; then
  exit 0
fi

PROMPT_LEN=${#PROMPT}
TRIGGER=""

if do_it_prompt_has_any "$PROMPT" DO_IT_INTENT_VERBS; then
  TRIGGER="intent-verb"
fi
if [[ -z "$TRIGGER" ]] && do_it_prompt_has_any "$PROMPT" DO_IT_UNCERTAINTY_WORDS; then
  TRIGGER="uncertainty"
fi
if [[ -z "$TRIGGER" ]]; then
  if [[ "$PROMPT_LEN" -gt "$DO_IT_LONG_INPUT_THRESHOLD" ]] || \
     do_it_prompt_has_any "$PROMPT" DO_IT_LONG_INPUT_HINTS; then
    TRIGGER="long-input"
  fi
fi

if [[ -z "$TRIGGER" ]]; then
  exit 0
fi

MSG="<system-reminder>
do-it grill (trigger: ${TRIGGER}). Before any plan or code:

1. List the 5 premises most likely to be wrong about this task — including unstated assumptions and constraints the user did NOT spell out.
2. Identify any conflict between the request and existing project invariants (CLAUDE.md, code conventions, current data shapes).
3. Pin down ambiguous terms — what does each fuzzy noun/verb actually mean here?
4. Surface the failure modes you can already predict, by category (correctness / contract / migration / performance / security / UX).
5. Decide what evidence would falsify your current understanding — and how to gather it cheaply.

Skip grill only if: prompt contains 'yolo', '直接做', '我已经想清楚', 'skip grill', or /do-it-skip was invoked.
</system-reminder>"

do_it_emit_context UserPromptSubmit "$MSG"
exit 0
