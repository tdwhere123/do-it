#!/usr/bin/env bash
# do-it router (UserPromptSubmit hook).
# Classifies the prompt as Light / Standard / Heavy and records routing state.
# Standard emits core guidance; architecture-risk Heavy work emits one pointer.
# Pressure-test reminders belong to grill-prompt.sh. Never blocks on its own.

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
PROMPT="$(do_it_json_get_prompt "$RAW_INPUT")"
export DO_IT_SKIP_PROMPT="$PROMPT"
SESSION_ID="$(do_it_json_get "$RAW_INPUT" session_id)"
CWD="$(do_it_json_get "$RAW_INPUT" cwd)"
TRANSCRIPT_PATH="$(do_it_json_get "$RAW_INPUT" transcript_path)"

# Subagent contexts inherit tier from the parent — re-injecting another
# system-reminder just burns tokens, so bail before doing any work.
if do_it_in_subagent_context "$TRANSCRIPT_PATH"; then
  do_it_debug router "decision=subagent-skip"
  exit 0
fi

# thin: skip the lexical classifier. shadow still classifies for diagnostics.
if [[ "$(do_it_router_mode)" == "thin" ]]; then
  do_it_debug router "decision=thin-skip"
  exit 0
fi

do_it_source_local_keywords "$CWD"
# State persistence is best-effort for an advisory hook. A failed write must
# never suppress this turn's guidance: set the flag, keep emitting, and exit 2
# so prompt-submit knows grill (a consumer of the persisted tier) must skip.
_ROUTER_STATE_FAILED=0
do_it_session_state_inc "$SESSION_ID" hook_invocations router || _ROUTER_STATE_FAILED=1
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

# Strong Heavy promotion is pair-shaped: action and consequence surface must
# occur in one clause, at identifier boundaries, within a bounded gap. Split
# action families so generic execution verbs cannot combine with unrelated
# security nouns (for example `run token refresh unit tests`).
do_it_prompt_has_strong_heavy_action() {
  local prompt_lc="$1"
  local release_action='(release|publish|deploy|ship|roll[ -]?out)'
  local release_surface='(production|prod|package|registry|version|v?[0-9]+\.[0-9]+)'
  local migration_action='(apply|execute|run|migrate|cut[ -]?over|cut over|switch|transition)'
  local migration_surface='(migration|cutover|database|traffic|data|writes?)'
  local security_action='(secure|harden|remediate|rotate|revoke|break|deprecate|upgrade)'
  local security_surface='(security|vulnerabilit(y|ies)|credential|secret|token|certificate|breaking|irreversible)'
  local destructive_action='(remove|delete|drop|rename|rewrite)'
  local destructive_surface='(production|prod|package|registry|version|v?[0-9]+\.[0-9]+|migration|database|security|vulnerabilit(y|ies)|credential|secret|token|certificate|breaking|irreversible|deprecated)'
  local boundary_action='(add|change|create|enforce|establish|introduce|move|redesign|remove|replace|split|transition)'
  local boundary_surface='((security|trust|auth|authentication|authorization|permission|tenant)[ -]?boundar(y|ies))'

  _do_it_ascii_arch_pair_near "$prompt_lc" "$release_action" "$release_surface" \
    || _do_it_ascii_arch_pair_near "$prompt_lc" "$migration_action" "$migration_surface" \
    || _do_it_ascii_arch_pair_near "$prompt_lc" "$security_action" "$security_surface" \
    || _do_it_ascii_arch_pair_near "$prompt_lc" "$destructive_action" "$destructive_surface" \
    || _do_it_ascii_arch_pair_near "$prompt_lc" "$boundary_action" "$boundary_surface" \
    || _do_it_prompt_has_cjk_strong_heavy_action "$prompt_lc"
}

# CJK strong actions use explicit collocations rather than arbitrary substring
# pairs. This avoids promoting words such as 部署署名 or 包袱 while retaining
# direct release, cutover, credential, destructive, and boundary operations.
_do_it_prompt_has_cjk_strong_heavy_action() {
  local prompt_lc="$1" clause
  local cjk_pair='(发布|上线|部署)(到|至|进入).{0,24}(生产|仓库)|(发布|上线).{0,24}(版本|软件包)|(执行|应用|运行).{0,12}(数据库|数据|流量|读写).{0,8}(迁移|割接|切换)(任务|作业|方案|计划)?([前后中]|并|$)|(迁移|切换|割接)(生产|线上|主|从)?(数据库|数据|流量|读写)|(数据库|数据|流量|读写)(迁移|切换|割接)(任务|作业|方案|计划)?([前后中]|并|$)|(加固|修复安全).{0,24}(安全|漏洞|凭据|密钥|令牌|证书)|(轮换|吊销).{0,24}(凭据|密钥|令牌|证书)|(删除|移除|重命名|重写).{0,24}(生产|仓库|版本|迁移|数据库|安全|漏洞|凭据|密钥|令牌|证书|不可逆|弃用)|(新增|建立|引入|变更|强化|移动|重构|移除|替换|拆分).{0,24}(安全边界|信任边界|认证边界|授权边界|权限边界|租户边界)'
  while IFS= read -r clause || [[ -n "$clause" ]]; do
    if printf '%s' "$clause" | grep -E "$cjk_pair" >/dev/null 2>&1; then
      return 0
    fi
  done < <(_do_it_split_prompt_clauses "$prompt_lc")
  return 1
}

_do_it_prompt_is_cjk_migration_test_context() {
  case "$1" in
    *"迁移工具"*|*"迁移测试"*|*"迁移单元测试"*) return 0 ;;
  esac
  return 1
}

# Normalize supported clause delimiters once so strong-Heavy and architecture
# matching share the same bounded grammar. Commas, colons, parentheses, and
# dashes separate clauses; terms on opposite sides must never form a pair.
_do_it_split_prompt_clauses() {
  local prompt="$1"
  prompt="${prompt//$'\r'/$'\n'}"
  printf '%s' "$prompt" \
    | tr '.!?;,:()[]{}' '\n' \
    | sed 's/[—–]/\
/g; s/[。！？；，：、（）【】「」]/\
/g; s/[[:space:]]--[[:space:]]/\
/g'
}

# Match two ASCII architecture terms in either order within one clause and at
# most six intervening tokens. Explicit edges prevent `api` matching `rapid`.
_do_it_ascii_arch_pair_near() {
  local prompt_lc="$1" action="$2" surface="$3" clause
  local gap='([^[:alnum:]_]+[[:alnum:]_]+){0,6}[^[:alnum:]_]+'
  while IFS= read -r clause || [[ -n "$clause" ]]; do
    if printf '%s' "$clause" | LC_ALL=C grep -iE \
      "(^|[^[:alnum:]_])${action}${gap}${surface}([^[:alnum:]_]|$)|(^|[^[:alnum:]_])${surface}${gap}${action}([^[:alnum:]_]|$)" \
      >/dev/null 2>&1; then
      return 0
    fi
  done < <(_do_it_split_prompt_clauses "$prompt_lc")
  return 1
}

# CJK has no word boundaries. Keep its patterns explicit, clause-local, and
# bounded by characters rather than borrowing the ASCII token matcher.
_do_it_cjk_arch_pair_near() {
  local prompt_lc="$1" action="$2" surface="$3" clause
  while IFS= read -r clause || [[ -n "$clause" ]]; do
    if printf '%s' "$clause" | grep -E \
      "${action}.{0,64}${surface}|${surface}.{0,64}${action}" >/dev/null 2>&1; then
      return 0
    fi
  done < <(_do_it_split_prompt_clauses "$prompt_lc")
  return 1
}

# Mixed CJK/ASCII phrases remain explicit. The ASCII side still has identifier
# edges, so a CJK action beside `rapid` cannot be mistaken for `api`.
_do_it_mixed_arch_pair_near() {
  local prompt_lc="$1" cjk="$2" ascii="$3" clause
  while IFS= read -r clause || [[ -n "$clause" ]]; do
    if printf '%s' "$clause" | LC_ALL=C grep -E \
      "${cjk}${ascii}([^[:alnum:]_]|$)|${cjk}.{0,63}[^[:alnum:]_]${ascii}([^[:alnum:]_]|$)|(^|[^[:alnum:]_])${ascii}([^[:alnum:]_].{0,63})?${cjk}" \
      >/dev/null 2>&1; then
      return 0
    fi
  done < <(_do_it_split_prompt_clauses "$prompt_lc")
  return 1
}

# Architecture guidance is reserved for action-shaped boundary work. Keep this
# separate from DIM_BREAKS_INTERFACE: that dimension describes review intensity,
# while this signal decides whether a Heavy turn needs the architecture skill.
do_it_prompt_has_architecture_risk() {
  local prompt_lc="$1"
  local interface_action_ascii='(add|alter|break|change|create|deprecate|drop|establish|introduce|migrate|remove|rename|replace|rewrite)'
  local interface_surface_ascii='(api|endpoint|interface|contract|schema|table|column|field)'
  local interface_action_cjk='(新增|建立|引入|修改|变更|破坏|弃用|删除|迁移|移除|重命名|替换|重写)'
  local interface_surface_cjk='(接口|契约|字段|数据表)'
  local migration_action_ascii='(apply|execute|migrate|run|cut[ -]?over|cut over|switch|transition)'
  local migration_surface_ascii='(migration|database|schema|cutover|traffic|data|writes?)'
  local migration_action_cjk='(执行|应用|迁移|运行|切换|割接)'
  local migration_surface_cjk='(迁移|数据库|数据|流量|读写)'
  local security_action_ascii='(add|change|create|enforce|establish|harden|introduce|move|redesign|remove|replace|secure|split)'
  local security_boundary_ascii='((security|trust|auth|authentication|authorization|permission|tenant)[ -]?boundar(y|ies))'
  local security_action_cjk='(新增|建立|引入|修改|变更|加固|强化|移动|重构|移除|替换|拆分)'
  local security_boundary_cjk='(安全边界|信任边界|认证边界|授权边界|权限边界|租户边界)'

  _do_it_ascii_arch_pair_near "$prompt_lc" "$interface_action_ascii" "$interface_surface_ascii" \
    || _do_it_cjk_arch_pair_near "$prompt_lc" "$interface_action_cjk" "$interface_surface_cjk" \
    || _do_it_mixed_arch_pair_near "$prompt_lc" "$interface_action_cjk" "$interface_surface_ascii" \
    || _do_it_mixed_arch_pair_near "$prompt_lc" "$interface_surface_cjk" "$interface_action_ascii" \
    || _do_it_ascii_arch_pair_near "$prompt_lc" "$migration_action_ascii" "$migration_surface_ascii" \
    || _do_it_cjk_arch_pair_near "$prompt_lc" "$migration_action_cjk" "$migration_surface_cjk" \
    || _do_it_mixed_arch_pair_near "$prompt_lc" "$migration_action_cjk" "$migration_surface_ascii" \
    || _do_it_mixed_arch_pair_near "$prompt_lc" "$migration_surface_cjk" "$migration_action_ascii" \
    || _do_it_ascii_arch_pair_near "$prompt_lc" "$security_action_ascii" "$security_boundary_ascii" \
    || _do_it_cjk_arch_pair_near "$prompt_lc" "$security_action_cjk" "$security_boundary_cjk" \
    || _do_it_mixed_arch_pair_near "$prompt_lc" "$security_action_cjk" "$security_boundary_ascii" \
    || _do_it_mixed_arch_pair_near "$prompt_lc" "$security_boundary_cjk" "$security_action_ascii"
}

# Detect explanatory phrasing before treating a question-shaped prompt as a
# task. A later direct delegation clause can still override this classification.
do_it_prompt_is_explanatory_question() {
  local prompt_lc
  prompt_lc="$(do_it_lc "$1")"
  # Reuse the data-driven question vocabulary so router behavior cannot drift
  # from `question-hints.tsv`; punctuation alone remains insufficient because
  # a direct request may legitimately end in a question mark.
  if do_it_prompt_has_any "$prompt_lc" DO_IT_QUESTION_HINTS; then
    return 0
  fi
  case "$prompt_lc" in
    *"explain"*|*"how to "*|*"解释"*|*"介绍"*|*"说明"*|*"告诉我"*)
      return 0
      ;;
  esac
  return 1
}

# Question wording alone is not a task, but direct-request forms such as
# "Can you deploy…?" or "请迁移…？" are. Keep this narrow so explanatory
# questions such as "how do migrations work?" remain informational.
do_it_prompt_is_direct_request_question() {
  local prompt_lc
  prompt_lc="$(do_it_lc "$1")"
  if do_it_prompt_is_explanatory_question "$prompt_lc"; then
    return 1
  fi
  case "$prompt_lc" in
    can\ you\ *|could\ you\ *|would\ you\ *|will\ you\ *|please\ *|\
    "请"*|"帮我"*|"麻烦"*|"能否"*|"是否可以"*|"可以"*|"你能"*|"你可以"*)
      return 0
      ;;
  esac
  return 1
}

# A question can still explicitly ask the parent to use child agents. Treat
# that as work rather than letting a conversational word such as "为什么" erase
# the user's requested action. This is deliberately a narrow, two-part signal:
# an orchestration verb plus a generic, child, or bundled-agent target. Naming
# agents alone remains a normal low-noise question.
do_it_prompt_has_explicit_delegation_intent() {
  local prompt_lc
  prompt_lc="$(do_it_lc "$1")"
  local orchestration='(并行|编排|委派|派遣|调用|调度|交给|交由|parallel(ize|ise|ized|ised|ing)?|delegate|delegation|dispatch|orchestrat(e|ion|ing)|spawn)'
  local agent_target='(子智能体|子代理|sub[ -]?agents?|child[ -]?agents?|multi[ -]?agents?|智能体|代理|agents?|architecture-strategist|code-mapper|code-quality-cleaner|documentation-engineer|plan-challenger|product-strategist|red-team-reviewer|reviewer|spec-compliance-reviewer|tdd-red-writer)'
  printf '%s' "$prompt_lc" | grep -qiE "${orchestration}.*${agent_target}|${agent_target}.*${orchestration}"
}

# An explanation may contain a genuine second imperative clause (for example,
# "why is auth failing? Please fix src/auth.ts"). Preserve discussion-only
# questions, but let a clearly separated direct request win over the opener.
do_it_prompt_has_direct_code_request_clause() {
  local prompt="$1" prompt_lc
  do_it_prompt_has_any "$prompt" DO_IT_INTENT_VERBS || return 1
  do_it_prompt_has_code_object "$prompt" || return 1
  prompt_lc="$(do_it_lc "$prompt")"
  case "$prompt_lc" in
    *"；请"*|*"；帮我"*|*"；麻烦"*|*"；修复"*|*"；实现"*|*"；修改"*|\
    *"？请"*|*"? please "*|*"? can you "*|*"? could you "*|\
    *"; please "*|*"; can you "*|*"; could you "*|\
    *"; fix "*|*"; implement "*|*"; refactor "*|*"; rewrite "*)
      return 0
      ;;
  esac
  return 1
}

# Escape / skip keywords: write only the parsed skip targets for this turn.
targets="$(do_it_parse_skip_targets "$PROMPT")"
if [[ -n "$targets" ]]; then
  do_it_debug router "decision=escape session=$SESSION_ID targets=$targets"
  # shellcheck disable=SC2086
  if ! do_it_write_skip "$SESSION_ID" $targets; then
    printf 'do-it: skip marker persistence unavailable; honoring only the current router turn\n' >&2
  fi
  # Partial skip (e.g. gate only) must still refresh tier/dim_* for this turn.
  case " $targets " in
    *" router "*) exit 0 ;;
  esac
fi

# Honor pre-existing skip flag.
if do_it_check_skip "$SESSION_ID" router; then
  do_it_debug router "decision=skip-flag session=$SESSION_ID"
  exit 0
fi

PROMPT_LEN=${#PROMPT}
TIER=""
QUESTION_LIKE=0
EXPLICIT_TASK_INTENT=0
PROMPT_LC="$(do_it_lc "$PROMPT")"
strong_heavy_action=0
cjk_migration_test_context=0
if _do_it_prompt_is_cjk_migration_test_context "$PROMPT_LC"; then
  cjk_migration_test_context=1
fi

if do_it_prompt_is_question "$PROMPT"; then
  QUESTION_LIKE=1
fi
if do_it_prompt_has_explicit_delegation_intent "$PROMPT"; then
  EXPLICIT_TASK_INTENT=1
elif do_it_prompt_has_strong_heavy_action "$PROMPT_LC" \
     && { [[ "$QUESTION_LIKE" == "0" ]] || do_it_prompt_is_direct_request_question "$PROMPT"; }; then
  # High-consequence actions remain work even when phrased as a question. A
  # question mark changes tone, not the user's request to deploy/migrate/etc.
  EXPLICIT_TASK_INTENT=1
  strong_heavy_action=1
elif do_it_prompt_has_any "$PROMPT" DO_IT_INTENT_VERBS \
     && do_it_prompt_has_code_object "$PROMPT" \
     && { ! do_it_prompt_is_explanatory_question "$PROMPT" \
          || do_it_prompt_has_direct_code_request_clause "$PROMPT"; }; then
  # A concrete edit / investigation request remains work even if written as a
  # question. Direct intent takes precedence over a "why" / explanation cue;
  # the router must not turn a requested repair into a discussion-only turn.
  EXPLICIT_TASK_INTENT=1
fi

# Save the user action boundary before downstream hooks consume the state. A
# fresh no-write request wins over any conflicting mutation word in the same
# prompt. Once active, only an explicit reopening can clear the boundary.
NO_WRITE_BOUNDARY="$(do_it_session_state_get "$SESSION_ID" no_write_boundary)"
[[ "$NO_WRITE_BOUNDARY" == "1" ]] || NO_WRITE_BOUNDARY=0
if do_it_prompt_requests_no_write "$PROMPT"; then
  NO_WRITE_BOUNDARY=1
elif do_it_prompt_reopens_writes "$PROMPT"; then
  NO_WRITE_BOUNDARY=0
fi
do_it_session_state_set "$SESSION_ID" no_write_boundary "$NO_WRITE_BOUNDARY" || _ROUTER_STATE_FAILED=1

# Question-shaped prompts stay quiet only when they contain no concrete task
# request. This preserves low-noise discussion behavior without making
# question words a hard ceiling over direct intent or high-consequence action.
if [[ "$QUESTION_LIKE" == "1" && "$EXPLICIT_TASK_INTENT" == "0" ]]; then
  TIER="Light"
  do_it_session_state_set "$SESSION_ID" last_prompt_kind "question" || _ROUTER_STATE_FAILED=1
  do_it_debug router "question=true task_intent=false tier=Light"
else
  do_it_session_state_set "$SESSION_ID" last_prompt_kind "work" || _ROUTER_STATE_FAILED=1
  do_it_user_turn_bump "$SESSION_ID" || _ROUTER_STATE_FAILED=1
  if [[ "$(do_it_session_state_get "$SESSION_ID" grilled)" == "skip-question" ]]; then
    do_it_session_state_set "$SESSION_ID" grilled "0" || _ROUTER_STATE_FAILED=1
  fi
fi

# Heavy upgrade uses either one explicit high-consequence action or ≥2 topical
# signals. This keeps casual mentions Standard while routing actual release,
# migration, security, breaking, and irreversible work to Heavy.
heavy_count=0
if [[ -z "$TIER" ]]; then
  for signal in "${DO_IT_HEAVY_SIGNALS[@]}"; do
    [[ -z "$signal" ]] && continue
    if [[ "$cjk_migration_test_context" -eq 1 && ( "$signal" == "迁移" || "$signal" == "数据库" ) ]]; then
      continue
    fi
    sig_lc="$(do_it_lc "$signal")"
    if _do_it_term_is_ascii "$sig_lc"; then
      do_it_prompt_has_word "$PROMPT_LC" "$sig_lc" && heavy_count=$((heavy_count + 1))
    else
      [[ "$PROMPT_LC" == *"$sig_lc"* ]] && heavy_count=$((heavy_count + 1))
    fi
    [[ "$heavy_count" -ge 2 ]] && break
  done
  if do_it_prompt_has_strong_heavy_action "$PROMPT_LC"; then
    strong_heavy_action=1
  fi
fi

if [[ -z "$TIER" ]]; then
  if [[ "$strong_heavy_action" -eq 1 || "$heavy_count" -ge 2 ]]; then
    TIER="Heavy"
  elif [[ "$EXPLICIT_TASK_INTENT" == "1" ]]; then
    # A concrete task stays work even when phrased as a question. Explicit
    # delegation is permission for the model to choose useful child work, not
    # an instruction to follow a fixed multi-agent pipeline.
    TIER="Standard"
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

do_it_session_state_set "$SESSION_ID" tier "$TIER" || _ROUTER_STATE_FAILED=1
do_it_session_state_inc "$SESSION_ID" tier_history "$TIER" || _ROUTER_STATE_FAILED=1

durable_plan_required=0
if [[ "$TIER" == "Heavy" ]] || do_it_prompt_requires_durable_plan "$PROMPT"; then
  durable_plan_required=1
fi
do_it_session_state_set "$SESSION_ID" durable_plan_required "$durable_plan_required" || _ROUTER_STATE_FAILED=1
# Sticky: once durable planning is required in a session, remember it so the
# post-grill plan-card nudge can fire on a later turn even after the per-turn
# durable_plan_required is recomputed to 0 by a follow-up prompt.
if [[ "$durable_plan_required" == "1" ]]; then
  do_it_session_state_set "$SESSION_ID" durable_plan_seen 1 || _ROUTER_STATE_FAILED=1
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
do_it_session_state_set "$SESSION_ID" dim_brownfield "$brownfield" || _ROUTER_STATE_FAILED=1
port_intent=0
case "$(do_it_lc "$PROMPT")" in
  *"移植"*|*"迁移回"*|*"重新引入"*|*"恢复历史"*|*"恢复旧"*|*"恢复以前"*|*"reintroduce"*|*"re-introduce"*|*"port from"*|*"port over"*|*"port the"*|*"restore legacy"*|*"restore the old"*|*"bring back the"*)
    port_intent=1 ;;
esac
do_it_session_state_set "$SESSION_ID" port_intent "$port_intent" || _ROUTER_STATE_FAILED=1

# Dimensions are orthogonal to tier. Tier stays as the single derived label
# existing skills key off; downstream skills may read these additive booleans
# when choosing TDD, review, or interface intensity. Light skips dimension
# evaluation because discussion and mechanical turns do not benefit from it.
# Always write all five dim_* keys every turn (Light → all 0) so a prior Heavy
# turn cannot leave stale dimension flags in session state.
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
  dim_needs_review_loop "$DIM_NEEDS_REVIEW_LOOP" || _ROUTER_STATE_FAILED=1

ARCHITECTURE_RISK=0
if do_it_prompt_has_architecture_risk "$PROMPT_LC"; then
  ARCHITECTURE_RISK=1
fi
do_it_debug router "tier=$TIER question=$QUESTION_LIKE task_intent=$EXPLICIT_TASK_INTENT no_write=$NO_WRITE_BOUNDARY heavy_count=$heavy_count strong_action=$strong_heavy_action architecture_risk=$ARCHITECTURE_RISK prompt_len=$PROMPT_LEN dims=touch:${DIM_TOUCHES_CODE},pkg:${DIM_CROSSES_PACKAGES},iface:${DIM_BREAKS_INTERFACE},tdd:${DIM_NEEDS_TDD},review:${DIM_NEEDS_REVIEW_LOOP}"

# Emission (model-adaptive single voice). Rule sentences are quoted verbatim
# from hooks/data/execution-failure-modes.tsv via the do_it_core_rule helpers;
# the only literal texts here are the tier prefix, the no-write boundary
# sentence, the Standard pointer, and the architecture pointer.
#
#  - no-write boundary: boundary sentence + the r-boundary rule (any mode);
#  - Heavy + action-shaped architecture risk: one architecture pointer for
#    interface/schema mutation, migration/cutover execution, or security-boundary
#    change. Informational questions remain Light, and ordinary Heavy release or
#    publish operations stay silent;
#  - Standard: inline rule sentences (weak/unknown models) or one do-it-core
#    pointer (strong models). Light and other Heavy work stay silent.
# shadow: persist diagnostics only — never put classifier text in model context.
if [[ "$(do_it_router_mode)" == "shadow" ]]; then
  do_it_debug router "decision=shadow-no-emit tier=$TIER no_write=$NO_WRITE_BOUNDARY"
  [[ "$_ROUTER_STATE_FAILED" == "0" ]] || exit 2
  exit 0
fi

ADVISORY_MODE="$(do_it_advisory_mode "$RAW_INPUT")"
if [[ "$NO_WRITE_BOUNDARY" == "1" ]]; then
  if CORE_RULE_TEXT="$(do_it_core_rule r-boundary)"; then
    do_it_emit_context UserPromptSubmit \
      "do-it tier: ${TIER}. honor the user's action boundary: a no-write boundary is active for this session. Inspect, diagnose, plan, or review only; do not edit files, run change-producing commands, or delegate implementation until the user explicitly reopens it."$'\n'"$CORE_RULE_TEXT"
  else
    do_it_emit_context UserPromptSubmit \
      "do-it core registry unavailable or invalid; canonical boundary guidance was not loaded. Read skill://do-it-core before acting."
  fi
elif [[ "$TIER" == "Heavy" && "$ARCHITECTURE_RISK" == "1" ]]; then
  do_it_emit_context UserPromptSubmit \
    "do-it architecture: this work crosses a boundary (interface, migration, or security). Read skill://do-it-architecture before editing."
elif [[ "$TIER" == "Standard" ]]; then
  if [[ "$ADVISORY_MODE" == "pointer" ]]; then
    do_it_emit_context UserPromptSubmit \
      "do-it tier: Standard. Read skill://do-it-core — evidence, scope, verify, and report rules apply this turn."
  else
    if CORE_RULE_TEXT="$(do_it_core_rules_for UserPromptSubmit)"; then
      do_it_emit_context UserPromptSubmit \
        "do-it tier: Standard."$'\n'"$CORE_RULE_TEXT"
    else
      do_it_emit_context UserPromptSubmit \
        "do-it core registry unavailable or invalid; canonical inline guidance was not loaded. Read skill://do-it-core before acting."
    fi
  fi
fi
# Persistence failure is reported to prompt-submit (exit 2) so grill skips;
# the guidance above was still emitted. Standalone invocations treat 2 as 0.
[[ "$_ROUTER_STATE_FAILED" == "0" ]] || exit 2
exit 0
