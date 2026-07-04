#!/usr/bin/env bash
# do-it grill (UserPromptSubmit half).
# Triggers when the current tier and prompt shape justify decision pressure:
# Heavy always, Standard when uncertain / explicitly requested / long with a
# planning hint. Light never auto-grills.
#
# Current grill prompt scope:
#   - once a session is already grilled, skip repeated reminders unless the user
#     explicitly asks to re-grill;
#   - skip question and discussion turns via router state plus direct detection;
#   - Standard-tier turns receive a compact decision-check pointer, while
#     Heavy-tier turns receive the fuller fact-first grill reminder.

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
source "${SCRIPT_DIR}/lib/common.sh"
# shellcheck source=lib/keywords.sh
source "${SCRIPT_DIR}/lib/keywords.sh"
# shellcheck source=lib/debug.sh
source "${SCRIPT_DIR}/lib/debug.sh"

# Advisory nudges (plan-card reliability, existing-codebase discipline) are
# computed once on a work turn and attached to whichever exit path this hook
# takes, so they fire even when the grill reminder itself does not. Advisory
# only — never blocks.
_doit_advisory=""
_emit_advisory_exit() {
  [[ -n "$_doit_advisory" ]] && do_it_emit_context UserPromptSubmit "$_doit_advisory"
  exit 0
}

# Read stdin first so the subagent check can use the JSON-supplied
# transcript_path (the host delivers it on stdin, not as an env var).
RAW_INPUT="$(do_it_read_stdin)"
PROMPT="$(do_it_json_get "$RAW_INPUT" prompt)"
SESSION_ID="$(do_it_json_get "$RAW_INPUT" session_id)"
CWD="$(do_it_json_get "$RAW_INPUT" cwd)"
TRANSCRIPT_PATH="$(do_it_json_get "$RAW_INPUT" transcript_path)"

# Subagent contexts inherit grill from the parent — re-injecting the grill
# reminder again would just burn tokens, so bail before doing any work.
if do_it_in_subagent_context "$TRANSCRIPT_PATH"; then
  do_it_debug grill-prompt "decision=subagent-skip"
  exit 0
fi

do_it_source_local_keywords "$CWD"
do_it_session_state_inc "$SESSION_ID" hook_invocations grill_prompt

# Escape / skip keywords: write only the parsed skip targets for this turn.
targets="$(do_it_parse_skip_targets "$PROMPT")"
if [[ -n "$targets" ]]; then
  do_it_debug grill-prompt "decision=escape targets=$targets"
  # shellcheck disable=SC2086
  do_it_write_skip "$SESSION_ID" $targets
  if [[ " $targets " == *" grill "* ]]; then
    exit 0
  fi
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

# ---- One-shot advisory nudges (work turns only; never block) ----
ADVISORY_TIER="$(do_it_session_state_get "$SESSION_ID" tier)"

# Plan-card nudge: grill ran in a prior turn and durable planning is required,
# but no plan card exists yet — nudge to land it before implementation drifts ahead.
_grilled_prev="$(do_it_session_state_get "$SESSION_ID" grilled)"
if [[ "$(do_it_session_state_get "$SESSION_ID" plan_nudged)" != "1" \
   && "$(do_it_session_state_get "$SESSION_ID" durable_plan_seen)" == "1" \
   && -n "$_grilled_prev" && "$_grilled_prev" != "0" && "$_grilled_prev" != "skip-question" ]] \
   && ! ls "${CWD}/.do-it/plans/"*.md >/dev/null 2>&1; then
  do_it_session_state_set "$SESSION_ID" plan_nudged 1
  _doit_advisory="${_doit_advisory}<system-reminder>
do-it planning: grill has converged and this is durable-plan work, but no .do-it/plans/<slug>.md exists yet. Load do-it-planning to land the plan card (acceptance criteria, failure-mode forecast, path map) before implementing. Advisory — skip only if an inline modification map fully covers the work.
</system-reminder>"
fi

# Existing-codebase / port-restore "understand before you change" nudge.
if [[ "$(do_it_session_state_get "$SESSION_ID" brownfield_nudged)" != "1" ]]; then
  _port="$(do_it_session_state_get "$SESSION_ID" port_intent)"
  _brown="$(do_it_session_state_get "$SESSION_ID" dim_brownfield)"
  _touch="$(do_it_session_state_get "$SESSION_ID" dim_touches_code)"
  if [[ "$_port" == "1" ]]; then
    do_it_session_state_set "$SESSION_ID" brownfield_nudged 1
    _doit_advisory="${_doit_advisory}<system-reminder>
do-it (existing code): this looks like port / restore / reintroduce work. Before writing a 'port' plan, grep/Glob the current packages/apps/migrations for the target name — it may already exist; if so, extend it instead of rebuilding. Advisory.
</system-reminder>"
  elif [[ "$_brown" == "1" && "$_touch" == "1" ]] && { [[ "$ADVISORY_TIER" == "Standard" || "$ADVISORY_TIER" == "Heavy" ]]; }; then
    do_it_session_state_set "$SESSION_ID" brownfield_nudged 1
    _doit_advisory="${_doit_advisory}<system-reminder>
do-it (existing code): this is an established codebase. Before editing, read the file/area you are changing and reuse its existing patterns, names, and invariants (.do-it/CONTEXT.md and handbook if present) rather than assuming greenfield. Advisory.
</system-reminder>"
  fi
fi

# Greenfield handbook bootstrap nudge: first Standard/Heavy code turn on a
# project with no do-it context should create the handbook skeleton before
# planning or editing, so later sessions do not re-derive the same facts.
if [[ "$(do_it_session_state_get "$SESSION_ID" handbook_nudged)" != "1" ]]; then
  _brown="$(do_it_session_state_get "$SESSION_ID" dim_brownfield)"
  _touch="$(do_it_session_state_get "$SESSION_ID" dim_touches_code)"
  if [[ "$_brown" == "0" && "$_touch" == "1" ]] && { [[ "$ADVISORY_TIER" == "Standard" || "$ADVISORY_TIER" == "Heavy" ]]; }; then
    do_it_session_state_set "$SESSION_ID" handbook_nudged 1
    _doit_advisory="${_doit_advisory}<system-reminder>
do-it (handbook): this project has no .do-it/handbook/ or .do-it/CONTEXT.md yet. Load skill do-it-handbook and bootstrap the skeleton (additive, no overwrite) before planning or editing. Advisory — skip only if the user explicitly says this is a one-shot script.
</system-reminder>"
  fi
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
    _emit_advisory_exit
  fi
fi

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
  _emit_advisory_exit
fi
if [[ -z "$TRIGGER" && "$TIER" == "Standard" ]] && do_it_prompt_has_any "$PROMPT" DO_IT_UNCERTAINTY_WORDS; then
  TRIGGER="uncertainty"
fi
if [[ -z "$TRIGGER" && "$TIER" == "Standard" && "$(do_it_session_state_get "$SESSION_ID" dim_breaks_interface)" == "1" ]]; then
  TRIGGER="interface-change"
fi

# Dimension-aware suppression: an implicit trigger on a Standard turn that did
# not name any code object is almost always a discussion turn. Demote unless
# the user explicitly asked to grill. dim_touches_code is written by the
# router only for Standard / Heavy; Heavy ignores this check via the
# heavy-tier early return above.
if [[ -n "$TRIGGER" && "$TIER" == "Standard" && "$EXPLICIT_GRILL" -eq 0 ]]; then
  TOUCHES_CODE="$(do_it_session_state_get "$SESSION_ID" dim_touches_code)"
  if [[ "$TOUCHES_CODE" != "1" ]]; then
    do_it_debug grill-prompt "decision=no-trigger tier=Standard reason=dim-touches-code-zero original-trigger=${TRIGGER}"
    _emit_advisory_exit
  fi
fi

if [[ -z "$TRIGGER" ]]; then
  do_it_debug grill-prompt "decision=no-trigger tier=$TIER"
  _emit_advisory_exit
fi

# Heavy-tier turns get a fuller fact-first reminder; everyone else gets the
# pointer-mode compressed reminder.
#
# When .do-it/brainstorm/<task>.md exists with `status: open` for the current
# project, append a convergence-mode pointer so grill consumes that artifact
# instead of restarting divergence. Light tier ignores brainstorm by design.

BRAINSTORM_OPEN=0
if [[ "$TIER" != "Light" && -d "${CWD}/.do-it/brainstorm" ]]; then
  if grep -lZ -E '^status:[[:space:]]*open[[:space:]]*$' "${CWD}/.do-it/brainstorm"/*.md >/dev/null 2>&1; then
    BRAINSTORM_OPEN=1
  fi
fi

if [[ "$TIER" == "Heavy" ]]; then
  MSG="<system-reminder>
do-it grill (Heavy, trigger: ${TRIGGER}). Before planning or code: (1) check necessity — does this need to exist, or does an existing capability already cover it? (2) verify the one load-bearing premise against local files and cite path:line — never ask the user for facts you can read; (3) if a genuine user decision remains, ask exactly one question with 2-3 options and a recommended default. Record decisions in .do-it/grill/<task>.md when durable planning is used.

Skip: say 'skip grill' (or yolo / 直接做 / /do-it-skip grill) and announce \`skipped: grill because <reason>\`.
</system-reminder>"
else
  MSG="<system-reminder>
do-it grill (${TRIGGER}): verify the key premise against local files before acting; at most one decision question, with a recommended default. Load do-it-grill if the premise stays unclear. Skip: 'skip grill' / /do-it-skip grill.
</system-reminder>"
fi

if [[ "$BRAINSTORM_OPEN" -eq 1 ]]; then
  MSG="${MSG}<system-reminder>
do-it grill convergence: .do-it/brainstorm/ has at least one task with status: open. Read its 'Open decisions for grill' section, rank by route-impact, resolve each via the grill log, then flip brainstorm status to converged. See do-it-grill 'Convergence after brainstorm'.
</system-reminder>"
fi

do_it_session_state_set "$SESSION_ID" grilled 1
do_it_debug grill-prompt "decision=emit tier=$TIER trigger=$TRIGGER mode=$([ "$TIER" = "Heavy" ] && echo full || echo pointer)"

# Debug-only: append trigger reason inside an HTML comment.
case "${DO_IT_DEBUG:-0}" in
  ''|0|false|FALSE|off|OFF) ;;
  *)
    MSG="${MSG}
<!-- triggered by: tier=${TIER}, trigger=${TRIGGER} -->"
    ;;
esac

do_it_emit_context UserPromptSubmit "${MSG}${_doit_advisory}"
exit 0
