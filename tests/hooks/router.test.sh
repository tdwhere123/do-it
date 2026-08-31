#!/usr/bin/env bash
# Smoke tests for hooks/router.sh — locks in routing invariants:
#   - Light stays silent; Standard emits core guidance
#   - architecture-risk Heavy work emits one architecture pointer; other Heavy stays silent
#   - Standard requires intent-verb + code-object combo
#   - Heavy requires >=2 topical signals or one strong action signal
#   - subagent context (transcript_path with /agents/) suppresses output
#   - escape words trigger pass-through skip flags
#   - SESSION_ID path-injection is sanitized
#   - DEBUG mode stays stderr-only via do_it_debug and does not emit context
#   - 5 dimension flags are written in a single batched state-set
#
# Usage: bash tests/hooks/router.test.sh
# Exits non-zero on first failure; prints "ok: <N> tests" on success.

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ROUTER="$REPO_ROOT/hooks/router.sh"
COMMON="$REPO_ROOT/hooks/lib/common.sh"

if [[ ! -x "$ROUTER" ]]; then
  echo "FAIL: router.sh not executable at $ROUTER" >&2
  exit 1
fi

PASS=0
FAIL=0

_pass() { echo "  ok: $1"; PASS=$((PASS + 1)); }
_fail() { echo "  FAIL: $1" >&2; FAIL=$((FAIL + 1)); }

_run_router() {
  # args: prompt session_id [extra-json-fields]
  local prompt="$1" sid="$2" extra="${3:-}"
  local payload
  if [[ -n "$extra" ]]; then
    payload=$(jq -nc --arg p "$prompt" --arg s "$sid" \
      "{prompt: \$p, session_id: \$s, cwd: \"/tmp\"} + ${extra}")
  else
    payload=$(jq -nc --arg p "$prompt" --arg s "$sid" \
      '{prompt: $p, session_id: $s, cwd: "/tmp"}')
  fi
  printf '%s' "$payload" | bash "$ROUTER"
}

_isolate_state() {
  export DO_IT_HOOK_DATA="$1"
  rm -rf "$DO_IT_HOOK_DATA"
  unset CLAUDE_PLUGIN_DATA CODEX_HOME KIMI_CODE_HOME KIMI_PLUGIN_ROOT CLAUDE_AGENT_CONTEXT CLAUDE_SUBAGENT
  unset DO_IT_DEBUG
}

_state_for() {
  # echo path to state.json for given session_id
  printf '%s/sessions/%s/state.json' "$DO_IT_HOOK_DATA" "$1"
}

_has_skip() {
  local dir="$1" flag="$2" path
  for path in "$dir/skip-$flag" "$dir/skip-$flag-"*; do
    [[ -f "$path" ]] && return 0
  done
  return 1
}

# -------------------------------------------------------------------------
echo "Case 1: question prompt → Light tier silent"
(
  _isolate_state "/tmp/doit-test-router-c1"
  out=$(_run_router "你觉得这个怎么样？" "c1-1")
  case "$out" in
    "") exit 0 ;;
    *)  printf 'unexpected output: %s\n' "$out" >&2; exit 11 ;;
  esac
)
case "$?" in
  0)  _pass "question prompt produces no system-reminder" ;;
  11) _fail "Light tier emitted output" ;;
  *)  _fail "unexpected exit $?" ;;
esac

# -------------------------------------------------------------------------
echo "Case 1b: question wording + explicit child-agent delegation → Standard"
(
  _isolate_state "/tmp/doit-test-router-c1b"
  prompt="为什么我体感上，好像不怎么调用我预先设计好的子智能体？另外排查一下，并行编排子智能体去推进；先不改代码。"
  out=$(_run_router "$prompt" "c1b-1")
  [[ "$out" == *'do-it tier: Standard.'* ]] || { printf 'missing Standard context: %s\n' "$out" >&2; exit 11; }
  state="$(_state_for c1b-1)"
  [[ "$(jq -r '.tier' "$state")" == "Standard" ]] || { cat "$state" >&2; exit 12; }
  [[ "$(jq -r '.last_prompt_kind' "$state")" == "work" ]] || { cat "$state" >&2; exit 13; }
)
case "$?" in
  0)  _pass "explicit child-agent delegation overrides question-shaped Light cap" ;;
  11) _fail "explicit delegation emitted no Standard context" ;;
  12) _fail "explicit delegation did not route Standard" ;;
  13) _fail "explicit delegation remained a question turn" ;;
  *)  _fail "question + delegation routing failed (exit $?)" ;;
esac

# -------------------------------------------------------------------------
echo "Case 1c: generic and named agent commands remain work"
(
  _isolate_state "/tmp/doit-test-router-c1c"
  out=$(_run_router "Please dispatch agents to inspect this?" "c1c-generic")
  [[ "$out" == *'do-it tier: Standard.'* ]] || exit 11
  [[ "$(jq -r '.tier' "$(_state_for c1c-generic)")" == "Standard" ]] || exit 12
  [[ "$(jq -r '.last_prompt_kind' "$(_state_for c1c-generic)")" == "work" ]] || exit 13
  out=$(_run_router "请调用 reviewer 审查当前 diff？" "c1c-named")
  [[ "$out" == *'do-it tier: Standard.'* ]] || exit 14
  [[ "$(jq -r '.tier' "$(_state_for c1c-named)")" == "Standard" ]] || exit 15
  [[ "$(jq -r '.last_prompt_kind' "$(_state_for c1c-named)")" == "work" ]] || exit 16
)
case "$?" in
  0)  _pass "generic and named agent commands override question-shaped Light cap" ;;
  11) _fail "generic agent command emitted no Standard context" ;;
  12) _fail "generic agent command did not route Standard" ;;
  13) _fail "generic agent command remained a question turn" ;;
  14) _fail "named agent command emitted no Standard context" ;;
  15) _fail "named agent command did not route Standard" ;;
  16) _fail "named agent command remained a question turn" ;;
  *)  _fail "generic/named agent routing failed (exit $?)" ;;
esac

# -------------------------------------------------------------------------
echo "Case 2: bare intent verb without code object → Light fallback (silent)"
(
  _isolate_state "/tmp/doit-test-router-c2"
  out=$(_run_router "修改配置" "c2-1")
  case "$out" in
    "") exit 0 ;;
    *)  printf 'unexpected: %s\n' "$out" >&2; exit 11 ;;
  esac
)
case "$?" in
  0)  _pass "single intent-verb without code object stays Light" ;;
  *)  _fail "single verb changed routing/output unexpectedly" ;;
esac

# -------------------------------------------------------------------------
echo "Case 3: intent verb + code object → Standard state and inline core rules"
(
  _isolate_state "/tmp/doit-test-router-c3"
  out=$(_run_router "实现 src/auth.ts 的登录" "c3-1")
  [[ "$out" == *'"hookEventName":"UserPromptSubmit"'* ]] || { printf 'missing context: %s\n' "$out" >&2; exit 11; }
  [[ "$out" == *'do-it tier: Standard.'* ]] || exit 12
  [[ "$out" != *'do-it-code-quality'* && "$out" != *'do-it-verify'* ]] || exit 13
  # Auto mode with no model env defaults to inline: the r-evidence rule sentence
  # is emitted, and no skill pointer.
  [[ "$out" == *'Work from current repository and runtime evidence'* ]] || exit 16
  [[ "$out" != *'Read skill://do-it-core'* ]] || exit 15
  state="$(_state_for c3-1)"
  [[ "$(jq -r '.tier' "$state")" == "Standard" ]] || { cat "$state" >&2; exit 14; }
)
case "$?" in
  0)  _pass "Standard emits inline core rules (auto → inline)" ;;
  11) _fail "Standard emitted no additionalContext" ;;
  12) _fail "Standard context omitted tier" ;;
  13) _fail "Standard context restored a skill chain" ;;
  16) _fail "Standard inline context omitted the r-evidence rule" ;;
  15) _fail "Standard inline context leaked the skill pointer" ;;
  *)  _fail "Standard state missing" ;;
esac

# -------------------------------------------------------------------------
echo "Case 3b: review and plan requests preserve their no-edit boundary"
(
  _isolate_state "/tmp/doit-test-router-c3b"
  out=$(_run_router "Review the current API diff; do not edit." "c3b-review")
  [[ "$out" == *"honor the user's action boundary"* ]] || exit 11
  [[ "$out" != *"make the smallest coherent change"* ]] || exit 12
  [[ "$(jq -r '.tier' "$(_state_for c3b-review)")" == "Standard" ]] || exit 13
  out=$(_run_router "Plan the API migration; do not implement." "c3b-plan")
  [[ "$out" == *"honor the user's action boundary"* ]] || exit 14
  [[ "$out" != *"make the smallest coherent change"* ]] || exit 15
  [[ "$(jq -r '.tier' "$(_state_for c3b-plan)")" == "Standard" ]] || exit 16
)
case "$?" in
  0)  _pass "Standard reminder preserves review and plan no-edit boundaries" ;;
  11) _fail "review-only task omitted action boundary" ;;
  12) _fail "review-only task received an edit instruction" ;;
  13) _fail "review-only task did not route Standard" ;;
  14) _fail "plan-only task omitted action boundary" ;;
  15) _fail "plan-only task received an edit instruction" ;;
  16) _fail "plan-only task did not route Standard" ;;
  *)  _fail "review/plan action-boundary regression" ;;
esac

# -------------------------------------------------------------------------
echo "Case 3c: why wording does not erase a direct repair request"
(
  _isolate_state "/tmp/doit-test-router-c3c"
  out=$(_run_router "为什么认证重试失败；请修复 src/auth.ts。" "c3c-why-fix")
  [[ "$out" == *'do-it tier: Standard.'* ]] || { printf 'missing Standard context: %s\n' "$out" >&2; exit 11; }
  state="$(_state_for c3c-why-fix)"
  [[ "$(jq -r '.tier' "$state")" == "Standard" ]] || { cat "$state" >&2; exit 12; }
  [[ "$(jq -r '.last_prompt_kind' "$state")" == "work" ]] || { cat "$state" >&2; exit 13; }
  out=$(_run_router "Why is auth retry failing? Please fix src/auth.ts." "c3c-why-fix-en")
  [[ "$out" == *'do-it tier: Standard.'* ]] || { printf 'missing English Standard context: %s\n' "$out" >&2; exit 14; }
  state="$(_state_for c3c-why-fix-en)"
  [[ "$(jq -r '.tier' "$state")" == "Standard" ]] || { cat "$state" >&2; exit 15; }
)
case "$?" in
  0)  _pass "direct repair intent overrides why/explanation wording" ;;
  11) _fail "why + repair request emitted no Standard context" ;;
  12) _fail "why + repair request did not route Standard" ;;
  13) _fail "why + repair request remained a question turn" ;;
  14) _fail "English why + repair request emitted no Standard context" ;;
  15) _fail "English why + repair request did not route Standard" ;;
  *)  _fail "why + repair routing regression" ;;
esac

# -------------------------------------------------------------------------
echo "Case 4: >=2 heavy signals → Heavy state, architecture pointer on interface work"
(
  _isolate_state "/tmp/doit-test-router-c4"
  out=$(_run_router "重写 schema 涉及 breaking change 跨 frontend/ backend/" "c4-1")
  [[ "$out" == *'skill://do-it-architecture'* ]] || { printf 'missing architecture pointer: %s\n' "$out" >&2; exit 11; }
  state="$(_state_for c4-1)"
  [[ "$(jq -r '.tier' "$state")" == "Heavy" ]] || { cat "$state" >&2; exit 12; }
)
case "$?" in
  0)  _pass "Heavy interface signals resolve Heavy and emit architecture pointer" ;;
  11) _fail "Heavy interface work emitted no architecture pointer" ;;
  *)  _fail "Heavy state missing" ;;
esac

# -------------------------------------------------------------------------
echo "Case 4b: one strong action signal upgrades while explanation stays Light"
(
  _isolate_state "/tmp/doit-test-router-c4b"
  out=$(_run_router "publish the release to production" "c4b-action")
  [[ -z "$out" ]] || exit 11
  [[ "$(jq -r '.tier' "$(_state_for c4b-action)")" == "Heavy" ]] || exit 12
  out=$(_run_router "what is the release process?" "c4b-question")
  [[ -z "$out" ]] || exit 13
  [[ "$(jq -r '.tier' "$(_state_for c4b-question)")" == "Light" ]] || exit 14
  out=$(_run_router "Can you publish the release to production?" "c4b-question-action")
  [[ -z "$out" ]] || exit 15
  [[ "$(jq -r '.tier' "$(_state_for c4b-question-action)")" == "Heavy" ]] || exit 16
  [[ "$(jq -r '.last_prompt_kind' "$(_state_for c4b-question-action)")" == "work" ]] || exit 17
  out=$(_run_router "how do database migrations work?" "c4b-explanation-action")
  [[ -z "$out" ]] || exit 18
  [[ "$(jq -r '.tier' "$(_state_for c4b-explanation-action)")" == "Light" ]] || exit 19
  [[ "$(jq -r '.last_prompt_kind' "$(_state_for c4b-explanation-action)")" == "question" ]] || exit 20
  out=$(_run_router "Can you explain how database migrations work?" "c4b-addressed-explanation")
  [[ -z "$out" ]] || exit 21
  [[ "$(jq -r '.tier' "$(_state_for c4b-addressed-explanation)")" == "Light" ]] || exit 22
  out=$(_run_router "可以解释一下数据库迁移吗？" "c4b-chinese-explanation")
  [[ -z "$out" ]] || exit 23
  [[ "$(jq -r '.tier' "$(_state_for c4b-chinese-explanation)")" == "Light" ]] || exit 24
  out=$(_run_router "请告诉我如何迁移数据库？" "c4b-chinese-how-to")
  [[ -z "$out" ]] || exit 25
  [[ "$(jq -r '.tier' "$(_state_for c4b-chinese-how-to)")" == "Light" ]] || exit 26
)
case "$?" in
  0)  _pass "release action is Heavy; explanation stays Light; action question remains work" ;;
  11) _fail "strong Heavy action emitted context" ;;
  12) _fail "release action did not route Heavy" ;;
  13) _fail "explanation question emitted context" ;;
  14) _fail "explanation question did not stay Light" ;;
  15) _fail "high-consequence action question emitted context" ;;
  16) _fail "high-consequence action question did not route Heavy" ;;
  17) _fail "high-consequence action question remained a question turn" ;;
  18) _fail "migration explanation question emitted context" ;;
  19) _fail "migration explanation question did not stay Light" ;;
  20) _fail "migration explanation question did not stay a question turn" ;;
  21) _fail "addressed migration explanation emitted context" ;;
  22) _fail "addressed migration explanation did not stay Light" ;;
  23) _fail "Chinese migration explanation emitted context" ;;
  24) _fail "Chinese migration explanation did not stay Light" ;;
  25) _fail "Chinese migration how-to emitted context" ;;
  26) _fail "Chinese migration how-to did not stay Light" ;;
  *)  _fail "strong-action routing crashed" ;;
esac

# -------------------------------------------------------------------------

echo "Case 4c: local api/schema helper stays Standard; breaking API change gets architecture guidance"
(
  _isolate_state "/tmp/doit-test-router-c4c"
  out=$(_run_router "remove unused api helper from schema.ts" "c4c-remove")
  [[ "$out" == *'do-it tier: Standard.'* ]] || exit 11
  [[ "$(jq -r '.tier' "$(_state_for c4c-remove)")" == "Standard" ]] || exit 12
  out=$(_run_router "remove the deprecated API even though it is breaking" "c4c-depr")
  [[ "$out" == *'skill://do-it-architecture'* ]] || exit 13
  [[ "$(jq -r '.tier' "$(_state_for c4c-depr)")" == "Heavy" ]] || exit 14
)
case "$?" in
  0)  _pass "local api/schema helper is Standard; breaking API change is Heavy with architecture guidance" ;;
  11) _fail "remove unused api helper missing Standard context" ;;
  12) _fail "remove unused api helper should be Standard" ;;
  13) _fail "breaking API change omitted architecture guidance" ;;
  14) _fail "deprecated API remove should stay Heavy" ;;
  *)  _fail "Case 4c failed (exit $?)" ;;
esac

echo "Case 5: subagent transcript_path suppresses output"
(
  _isolate_state "/tmp/doit-test-router-c5"
  out=$(_run_router "实现 src/auth.ts" "c5-1" '{"transcript_path": "/foo/agents/bar.jsonl"}')
  case "$out" in
    "") exit 0 ;;
    *)  printf 'subagent leak: %s\n' "$out" >&2; exit 11 ;;
  esac
)
case "$?" in
  0)  _pass "subagent context (transcript /agents/) suppresses banner" ;;
  *)  _fail "subagent context did not suppress" ;;
esac

# -------------------------------------------------------------------------
echo "Case 6: escape word writes skip flags + passes through silent"
(
  _isolate_state "/tmp/doit-test-router-c6"
  out=$(_run_router "yolo 直接做" "c6-1")
  if [[ -n "$out" ]]; then
    printf 'unexpected output: %s\n' "$out" >&2
    exit 11
  fi
  # Verify skip files exist
  skip_dir="$DO_IT_HOOK_DATA/sessions/c6-1"
  for flag in router grill gate; do
    _has_skip "$skip_dir" "$flag" || { echo "missing skip-$flag" >&2; exit 12; }
  done
)
case "$?" in
  0)  _pass "escape word silent + writes router/grill/gate skip flags" ;;
  11) _fail "escape produced output" ;;
  12) _fail "escape did not write skip flags" ;;
  *)  _fail "unexpected exit $?" ;;
esac

# -------------------------------------------------------------------------
echo "Case 7: hazardous SESSION_ID is sanitized into hash bucket"
(
  _isolate_state "/tmp/doit-test-router-c7"
  out=$(_run_router "实现 src/auth.ts" "../escape")
  # Should not have a literal ../escape directory under sessions/
  base="$DO_IT_HOOK_DATA/sessions"
  for entry in "$base"/*; do
    case "$entry" in
      */..\\/escape|*../escape) echo "literal escape path leaked: $entry" >&2; exit 11 ;;
    esac
  done
  [[ "$out" == *'do-it tier: Standard.'* ]] || { printf 'missing Standard context: %s\n' "$out" >&2; exit 12; }
  shopt -s nullglob
  matches=("$base"/*)
  shopt -u nullglob
  [[ "${#matches[@]}" -eq 1 ]] || { echo "expected one sanitized session dir" >&2; exit 13; }
  state="${matches[0]}/state.json"
  [[ "$(jq -r '.tier' "$state")" == "Standard" ]] || { cat "$state" >&2; exit 14; }
)
case "$?" in
  0)  _pass "SESSION_ID with .. is hashed; Standard state still records" ;;
  *)  _fail "session id sanitization regression" ;;
esac

# -------------------------------------------------------------------------
echo "Case 8: DEBUG does not duplicate Standard context"
(
  _isolate_state "/tmp/doit-test-router-c8"
  export DO_IT_DEBUG=1
  out=$(_run_router "实现 src/auth.ts" "c8-1" 2>/dev/null)
  count=$(printf '%s' "$out" | grep -o 'do-it tier: Standard\.' | wc -l | tr -d ' ')
  [[ "$count" == "1" ]] || { printf 'count=%s output=%s\n' "$count" "$out" >&2; exit 11; }
  state="$(_state_for c8-1)"
  [[ "$(jq -r '.tier' "$state")" == "Standard" ]] || { cat "$state" >&2; exit 12; }
)
case "$?" in
  0)  _pass "DEBUG emits exactly one Standard reminder" ;;
  *)  _fail "DEBUG output/state regression" ;;
esac

# -------------------------------------------------------------------------
echo "Case 9: dim_* fields all written in one batched state set"
(
  _isolate_state "/tmp/doit-test-router-c9"
  _run_router "实现 src/auth.ts" "c9-1" >/dev/null
  state="$(_state_for c9-1)"
  [[ -f "$state" ]] || { echo "no state file: $state" >&2; exit 11; }
  # All 5 dim_* fields must be present
  for k in dim_touches_code dim_crosses_packages dim_breaks_interface dim_needs_tdd dim_needs_review_loop; do
    if ! jq -e --arg k "$k" 'has($k)' "$state" >/dev/null 2>&1; then
      echo "missing key: $k" >&2; exit 12
    fi
  done
  # touches_code must be 1 for "实现 src/auth.ts"
  v=$(jq -r '.dim_touches_code' "$state")
  [[ "$v" == "1" ]] || { echo "dim_touches_code=$v expected 1" >&2; exit 13; }
)
case "$?" in
  0)  _pass "all 5 dim_* keys written; touches_code=1 on code-object prompt" ;;
  *)  _fail "dim batch write incomplete or wrong (exit $?)" ;;
esac

# -------------------------------------------------------------------------
echo "Case 10: Light tier skips dim evaluation (all dims = 0)"
(
  _isolate_state "/tmp/doit-test-router-c10"
  _run_router "你好吗？" "c10-1" >/dev/null
  state="$(_state_for c10-1)"
  [[ -f "$state" ]] || { echo "no state file" >&2; exit 11; }
  # On Light tier, dims are not written by router (the batched set is gated on tier != Light)
  # So the keys should be absent, OR all 0 if previously set. Either is acceptable.
  for k in dim_touches_code dim_crosses_packages dim_breaks_interface dim_needs_tdd dim_needs_review_loop; do
    if jq -e --arg k "$k" 'has($k)' "$state" >/dev/null 2>&1; then
      v=$(jq -r --arg k "$k" '.[$k]' "$state")
      [[ "$v" == "0" ]] || { echo "$k=$v on Light tier" >&2; exit 12; }
    fi
  done
)
case "$?" in
  0)  _pass "Light tier writes no dim_* keys (or all zero)" ;;
  *)  _fail "Light tier leaked dim_* values" ;;
esac

# -------------------------------------------------------------------------
echo "Case 11: partial skip writes only requested flags"
(
  _isolate_state "/tmp/doit-test-router-c11"
  out=$(_run_router "skip grill please implement src/foo.ts" "c11-1")
  [[ "$out" == *'do-it tier: Standard.'* ]] || { printf 'missing context: %s\n' "$out" >&2; exit 11; }
  skip_dir="$DO_IT_HOOK_DATA/sessions/c11-1"
  _has_skip "$skip_dir" grill || { echo "missing skip-grill" >&2; exit 12; }
  if _has_skip "$skip_dir" router; then echo "unexpected skip-router" >&2; exit 13; fi
  if _has_skip "$skip_dir" gate; then echo "unexpected skip-gate" >&2; exit 14; fi
  state="$(_state_for c11-1)"
  [[ -f "$state" ]] || { echo "missing state after partial skip" >&2; exit 15; }
  [[ "$(jq -r '.tier' "$state")" == "Standard" ]] || { cat "$state" >&2; exit 16; }
)
case "$?" in
  0)  _pass "skip grill writes grill flag only" ;;
  11) _fail "partial skip produced output" ;;
  12) _fail "skip-grill not written" ;;
  13) _fail "skip-router wrongly written" ;;
  14) _fail "skip-gate wrongly written" ;;
  15) _fail "partial skip did not refresh tier state" ;;
  16) _fail "partial skip tier not Standard" ;;
  *)  _fail "unexpected exit $?" ;;
esac

# -------------------------------------------------------------------------
echo "Case 11b: partial skip gate still routes tier/dims"
(
  _isolate_state "/tmp/doit-test-router-c11b"
  out=$(_run_router "skip gate please implement src/foo.ts" "c11b-1")
  [[ "$out" == *'do-it tier: Standard.'* ]] || { printf 'missing context: %s\n' "$out" >&2; exit 11; }
  skip_dir="$DO_IT_HOOK_DATA/sessions/c11b-1"
  _has_skip "$skip_dir" gate || { echo "missing skip-gate" >&2; exit 12; }
  if _has_skip "$skip_dir" router; then echo "unexpected skip-router" >&2; exit 13; fi
  state="$(_state_for c11b-1)"
  got=$(jq -r '.tier // ""' "$state")
  [[ "$got" == "Standard" ]] || { echo "tier=$got expected Standard" >&2; cat "$state" >&2; exit 14; }
)
case "$?" in
  0)  _pass "skip gate writes gate flag and refreshes tier" ;;
  11) _fail "partial skip gate produced output" ;;
  12) _fail "skip-gate not written" ;;
  13) _fail "skip-router wrongly written" ;;
  14) _fail "tier not refreshed on partial skip gate" ;;
  *)  _fail "unexpected exit $?" ;;
esac

# -------------------------------------------------------------------------
echo "Case 12: Heavy then Light/question clears all dim_* to 0"
(
  _isolate_state "/tmp/doit-test-router-c12"
  _run_router "重写 schema 涉及 breaking change 跨 frontend/ backend/" "c12-1" >/dev/null
  state="$(_state_for c12-1)"
  [[ "$(jq -r '.dim_needs_review_loop' "$state")" == "1" ]] || { cat "$state" >&2; exit 11; }
  _run_router "这是什么？" "c12-1" >/dev/null
  state="$(_state_for c12-1)"
  for k in dim_touches_code dim_crosses_packages dim_breaks_interface dim_needs_tdd dim_needs_review_loop; do
    v=$(jq -r --arg k "$k" '.[$k]' "$state")
    [[ "$v" == "0" ]] || { echo "$k=$v expected 0 after Light question" >&2; exit 12; }
  done
)
case "$?" in
  0)  _pass "Heavy→Light question zeros all dim_* flags" ;;
  11) _fail "Heavy prompt did not set dim_needs_review_loop=1" ;;
  12) _fail "Light question did not clear dim_*" ;;
  *)  _fail "Heavy→Light sequence failed (exit $?)" ;;
esac

# -------------------------------------------------------------------------
echo "Case 13a: Standard + DO_IT_ADVISORY_MODE=inline emits rule sentences, no pointer"
(
  _isolate_state "/tmp/doit-test-router-c13a"
  out=$(DO_IT_ADVISORY_MODE=inline _run_router "实现 src/auth.ts 的 token 刷新" "c13a-1")
  [[ "$out" == *'do-it tier: Standard.'* ]] || exit 11
  [[ "$out" == *"Work from current repository and runtime evidence"* ]] || exit 12
  [[ "$out" != *'Read skill://do-it-core'* ]] || exit 13
)
case "$?" in
  0)  _pass "inline mode emits Standard prefix + r-evidence sentence, no pointer" ;;
  11) _fail "inline mode omitted Standard prefix" ;;
  12) _fail "inline mode omitted the r-evidence sentence" ;;
  13) _fail "inline mode leaked the skill pointer" ;;
  *)  _fail "inline mode case failed (exit $?)" ;;
esac

# -------------------------------------------------------------------------
echo "Case 13b: Standard + DO_IT_ADVISORY_MODE=pointer emits one pointer, no rule sentences"
(
  _isolate_state "/tmp/doit-test-router-c13b"
  out=$(DO_IT_ADVISORY_MODE=pointer _run_router "实现 src/auth.ts 的 token 刷新" "c13b-1")
  [[ "$out" == *'do-it tier: Standard. Read skill://do-it-core'* ]] || exit 11
  [[ "$out" != *"Work from current repository and runtime evidence"* ]] || exit 12
  [[ "$out" != *"Before a done/fixed/passing/ready/install/merge claim"* ]] || exit 13
)
case "$?" in
  0)  _pass "pointer mode emits only the do-it-core pointer" ;;
  11) _fail "pointer mode omitted the do-it-core pointer" ;;
  12) _fail "pointer mode leaked the r-evidence sentence" ;;
  13) _fail "pointer mode leaked the r-verify sentence" ;;
  *)  _fail "pointer mode case failed (exit $?)" ;;
esac

# -------------------------------------------------------------------------
echo "Case 13c: auto + weak-model env var resolves inline"
(
  _isolate_state "/tmp/doit-test-router-c13c"
  out=$(OPENCODE_MODEL=deepseek-v4-flash _run_router "实现 src/auth.ts 的 token 刷新" "c13c-1")
  [[ "$out" == *"Work from current repository and runtime evidence"* ]] || exit 11
  [[ "$out" != *'Read skill://do-it-core'* ]] || exit 12
)
case "$?" in
  0)  _pass "auto mode with deepseek model env resolves inline" ;;
  11) _fail "auto+deepseek did not emit inline rules" ;;
  12) _fail "auto+deepseek emitted the pointer" ;;
  *)  _fail "auto+deepseek case failed (exit $?)" ;;
esac

# -------------------------------------------------------------------------
echo "Case 13d: auto + strong-model env var resolves pointer"
(
  _isolate_state "/tmp/doit-test-router-c13d"
  out=$(OPENCODE_MODEL=claude-sonnet-4-5 _run_router "实现 src/auth.ts 的 token 刷新" "c13d-1")
  [[ "$out" == *'Read skill://do-it-core'* ]] || exit 11
  [[ "$out" != *"Work from current repository and runtime evidence"* ]] || exit 12
)
case "$?" in
  0)  _pass "auto mode with claude model env resolves pointer" ;;
  11) _fail "auto+claude did not emit the pointer" ;;
  12) _fail "auto+claude leaked inline rule sentences" ;;
  *)  _fail "auto+claude case failed (exit $?)" ;;
esac

# -------------------------------------------------------------------------
echo "Case 13e: auto + no model anywhere resolves inline (conservative default)"
(
  _isolate_state "/tmp/doit-test-router-c13e"
  out=$(OPENCODE_MODEL= ANTHROPIC_MODEL= OPENAI_MODEL= CODEX_MODEL= KIMI_MODEL= PI_MODEL= \
    _run_router "实现 src/auth.ts 的 token 刷新" "c13e-1")
  [[ "$out" == *"Work from current repository and runtime evidence"* ]] || exit 11
  [[ "$out" != *'Read skill://do-it-core'* ]] || exit 12
)
case "$?" in
  0)  _pass "auto mode with no model env resolves inline" ;;
  11) _fail "auto+no-model did not emit inline rules" ;;
  12) _fail "auto+no-model emitted the pointer" ;;
  *)  _fail "auto+no-model case failed (exit $?)" ;;
esac

# -------------------------------------------------------------------------
echo "Case 13e2: auto detects bounded o-series IDs from payload and env"
(
  _isolate_state "/tmp/doit-test-router-c13e2"
  out=$(OPENCODE_MODEL=claude-sonnet-4-5 _run_router \
    "实现 src/auth.ts 的 token 刷新" "c13e2-payload-o3" '{model:"openai/o3-mini"}')
  [[ "$out" == *'Read skill://do-it-core'* ]] || exit 11
  out=$(OPENCODE_MODEL=claude-sonnet-4-5 _run_router \
    "实现 src/auth.ts 的 token 刷新" "c13e2-payload-foo2" '{model:"foo2"}')
  [[ "$out" == *"Work from current repository and runtime evidence"* ]] || exit 12
  [[ "$out" != *'Read skill://do-it-core'* ]] || exit 13
  out=$(OPENCODE_MODEL=o4-mini _run_router \
    "实现 src/auth.ts 的 token 刷新" "c13e2-env-o4")
  [[ "$out" == *'Read skill://do-it-core'* ]] || exit 14
  out=$(OPENCODE_MODEL=foo2 _run_router \
    "实现 src/auth.ts 的 token 刷新" "c13e2-env-foo2")
  [[ "$out" == *"Work from current repository and runtime evidence"* ]] || exit 15
  [[ "$out" != *'Read skill://do-it-core'* ]] || exit 16
)
case "$?" in
  0)  _pass "bounded o3/o4 payload and env IDs use pointer while foo2 stays inline" ;;
  11) _fail "payload o3 ID did not emit pointer" ;;
  12|13) _fail "payload foo2 did not remain inline or lost payload precedence" ;;
  14) _fail "env o4 ID did not emit pointer" ;;
  15|16) _fail "env foo2 did not remain inline" ;;
  *)  _fail "o-series boundary case failed (exit $?)" ;;
esac

# -------------------------------------------------------------------------
echo "Case 13f: no-write boundary emits the r-boundary sentence in both modes"
(
  _isolate_state "/tmp/doit-test-router-c13f"
  out=$(DO_IT_ADVISORY_MODE=inline _run_router "Review the current API diff; do not edit." "c13f-inline")
  [[ "$out" == *"honor the user's action boundary"* ]] || exit 11
  [[ "$out" == *"An answer, review, diagnosis, or plan does not authorize edits"* ]] || exit 12
  out=$(DO_IT_ADVISORY_MODE=pointer _run_router "Review the current API diff; do not edit." "c13f-pointer")
  [[ "$out" == *"honor the user's action boundary"* ]] || exit 13
  [[ "$out" == *"An answer, review, diagnosis, or plan does not authorize edits"* ]] || exit 14
)
case "$?" in
  0)  _pass "no-write boundary appends the r-boundary sentence in both modes" ;;
  11) _fail "no-write inline omitted the boundary text" ;;
  12) _fail "no-write inline omitted the r-boundary sentence" ;;
  13) _fail "no-write pointer omitted the boundary text" ;;
  14) _fail "no-write pointer omitted the r-boundary sentence" ;;
  *)  _fail "no-write boundary case failed (exit $?)" ;;
esac

# -------------------------------------------------------------------------
echo "Case 13g: architecture matching is bounded, clause-local, and order-independent"
(
  _isolate_state "/tmp/doit-test-router-c13g"
  out=$(_run_router "alter schema with breaking change across frontend/ backend/" "c13g-interface")
  [[ "$out" == *'skill://do-it-architecture'* ]] || exit 11
  [[ "$(jq -r '.tier' "$(_state_for c13g-interface)")" == "Heavy" ]] || exit 12
  out=$(_run_router "the schema must replace its public contract with a breaking change across frontend/ backend/" "c13g-interface-reversed")
  [[ "$out" == *'skill://do-it-architecture'* ]] || exit 25
  out=$(_run_router "run the database migration now" "c13g-migration")
  [[ "$out" == *'skill://do-it-architecture'* ]] || exit 13
  [[ "$(jq -r '.tier' "$(_state_for c13g-migration)")" == "Heavy" ]] || exit 14
  out=$(_run_router "cut over production traffic to the new database" "c13g-cutover")
  [[ "$out" == *'skill://do-it-architecture'* ]] || exit 15
  [[ "$(jq -r '.tier' "$(_state_for c13g-cutover)")" == "Heavy" ]] || exit 16
  out=$(_run_router "harden the security boundary for credential rotation" "c13g-security")
  [[ "$out" == *'skill://do-it-architecture'* ]] || exit 17
  [[ "$(jq -r '.tier' "$(_state_for c13g-security)")" == "Heavy" ]] || exit 18
  out=$(_run_router "move the tenant authorization boundary" "c13g-security-direct")
  [[ "$out" == *'skill://do-it-architecture'* ]] || exit 23
  [[ "$(jq -r '.tier' "$(_state_for c13g-security-direct)")" == "Heavy" ]] || exit 24
  out=$(_run_router "Can you explain how database migrations work?" "c13g-explanation")
  [[ -z "$out" ]] || exit 19
  [[ "$(jq -r '.tier' "$(_state_for c13g-explanation)")" == "Light" ]] || exit 20
  out=$(_run_router "publish the release to production" "c13g-release")
  [[ -z "$out" ]] || exit 21
  [[ "$(jq -r '.tier' "$(_state_for c13g-release)")" == "Heavy" ]] || exit 22
  out=$(_run_router "publish a rapid parser release to production with breaking telemetry" "c13g-rapid")
  [[ -z "$out" ]] || exit 26
  [[ "$(jq -r '.tier' "$(_state_for c13g-rapid)")" == "Heavy" ]] || exit 27
  out=$(_run_router "ship version 0.15.0 to production; change telemetry sampling. schema docs remain stable" "c13g-cross-clause")
  [[ -z "$out" ]] || exit 28
  [[ "$(jq -r '.tier' "$(_state_for c13g-cross-clause)")" == "Heavy" ]] || exit 29
  out=$(_run_router "ship version 0.15.0 to production; schema docs remain stable. replace telemetry sampling" "c13g-cross-clause-reversed")
  [[ -z "$out" ]] || exit 30
  out=$(_run_router "run the token counter in src/metrics.ts" "c13g-counter")
  [[ "$out" != *'skill://do-it-architecture'* ]] || exit 31
  out=$(_run_router "run token refresh unit tests; document relationship schema notes" "c13g-relationship")
  [[ "$out" != *'skill://do-it-architecture'* ]] || exit 32
  out=$(_run_router "establish a new security boundary across packages" "c13g-security-boundary")
  [[ "$out" == *'skill://do-it-architecture'* ]] || exit 33
  out=$(_run_router "run token refresh unit tests, document relationship schema notes" "c13g-comma")
  [[ "$out" != *'skill://do-it-architecture'* ]] || exit 34
  out=$(_run_router "run token refresh unit tests (document relationship schema notes)" "c13g-parens")
  [[ "$out" != *'skill://do-it-architecture'* ]] || exit 35
  out=$(_run_router "run token refresh unit tests: document relationship schema notes" "c13g-colon")
  [[ "$out" != *'skill://do-it-architecture'* ]] || exit 36
)
case "$?" in
  0)  _pass "architecture positives emit in either order; substrings and unrelated clauses stay quiet" ;;
  11|12|25) _fail "interface architecture routing failed" ;;
  13|14) _fail "migration architecture routing failed" ;;
  15|16) _fail "cutover architecture routing failed" ;;
  17|18) _fail "security-boundary architecture routing failed" ;;
  23|24) _fail "standalone security-boundary architecture routing failed" ;;
  19|20) _fail "migration explanation emitted or changed tier" ;;
  21|22) _fail "ordinary Heavy release emitted or changed tier" ;;
  26|27|31|32) _fail "substring lookalike emitted architecture guidance or changed tier" ;;
  28|29|30|34|35|36) _fail "unrelated clauses emitted architecture guidance or changed tier" ;;
  33) _fail "standalone security-boundary architecture routing failed" ;;
  *)  _fail "architecture-risk routing case failed (exit $?)" ;;
esac

# -------------------------------------------------------------------------
echo "Case K: Kimi ContentPart[] prompt routes Standard and emits plain text"
(
  _isolate_state "/tmp/doit-test-router-kimi"
  export KIMI_CODE_HOME="/tmp/doit-test-router-kimi/home"
  payload=$(jq -nc '{prompt: [{type:"text",text:"实现 src/auth.ts 的登录"}], session_id: "k1", cwd: "/tmp"}')
  out=$(printf '%s' "$payload" | bash "$ROUTER")
  [[ "$out" == *'do-it tier: Standard.'* ]] || { printf 'missing advisory: %s\n' "$out" >&2; exit 11; }
  # Plain-text channel: the raw JSON envelope must not leak into context.
  if printf '%s' "$out" | jq -e . >/dev/null 2>&1; then exit 12; fi
  state="$(_state_for k1)"
  [[ "$(jq -r '.tier' "$state")" == "Standard" ]] || { cat "$state" >&2; exit 13; }
)
case "$?" in
  0)  _pass "Kimi array prompt routes Standard with plain-text advisory" ;;
  11) _fail "Kimi array prompt produced no Standard advisory" ;;
  12) _fail "Kimi advisory leaked the JSON envelope" ;;
  13) _fail "Kimi array prompt did not persist Standard state" ;;
  *)  _fail "Kimi router case failed (exit $?)" ;;
esac

# -------------------------------------------------------------------------
echo "Case 14: invalid core registry emits a bounded safe pointer, never partial rules"
(
  _isolate_state "/tmp/doit-test-router-registry"
  registry_dir="$(mktemp -d)"

  out=$(DO_IT_ADVISORY_MODE=inline DO_IT_RULES_DATA="$registry_dir/missing.tsv" \
    _run_router "实现 src/auth.ts 的 token 刷新" "registry-missing")
  [[ "$out" == *"core registry unavailable or invalid"* ]] || exit 11
  [[ "$out" == *"Read skill://do-it-core"* ]] || exit 12
  [[ "$out" != *"do-it tier: Standard."* ]] || exit 13

  printf '%s\n' $'r-evidence\tpartial rule must not leak\tmodes\tUserPromptSubmit' \
    $'broken\trow\tonly-three' > "$registry_dir/malformed.tsv"
  out=$(DO_IT_ADVISORY_MODE=inline DO_IT_RULES_DATA="$registry_dir/malformed.tsv" \
    _run_router "实现 src/auth.ts 的 token 刷新" "registry-malformed")
  [[ "$out" == *"core registry unavailable or invalid"* ]] || exit 14
  [[ "$out" == *"Read skill://do-it-core"* ]] || exit 15
  [[ "$out" != *"partial rule must not leak"* ]] || exit 16

  rm -rf "$registry_dir"
)
case "$?" in
  0)  _pass "missing or malformed registry emits only bounded pointer fallback" ;;
  11|12|13) _fail "missing registry fallback is incomplete or leaked partial context" ;;
  14|15|16) _fail "malformed registry fallback is incomplete or leaked partial context" ;;
  *)  _fail "registry fallback case failed (exit $?)" ;;
esac

# -------------------------------------------------------------------------
echo
if [[ "$FAIL" -gt 0 ]]; then
  echo "FAILED: $PASS passed, $FAIL failed" >&2
  exit 1
fi
echo "Summary: $PASS passed, $FAIL failed"
echo "ok: $PASS tests"
