#!/usr/bin/env bash
# do-it router (UserPromptSubmit hook).
# Classifies the prompt as Light / Standard / Heavy and records routing state.
# User-visible pressure-test reminders belong to grill-prompt.sh. Never blocks
# on its own.

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
source "${SCRIPT_DIR}/lib/common.sh"
# shellcheck source=lib/keywords.sh
source "${SCRIPT_DIR}/lib/keywords.sh"
# shellcheck source=lib/debug.sh
source "${SCRIPT_DIR}/lib/debug.sh"

# Read stdin first so the subagent check can use the JSON-supplied
# transcript_path (the host delivers it on stdin, not as an env var).
RAW_INPUT="$(do_it_read_stdin)"
PROMPT="$(do_it_json_get "$RAW_INPUT" prompt)"
SESSION_ID="$(do_it_json_get "$RAW_INPUT" session_id)"
CWD="$(do_it_json_get "$RAW_INPUT" cwd)"
TRANSCRIPT_PATH="$(do_it_json_get "$RAW_INPUT" transcript_path)"

# Subagent contexts inherit tier from the parent — re-injecting another
# system-reminder just burns tokens, so bail before doing any work.
if do_it_in_subagent_context "$TRANSCRIPT_PATH"; then
  do_it_debug router "decision=subagent-skip"
  exit 0
fi

do_it_source_local_keywords "$CWD"
do_it_session_state_inc "$SESSION_ID" hook_invocations router
do_it_prune_stale_sessions "$SESSION_ID"

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
  elif do_it_prompt_has_any "$PROMPT" DO_IT_INTENT_VERBS \
       && do_it_prompt_has_code_object "$PROMPT"; then
    # Intent verb only counts as Standard when it points at a concrete code
    # object (file, path, fenced snippet, or technical noun). A bare verb
    # like "修改" with no object stays Light to avoid pulling Standard
    # ceremony into casual chat.
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
# Sticky: once durable planning is required in a session, remember it so the
# post-grill plan-card nudge can fire on a later turn even after the per-turn
# durable_plan_required is recomputed to 0 by a follow-up prompt.
if [[ "$durable_plan_required" == "1" ]]; then
  do_it_session_state_set "$SESSION_ID" durable_plan_seen 1
fi

# Existing-codebase + port/restore signals for the advisory nudges that
# grill-prompt.sh emits (router stays state-only). brownfield = the project has
# accumulated do-it context (CONTEXT.md or a handbook), so the agent should read
# that existing structure before editing rather than assume greenfield. Kept
# precise on purpose: the advisory points at those exact files, and a bare git
# repo is not "established" in the sense that matters. port_intent = the prompt
# asks to port / restore / reintroduce something that often already exists.
brownfield=0
if [[ -f "${CWD}/.do-it/CONTEXT.md" || -d "${CWD}/.do-it/handbook" ]]; then
  brownfield=1
fi
do_it_session_state_set "$SESSION_ID" dim_brownfield "$brownfield"
port_intent=0
case "$(do_it_lc "$PROMPT")" in
  *"移植"*|*"迁移回"*|*"重新引入"*|*"恢复"*|*"reintroduce"*|*"re-introduce"*|*"port from"*|*"port over"*|*"port the"*|*"restore the"*|*"bring back"*)
    port_intent=1 ;;
esac
do_it_session_state_set "$SESSION_ID" port_intent "$port_intent"

# Dimensions are orthogonal to tier. Tier stays as the single derived label
# existing skills key off; downstream skills may read these additive booleans
# when choosing TDD, review, or interface intensity. Light skips dimension
# evaluation because discussion and mechanical turns do not benefit from it.
DIM_TOUCHES_CODE=0
DIM_CROSSES_PACKAGES=0
DIM_BREAKS_INTERFACE=0
DIM_NEEDS_TDD=0
DIM_NEEDS_REVIEW_LOOP=0

if [[ "$TIER" != "Light" ]]; then
  # PROMPT_LC may be unset if Light short-circuited above; recompute defensively.
  if [[ -z "${PROMPT_LC:-}" ]]; then
    PROMPT_LC="$(do_it_lc "$PROMPT")"
  fi

  if do_it_prompt_has_code_object "$PROMPT"; then
    DIM_TOUCHES_CODE=1
  fi

  # breaks_interface: explicit interface / contract / schema mutations.
  #
  # The keyword set targets *action* phrases, not topical mentions. Discussion
  # turns ("我想讨论 endpoint 改造的设计") would otherwise false-trigger via
  # patterns like `*"endpoint"*"改"*`. Question turns are already short-
  # circuited to Light upstream and never reach this block; what we still need
  # to guard against is a Standard/Heavy *statement* turn that merely names
  # the surface without intending a change.
  #
  # Heuristic: require an action verb adjacent to the contract noun. Bare
  # mentions of `api` / `schema` / `endpoint` no longer pull this flag on
  # their own.
  case "$PROMPT_LC" in
    # Generic breaking-change banners.
    *"breaking change"*|*"breaking-change"*|*"break api"*|*"breaking api"*|\
    *"api breaking"*|*"break interface"*|*"break the api"*|*"break the schema"*|\
    *"break the contract"*|*"break "*"interface"*|*"接口变更"*|*"interface change"*|\
    *"破坏"*"接口"*|*"破坏"*"契约"*)
      DIM_BREAKS_INTERFACE=1 ;;
    # Endpoint / API removal or rename — explicit verb required.
    *"删 endpoint"*|*"remove endpoint"*|*"delete endpoint"*|*"drop endpoint"*|\
    *"rename endpoint"*|*"重命名 endpoint"*|*"重命名"*"endpoint"*|\
    *"rename "*"endpoint"*|*"endpoint"*"删"*|*"endpoint"*"重命名"*|\
    *"deprecate endpoint"*|*"deprecate "*"endpoint"*|\
    *"rename api"*|*"重命名 api"*|*"重命名"*"api"*|\
    *"rename "*"api"*|*"deprecate api"*|*"deprecate "*"api"*|\
    *"remove api"*|*"delete api"*|*"drop api"*|\
    *"rewrite api"*|*"api 重写"*|*"重写 api"*)
      DIM_BREAKS_INTERFACE=1 ;;
    # Schema / table mutations — explicit verb required.
    *"改 schema"*|*"alter schema"*|*"migrate schema"*|*"rewrite schema"*|\
    *"schema 重写"*|*"重写 schema"*|*"schema 迁移"*|\
    *"alter table"*|*"drop table"*|*"drop column"*|*"add column"*|\
    *"rename column"*|*"rename table"*)
      DIM_BREAKS_INTERFACE=1 ;;
  esac

  # needs_tdd: behaviour-modifying intent. Bare "fix" / "修复" without a code
  # object stays at 0 because TIER would already be Light or Standard-discussion.
  #
  # ASCII verbs use word-boundary matching so `implement` doesn't match
  # `implementation` or `non-implementation`. CJK has no word boundaries, so
  # those phrases fall back to substring matching via the case below.
  if do_it_prompt_has_word "$PROMPT_LC" "implement" \
     || do_it_prompt_has_word "$PROMPT_LC" "bugfix" \
     || do_it_prompt_has_word "$PROMPT_LC" "fix"; then
    DIM_NEEDS_TDD=1
  fi
  case "$PROMPT_LC" in
    *"实现"*|*"添加"*"功能"*|*"新增"*"功能"*|*"new feature"*|\
    *"修复"*"bug"*|*"fix"*"bug"*|*"bug fix"*|\
    *"add feature"*|*"build feature"*)
      DIM_NEEDS_TDD=1 ;;
  esac

  # crosses_packages: count distinct **top-level** path segments mentioned in
  # the raw (case-preserving) prompt. A "top-level segment" is `name/` whose
  # left side is a token boundary (start of the prompt, whitespace, or a
  # backtick) — that excludes inner segments of a deeper path. So
  # `fix src/lib/foo.ts` yields one match (`src/`), not three; while
  # `重写跨 frontend/ backend/` yields two. URLs like `https://x.com/y` only
  # contribute one top-level token (`https:/` is filtered out by the leading
  # alpha-or-underscore class — `https:` has a colon — and the path tail
  # `x.com/` does not have a token-boundary left side because `://` precedes
  # it).
  #
  # We tokenize the prompt by replacing every character that is not
  # alphanumeric, `_`, `.`, `-`, `/`, or a space/backtick with a newline, then
  # split on whitespace. After that, only tokens that look like
  # `<name>/<rest>` count, and we take the first segment as the package id.
  cross_count=0
  if command -v grep >/dev/null 2>&1; then
    # Step 1: drop characters that can't be part of a path token. Keep
    # alpha-num, `_`, `.`, `-`, `/`, and whitespace + backtick as separators.
    # Step 2: turn each whitespace-or-backtick run into a newline so each
    # token sits on its own line.
    # Step 3: keep only tokens that start with [a-zA-Z_], have a `/` somewhere
    # after the head, and capture the head as a top-level package id.
    # Step 4: dedupe + count.
    cross_count=$(
      printf '%s' "$PROMPT" \
        | tr -c '[:alnum:][:space:]/`._-' '\n' \
        | tr '[:space:]`' '\n' \
        | grep -oE '^[a-zA-Z_][a-zA-Z0-9_.-]{0,40}/' 2>/dev/null \
        | head -n 20 \
        | sort -u \
        | wc -l \
        | tr -d ' '
    )
    cross_count="${cross_count:-0}"
  fi
  if [[ "$cross_count" -ge 2 ]]; then
    DIM_CROSSES_PACKAGES=1
  fi

  # needs_review_loop: Heavy auto-true. Standard escalates only when the diff
  # is going to break a published contract.
  if [[ "$TIER" == "Heavy" ]] || [[ "$DIM_BREAKS_INTERFACE" == 1 ]]; then
    DIM_NEEDS_REVIEW_LOOP=1
  fi
fi

do_it_session_state_set_many "$SESSION_ID" \
  dim_touches_code "$DIM_TOUCHES_CODE" \
  dim_crosses_packages "$DIM_CROSSES_PACKAGES" \
  dim_breaks_interface "$DIM_BREAKS_INTERFACE" \
  dim_needs_tdd "$DIM_NEEDS_TDD" \
  dim_needs_review_loop "$DIM_NEEDS_REVIEW_LOOP"

do_it_debug router "tier=$TIER heavy_count=$heavy_count prompt_len=$PROMPT_LEN dims=touch:${DIM_TOUCHES_CODE},pkg:${DIM_CROSSES_PACKAGES},iface:${DIM_BREAKS_INTERFACE},tdd:${DIM_NEEDS_TDD},review:${DIM_NEEDS_REVIEW_LOOP}"

# Router is state-only: it writes tier/dimensions for downstream hooks and
# skills. User-visible pressure-test guidance belongs to grill-prompt.sh, and
# debug traces stay on stderr through do_it_debug.
exit 0
