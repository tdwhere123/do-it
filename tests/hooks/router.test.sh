#!/usr/bin/env bash
# Smoke tests for hooks/router.sh — locks in routing invariants:
#   - Light and Heavy stay silent; Standard emits one compact reminder
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
  unset CLAUDE_PLUGIN_DATA CODEX_HOME CLAUDE_AGENT_CONTEXT CLAUDE_SUBAGENT
  unset DO_IT_DEBUG
}

_state_for() {
  # echo path to state.json for given session_id
  printf '%s/sessions/%s/state.json' "$DO_IT_HOOK_DATA" "$1"
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
echo "Case 3: intent verb + code object → Standard state and compact context"
(
  _isolate_state "/tmp/doit-test-router-c3"
  out=$(_run_router "实现 src/auth.ts 的登录" "c3-1")
  [[ "$out" == *'"hookEventName":"UserPromptSubmit"'* ]] || { printf 'missing context: %s\n' "$out" >&2; exit 11; }
  [[ "$out" == *'do-it tier: Standard.'* ]] || exit 12
  [[ "$out" != *'do-it-code-quality'* && "$out" != *'do-it-verify'* ]] || exit 13
  state="$(_state_for c3-1)"
  [[ "$(jq -r '.tier' "$state")" == "Standard" ]] || { cat "$state" >&2; exit 14; }
)
case "$?" in
  0)  _pass "Standard emits compact non-chain reminder" ;;
  11) _fail "Standard emitted no additionalContext" ;;
  12) _fail "Standard context omitted tier" ;;
  13) _fail "Standard context restored a skill chain" ;;
  *)  _fail "Standard state missing" ;;
esac

# -------------------------------------------------------------------------
echo "Case 4: >=2 heavy signals → Heavy state, silent output"
(
  _isolate_state "/tmp/doit-test-router-c4"
  out=$(_run_router "重写 schema 涉及 breaking change 跨 frontend/ backend/" "c4-1")
  [[ -z "$out" ]] || { printf 'unexpected output: %s\n' "$out" >&2; exit 11; }
  state="$(_state_for c4-1)"
  [[ "$(jq -r '.tier' "$state")" == "Heavy" ]] || { cat "$state" >&2; exit 12; }
)
case "$?" in
  0)  _pass "Heavy signals resolve Heavy state silently" ;;
  11) _fail "Heavy emitted output" ;;
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
)
case "$?" in
  0)  _pass "release action is Heavy; release explanation is Light" ;;
  11) _fail "strong Heavy action emitted context" ;;
  12) _fail "release action did not route Heavy" ;;
  13) _fail "explanation question emitted context" ;;
  14) _fail "explanation question did not stay Light" ;;
  *)  _fail "strong-action routing crashed" ;;
esac

# -------------------------------------------------------------------------

echo "Case 4c: remove unused api/schema helper stays Standard (not strong Heavy)"
(
  _isolate_state "/tmp/doit-test-router-c4c"
  out=$(_run_router "remove unused api helper from schema.ts" "c4c-remove")
  [[ "$out" == *'do-it tier: Standard.'* ]] || exit 11
  [[ "$(jq -r '.tier' "$(_state_for c4c-remove)")" == "Standard" ]] || exit 12
  out=$(_run_router "remove the deprecated API even though it is breaking" "c4c-depr")
  [[ -z "$out" ]] || exit 13
  [[ "$(jq -r '.tier' "$(_state_for c4c-depr)")" == "Heavy" ]] || exit 14
)
case "$?" in
  0)  _pass "destructive+bare api/schema is Standard; deprecated+breaking stays Heavy" ;;
  11) _fail "remove unused api helper missing Standard context" ;;
  12) _fail "remove unused api helper should be Standard" ;;
  13) _fail "deprecated API remove emitted context" ;;
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
    [[ -f "$skip_dir/skip-$flag" ]] || { echo "missing skip-$flag" >&2; exit 12; }
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
  [[ -f "$skip_dir/skip-grill" ]] || { echo "missing skip-grill" >&2; exit 12; }
  if [[ -f "$skip_dir/skip-router" ]]; then echo "unexpected skip-router" >&2; exit 13; fi
  if [[ -f "$skip_dir/skip-gate" ]]; then echo "unexpected skip-gate" >&2; exit 14; fi
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
  [[ -f "$skip_dir/skip-gate" ]] || { echo "missing skip-gate" >&2; exit 12; }
  if [[ -f "$skip_dir/skip-router" ]]; then echo "unexpected skip-router" >&2; exit 13; fi
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
echo
if [[ "$FAIL" -gt 0 ]]; then
  echo "FAILED: $PASS passed, $FAIL failed" >&2
  exit 1
fi
echo "Summary: $PASS passed, $FAIL failed"
echo "ok: $PASS tests"
