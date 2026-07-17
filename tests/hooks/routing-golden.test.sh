#!/usr/bin/env bash
# Golden routing cases from tests/fixtures/routing-golden.tsv
# Usage: bash tests/hooks/routing-golden.test.sh

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ROUTER="$REPO_ROOT/hooks/router.sh"
FIXTURE="$REPO_ROOT/tests/fixtures/routing-golden.tsv"

if [[ ! -x "$ROUTER" ]]; then
  echo "FAIL: router.sh not executable at $ROUTER" >&2
  exit 1
fi
if [[ ! -f "$FIXTURE" ]]; then
  echo "FAIL: missing fixture $FIXTURE" >&2
  exit 1
fi

PASS=0
FAIL=0
CASE=0

_pass() { echo "  ok: $1"; PASS=$((PASS + 1)); }
_fail() { echo "  FAIL: $1" >&2; FAIL=$((FAIL + 1)); }

_run_router() {
  local prompt="$1" sid="$2"
  local payload
  payload=$(jq -nc --arg p "$prompt" --arg s "$sid" \
    '{prompt: $p, session_id: $s, cwd: "/tmp"}')
  printf '%s' "$payload" | bash "$ROUTER"
}

_isolate_state() {
  export DO_IT_HOOK_DATA="$1"
  rm -rf "$DO_IT_HOOK_DATA"
  unset CLAUDE_PLUGIN_DATA CODEX_HOME KIMI_CODE_HOME KIMI_PLUGIN_ROOT CLAUDE_AGENT_CONTEXT CLAUDE_SUBAGENT
  unset DO_IT_DEBUG
}

_state_for() {
  printf '%s/sessions/%s/state.json' "$DO_IT_HOOK_DATA" "$1"
}

_check_skip_flags() {
  local sid="$1" want="$2"
  local skip_dir="$DO_IT_HOOK_DATA/sessions/$sid"
  IFS=',' read -r -a flags <<< "$want"
  for flag in "${flags[@]}"; do
    [[ -n "$flag" ]] || continue
    [[ -f "$skip_dir/skip-$flag" ]] || return 1
  done
  # Ensure no extra skip flags beyond expected set
  for existing in "$skip_dir"/skip-*; do
    [[ -e "$existing" ]] || continue
    local base="${existing##*/}"
    local name="${base#skip-}"
    local found=0
    for flag in "${flags[@]}"; do
      [[ "$flag" == "$name" ]] && found=1
    done
    [[ "$found" -eq 1 ]] || return 2
  done
  return 0
}

while IFS= read -r line || [[ -n "$line" ]]; do
  line="${line%%#*}"
  line="${line//$'\r'/}"
  [[ -z "${line//[[:space:]]/}" ]] && continue
  CASE=$((CASE + 1))
  IFS=$'\t' read -r prompt expected notes <<< "$line"
  sid="golden-$CASE"
  data_dir="/tmp/doit-test-routing-golden-$CASE"

  echo "Case $CASE: ${notes:-$expected}"

  (
    _isolate_state "$data_dir"
    out=$(_run_router "$prompt" "$sid")

    tier_want=""
    kind_want=""
    skip_want=""
    IFS=';' read -r -a parts <<< "$expected"
    for part in "${parts[@]}"; do
      case "$part" in
        tier:*) tier_want="${part#tier:}" ;;
        kind:*) kind_want="${part#kind:}" ;;
        skip:*) skip_want="${part#skip:}" ;;
        *) echo "unknown expectation token: $part" >&2; exit 12 ;;
      esac
    done

    if [[ -n "$skip_want" ]]; then
      _check_skip_flags "$sid" "$skip_want" || exit 13
    fi

    if [[ "$tier_want" == "Standard" ]]; then
      [[ "$out" == *'do-it tier: Standard.'* ]] || { printf 'missing Standard context: %s\n' "$out" >&2; exit 11; }
    else
      [[ -z "$out" ]] || { printf 'unexpected output: %s\n' "$out" >&2; exit 11; }
    fi

    state="$(_state_for "$sid")"
    if [[ -n "$tier_want" ]]; then
      [[ -f "$state" ]] || { echo "missing state for tier check" >&2; exit 14; }
      got=$(jq -r '.tier // ""' "$state")
      [[ "$got" == "$tier_want" ]] || { echo "tier=$got want $tier_want" >&2; cat "$state" >&2; exit 15; }
    elif [[ -n "$skip_want" ]]; then
      # escape path may exit before tier is written — ok
      :
    fi

    if [[ -n "$kind_want" ]]; then
      [[ -f "$state" ]] || { echo "missing state for kind check" >&2; exit 16; }
      got_kind=$(jq -r '.last_prompt_kind // ""' "$state")
      [[ "$got_kind" == "$kind_want" ]] || { echo "kind=$got_kind want $kind_want" >&2; exit 17; }
    fi
  )
  rc=$?
  case "$rc" in
    0)  _pass "$expected (${notes:-case $CASE})" ;;
    11) _fail "case $CASE emitted output" ;;
    12) _fail "case $CASE bad expectation token" ;;
    13) _fail "case $CASE skip flags mismatch (want $skip_want)" ;;
    14|15) _fail "case $CASE tier mismatch (want ${tier_want:-<unset>})" ;;
    16|17) _fail "case $CASE kind mismatch (want $kind_want)" ;;
    *)  _fail "case $CASE unexpected exit $rc" ;;
  esac
done < "$FIXTURE"

echo
if [[ "$FAIL" -gt 0 ]]; then
  echo "FAILED: $PASS passed, $FAIL failed ($CASE cases)" >&2
  exit 1
fi
echo "Summary: $PASS passed, $FAIL failed ($CASE cases)"
echo "ok: $PASS routing-golden tests"
