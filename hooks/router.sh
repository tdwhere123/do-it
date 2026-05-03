#!/usr/bin/env bash
# do-it router (UserPromptSubmit hook).
# Classifies the prompt as Light / Standard / Heavy and injects the
# recommended skill set as additionalContext. Never blocks on its own.

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
do_it_session_state_inc "$SESSION_ID" hook_invocations router

do_it_prompt_requires_durable_plan() {
  local prompt_lc
  prompt_lc="$(do_it_lc "$1")"
  case "$prompt_lc" in
    *".do-it/plans"*|*"durable plan"*|*"plan card"*|*"handoff card"*|*"written plan"*|*"write a plan first"*|*"plan first"*|*"先写"*"计划"*|*"先制定"*"计划"*|*"先确认"*"计划"*|*"先规划"*"计划"*|*"计划卡"*|*"持久计划"*)
      return 0
      ;;
  esac
  return 1
}

# Escape keywords: write skip flags for ALL hooks and pass through.
if do_it_prompt_has_escape "$PROMPT"; then
  do_it_debug router "decision=escape session=$SESSION_ID"
  do_it_write_skip "$SESSION_ID" router grill gate
  exit 0
fi

# Honor pre-existing skip flag.
if do_it_check_skip "$SESSION_ID" router; then
  do_it_debug router "decision=skip-flag session=$SESSION_ID"
  exit 0
fi

PROMPT_LEN=${#PROMPT}
TIER=""

# Question / discussion mode short-circuits to Light. Track this separately
# from the "already grilled" marker so one question turn cannot suppress the
# next implementation turn in the same session.
if do_it_prompt_is_question "$PROMPT"; then
  TIER="Light"
  do_it_session_state_set "$SESSION_ID" last_prompt_kind "question"
  do_it_debug router "question=true tier=Light"
else
  do_it_session_state_set "$SESSION_ID" last_prompt_kind "work"
  if [[ "$(do_it_session_state_get "$SESSION_ID" grilled)" == "skip-question" ]]; then
    do_it_session_state_set "$SESSION_ID" grilled "0"
  fi
fi

# Heavy upgrade requires ≥2 heavy signals to land. Single signal demotes to
# Standard so casual mentions of `schema` / `api` / `migration` do not pull
# the whole Heavy ceremony in by themselves.
heavy_count=0
if [[ -z "$TIER" ]]; then
  PROMPT_LC="$(do_it_lc "$PROMPT")"
  for signal in "${DO_IT_HEAVY_SIGNALS[@]}"; do
    [[ -z "$signal" ]] && continue
    sig_lc="$(do_it_lc "$signal")"
    if _do_it_term_is_ascii "$sig_lc"; then
      do_it_prompt_has_word "$PROMPT_LC" "$sig_lc" && heavy_count=$((heavy_count + 1))
    else
      [[ "$PROMPT_LC" == *"$sig_lc"* ]] && heavy_count=$((heavy_count + 1))
    fi
    [[ "$heavy_count" -ge 2 ]] && break
  done
fi

if [[ -z "$TIER" ]]; then
  if [[ "$heavy_count" -ge 2 ]]; then
    TIER="Heavy"
  elif [[ "$PROMPT_LEN" -lt 60 ]] && do_it_prompt_has_any "$PROMPT" DO_IT_LIGHT_SIGNALS; then
    TIER="Light"
  elif [[ "$heavy_count" -ge 1 ]]; then
    TIER="Standard"
  elif do_it_prompt_has_any "$PROMPT" DO_IT_INTENT_VERBS; then
    TIER="Standard"
  else
    TIER="Light"
  fi
fi

do_it_session_state_set "$SESSION_ID" tier "$TIER"
do_it_session_state_inc "$SESSION_ID" tier_history "$TIER"

durable_plan_required=0
if [[ "$TIER" == "Heavy" ]] || do_it_prompt_requires_durable_plan "$PROMPT"; then
  durable_plan_required=1
fi
do_it_session_state_set "$SESSION_ID" durable_plan_required "$durable_plan_required"

do_it_debug router "tier=$TIER heavy_count=$heavy_count prompt_len=$PROMPT_LEN"

case "$TIER" in
  Heavy)
    MSG="<system-reminder>
do-it tier: Heavy. Multi-signal change. Run do-it-router skill, verify facts before asking, use durable planning, and budget review by release/interface risk. Bypass: yolo / 直接做 / /do-it-skip.
</system-reminder>"
    ;;
  Standard)
    MSG="<system-reminder>
do-it tier: Standard. Use an inline modification map. Add grill only for uncertainty, explicit request, or long plan-like input; choose review by risk. Bypass: yolo / /do-it-skip.
</system-reminder>"
    ;;
  Light)
    MSG="<system-reminder>
do-it tier: Light. Mechanical or discussion. Skip planning artifacts. Verification gate still applies if you actually edit code.
</system-reminder>"
    ;;
esac

do_it_emit_context UserPromptSubmit "$MSG"
exit 0
