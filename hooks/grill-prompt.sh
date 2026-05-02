#!/usr/bin/env bash
# do-it grill (UserPromptSubmit half).
# Triggers when the prompt contains intent verbs / uncertainty words / long
# input with topical hints. Injects "list 5 most-likely-wrong premises" guidance.
#
# 0.5.0 changes:
#   - Once a session is already grilled, subsequent prompts are skipped unless
#     the user explicitly asks to re-grill (重新 grill / 再 pressure-test /
#     重新审视 / re-grill).
#   - Question / discussion turns (caught by router via DO_IT_QUESTION_HINTS)
#     are skipped — router writes state.grilled=skip-question so we can detect
#     them here without re-running the question detection.
#   - Standard-tier turns receive a compact pointer (~60 tokens) instead of the
#     full 5-step template; Heavy-tier turns still receive the full version.

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

# Question turns: router has already classified Light + tagged skip-question.
if do_it_prompt_is_question "$PROMPT"; then
  do_it_debug grill-prompt "decision=question"
  exit 0
fi

# Detect explicit re-grill requests so a returning user can force it back on.
PROMPT_LC="$(do_it_lc "$PROMPT")"
RE_GRILL=0
case "$PROMPT_LC" in
  *"重新 grill"*|*"重新grill"*|*"再 pressure-test"*|*"再pressure-test"*|*"重新审视"*|*"re-grill"*|*"regrill"*)
    RE_GRILL=1
    ;;
esac

# Same-session de-dup: if we already grilled and the user did not re-request,
# stay quiet.
if [[ "$RE_GRILL" -eq 0 ]]; then
  GRILLED="$(do_it_session_state_get "$SESSION_ID" grilled)"
  if [[ -n "$GRILLED" && "$GRILLED" != "0" ]]; then
    do_it_debug grill-prompt "decision=already-grilled state=$GRILLED"
    exit 0
  fi
fi

PROMPT_LEN=${#PROMPT}
TRIGGER=""
TIER="$(do_it_session_state_get "$SESSION_ID" tier)"

# Heavy tier always triggers grill — high risk earns the budget regardless of
# whether an intent verb appears in the prompt itself.
if [[ "$TIER" == "Heavy" ]]; then
  TRIGGER="heavy-tier"
fi

if [[ -z "$TRIGGER" ]] && do_it_prompt_has_any "$PROMPT" DO_IT_INTENT_VERBS; then
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
  do_it_debug grill-prompt "decision=no-trigger tier=$TIER"
  exit 0
fi

# Heavy-tier turns get the full 5-step template; everyone else gets the
# pointer-mode compressed reminder.

if [[ "$TIER" == "Heavy" ]]; then
  MSG="<system-reminder>
do-it grill (Heavy, trigger: ${TRIGGER}). Before any plan or code:

1. List the 5 premises most likely to be wrong about this task — including unstated assumptions and constraints the user did NOT spell out.
2. Identify any conflict between the request and existing project invariants (CLAUDE.md, code conventions, current data shapes).
3. Pin down ambiguous terms — what does each fuzzy noun/verb actually mean here?
4. Surface the failure modes you can already predict, by category (correctness / contract / migration / performance / security / UX).
5. Decide what evidence would falsify your current understanding — and how to gather it cheaply.

Skip grill only if: prompt contains 'yolo', '直接做', '我已经想清楚', 'skip grill', or /do-it-skip was invoked.
</system-reminder>"
else
  MSG="<system-reminder>
do-it grill (trigger: ${TRIGGER}). Before acting: list the top 5 premises most likely wrong (incl. unstated constraints), check conflicts vs CLAUDE.md / project invariants, pin down fuzzy terms. Full flow: load skill do-it-grill. Skip: yolo / /do-it-skip.
</system-reminder>"
fi

do_it_session_state_set "$SESSION_ID" grilled 1
do_it_debug grill-prompt "decision=emit tier=$TIER trigger=$TRIGGER mode=$([ "$TIER" = "Heavy" ] && echo full || echo pointer)"
do_it_emit_context UserPromptSubmit "$MSG"
exit 0
