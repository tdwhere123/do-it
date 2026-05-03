#!/usr/bin/env bash
# do-it grill (UserPromptSubmit half).
# Triggers when the current tier and prompt shape justify decision pressure:
# Heavy always, Standard when uncertain / explicitly requested / long with a
# planning hint. Light never auto-grills.
#
# 0.5.x behavior:
#   - Once a session is already grilled, subsequent prompts are skipped unless
#     the user explicitly asks to re-grill (重新 grill / 再 pressure-test /
#     重新审视 / re-grill).
#   - Question / discussion turns are skipped via state.last_prompt_kind=question
#     and by direct detection here.
#   - Standard-tier turns receive a compact decision-check pointer; Heavy-tier
#     turns receive the fuller fact-first grill reminder.

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
source "${SCRIPT_DIR}/lib/common.sh"
# shellcheck source=lib/keywords.sh
source "${SCRIPT_DIR}/lib/keywords.sh"
# shellcheck source=lib/debug.sh
source "${SCRIPT_DIR}/lib/debug.sh"

RAW_INPUT="$(do_it_read_stdin)"
PROMPT="$(do_it_json_get "$RAW_INPUT" prompt)"
SESSION_ID="$(do_it_json_get "$RAW_INPUT" session_id)"
CWD="$(do_it_json_get "$RAW_INPUT" cwd)"

do_it_source_local_keywords "$CWD"
do_it_session_state_inc "$SESSION_ID" hook_invocations grill_prompt

# Escape keywords: write skip flags and bail.
if do_it_prompt_has_escape "$PROMPT"; then
  do_it_debug grill-prompt "decision=escape"
  do_it_write_skip "$SESSION_ID" router grill gate
  exit 0
fi

if do_it_check_skip "$SESSION_ID" grill; then
  do_it_debug grill-prompt "decision=skip-flag"
  exit 0
fi

# Detect explicit grill / re-grill requests so a returning user can force it
# back on without relying on intent verbs.
PROMPT_LC="$(do_it_lc "$PROMPT")"
EXPLICIT_GRILL=0
RE_GRILL=0
case "$PROMPT_LC" in
  *"grill"*|*"pressure-test"*|*"pressure test"*|*"压力测试"*|*"压测"*|*"挑战一下"*|*"拷问"*|*"审视一下"*)
    EXPLICIT_GRILL=1
    ;;
esac
case "$PROMPT_LC" in
  *"重新 grill"*|*"重新grill"*|*"再 pressure-test"*|*"再pressure-test"*|*"重新审视"*|*"re-grill"*|*"regrill"*)
    EXPLICIT_GRILL=1
    RE_GRILL=1
    ;;
esac

LAST_PROMPT_KIND="$(do_it_session_state_get "$SESSION_ID" last_prompt_kind)"

# Question turns: router has already classified Light and tagged the prompt
# kind, but keep local detection as a fallback when the hook is run alone.
# A direct "grill this?" request is still a manual grill request, not an
# ordinary discussion turn.
if [[ "$EXPLICIT_GRILL" -eq 0 ]] && { [[ "$LAST_PROMPT_KIND" == "question" ]] || do_it_prompt_is_question "$PROMPT"; }; then
  do_it_debug grill-prompt "decision=question"
  exit 0
fi

# Same-session de-dup: if we already grilled and the user did not re-request,
# stay quiet.
if [[ "$RE_GRILL" -eq 0 ]]; then
  GRILLED="$(do_it_session_state_get "$SESSION_ID" grilled)"
  if [[ "$GRILLED" == "skip-question" && "$LAST_PROMPT_KIND" != "question" ]]; then
    do_it_session_state_set "$SESSION_ID" grilled "0"
    GRILLED="0"
  fi
  if [[ -n "$GRILLED" && "$GRILLED" != "0" && "$GRILLED" != "skip-question" ]]; then
    do_it_debug grill-prompt "decision=already-grilled state=$GRILLED"
    exit 0
  fi
fi

PROMPT_LEN=${#PROMPT}
TRIGGER=""
TIER="$(do_it_session_state_get "$SESSION_ID" tier)"

# Heavy tier always triggers grill — high risk earns the budget regardless of
# whether another trigger appears in the prompt itself.
if [[ "$TIER" == "Heavy" ]]; then
  TRIGGER="heavy-tier"
fi

if [[ -z "$TRIGGER" && "$EXPLICIT_GRILL" -eq 1 ]]; then
  TRIGGER="explicit"
fi
if [[ -z "$TRIGGER" && "$TIER" == "Light" ]]; then
  do_it_debug grill-prompt "decision=no-trigger tier=$TIER reason=light"
  exit 0
fi
if [[ -z "$TRIGGER" && "$TIER" == "Standard" ]] && do_it_prompt_has_any "$PROMPT" DO_IT_UNCERTAINTY_WORDS; then
  TRIGGER="uncertainty"
fi
if [[ -z "$TRIGGER" && "$TIER" == "Standard" ]]; then
  if [[ "$PROMPT_LEN" -gt "$DO_IT_LONG_INPUT_THRESHOLD" ]] && \
     do_it_prompt_has_any "$PROMPT" DO_IT_LONG_INPUT_HINTS; then
    TRIGGER="long-input"
  fi
fi

if [[ -z "$TRIGGER" ]]; then
  do_it_debug grill-prompt "decision=no-trigger tier=$TIER"
  exit 0
fi

# Heavy-tier turns get a fuller fact-first reminder; everyone else gets the
# pointer-mode compressed reminder.

if [[ "$TIER" == "Heavy" ]]; then
  MSG="<system-reminder>
do-it grill (Heavy, trigger: ${TRIGGER}). Before plan or code: verify local facts first, pressure-test the load-bearing decision, ask the user only one question when facts cannot decide, then record the decision/evidence in the grill log if durable planning is used.

Skip grill only if: prompt contains 'yolo', '直接做', '我已经想清楚', 'skip grill', or /do-it-skip was invoked.
</system-reminder>"
else
  MSG="<system-reminder>
do-it grill (trigger: ${TRIGGER}). Verify facts first; ask one focused question only if the next action depends on a user decision. Full flow: load skill do-it-grill. Skip: yolo / /do-it-skip.
</system-reminder>"
fi

do_it_session_state_set "$SESSION_ID" grilled 1
do_it_debug grill-prompt "decision=emit tier=$TIER trigger=$TRIGGER mode=$([ "$TIER" = "Heavy" ] && echo full || echo pointer)"
do_it_emit_context UserPromptSubmit "$MSG"
exit 0
