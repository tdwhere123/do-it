#!/usr/bin/env bash
# Smoke tests for hooks/lib/common.sh — locks in the red-team fixes:
#   - flock-missing fallback serializes concurrent read-modify-write state
#   - SESSION_ID path-injection is sanitized
#   - empty SESSION_ID + non-git cwd no longer share a global `nosession` bucket
#   - do_it_in_subagent_context honors Pi, Claude, and portable transcript paths
#   - runtime gitignore is self-contained (does not modify repo .gitignore)
#
# Usage: bash tests/hooks/common.test.sh
# Exits non-zero on first failure; otherwise prints "ok: <N> tests".

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
COMMON="$REPO_ROOT/hooks/lib/common.sh"

if [[ ! -f "$COMMON" ]]; then
  echo "FAIL: common.sh not found at $COMMON" >&2
  exit 1
fi

PASS=0
FAIL=0

_pass() { echo "  ok: $1"; PASS=$((PASS + 1)); }
_fail() { echo "  FAIL: $1" >&2; FAIL=$((FAIL + 1)); }

_isolate_env() {
  unset CLAUDE_PLUGIN_DATA CODEX_HOME KIMI_CODE_HOME KIMI_PLUGIN_ROOT transcript_path CLAUDE_AGENT_CONTEXT CLAUDE_SUBAGENT
  unset PI_SUBAGENT_CHILD CURSOR_SUBAGENT CURSOR_AGENT_CONTEXT
  export DO_IT_HOOK_DATA="$1"
  rm -rf "$DO_IT_HOOK_DATA"
}

# -------------------------------------------------------------------------
echo "Case 1: do_it_session_dir rejects path-injection"
(
  _isolate_env "/tmp/doit-test-pathinj"
  source "$COMMON"
  d_escape="$(do_it_session_dir "../escape")"
  d_etc="$(do_it_session_dir "/etc/passwd")"
  d_ctrl="$(do_it_session_dir $'evil\x01id')"
  d_ok="$(do_it_session_dir "good-id-1")"
  case "$d_escape"  in *../*|*/etc/*) exit 11 ;; esac
  case "$d_etc"     in */etc/passwd*) exit 12 ;; esac
  case "$d_ctrl"    in *$'\x01'*)     exit 13 ;; esac
  case "$d_ok"      in */good-id-1)   ;; *) exit 14 ;; esac
)
case "$?" in
  0)  _pass "all hazardous ids hashed; safe id passes through" ;;
  11) _fail "../escape escaped sandbox" ;;
  12) _fail "/etc/passwd not sanitized" ;;
  13) _fail "control char preserved" ;;
  14) _fail "safe id was unexpectedly rewritten" ;;
  *)  _fail "subshell crashed (exit=$?)" ;;
esac

# -------------------------------------------------------------------------
echo "Case 1b: do_it_session_dir hashes LF/CR/TAB and bare dot/dotdot ids"
(
  _isolate_env "/tmp/doit-test-lfdot"
  source "$COMMON"
  d_lf="$(do_it_session_dir "$(printf 'abc\nxyz')")"
  d_cr="$(do_it_session_dir "$(printf 'abc\rxyz')")"
  d_tab="$(do_it_session_dir "$(printf 'abc\txyz')")"
  d_dot="$(do_it_session_dir ".")"
  d_dotdot="$(do_it_session_dir "..")"
  # No raw control char anywhere in returned path.
  case "$d_lf"     in *$'\n'*) exit 11 ;; esac
  case "$d_cr"     in *$'\r'*) exit 12 ;; esac
  case "$d_tab"    in *$'\t'*) exit 13 ;; esac
  # Bare dot / dotdot must not pass through verbatim.
  case "$d_dot"    in */.) exit 14 ;; esac
  case "$d_dotdot" in */..) exit 15 ;; esac
)
case "$?" in
  0)  _pass "LF/CR/TAB and bare dot/dotdot ids hashed" ;;
  11) _fail "LF survived in returned path" ;;
  12) _fail "CR survived in returned path" ;;
  13) _fail "TAB survived in returned path" ;;
  14) _fail "bare '.' produced trailing '/.' path" ;;
  15) _fail "bare '..' produced trailing '/..' path" ;;
  *)  _fail "subshell crashed (exit=$?)" ;;
esac

# -------------------------------------------------------------------------
echo "Case 2: empty SESSION_ID + non-git cwd buckets per cwd (no global 'nosession')"
(
  _isolate_env "/tmp/doit-test-cwdbucket"
  source "$COMMON"
  TMPA="$(mktemp -d)"
  TMPB="$(mktemp -d)"
  ( cd "$TMPA" && do_it_session_dir "" ) > /tmp/doit-test-cwdbucket.a
  ( cd "$TMPB" && do_it_session_dir "" ) > /tmp/doit-test-cwdbucket.b
  da="$(cat /tmp/doit-test-cwdbucket.a)"
  db="$(cat /tmp/doit-test-cwdbucket.b)"
  rm -rf "$TMPA" "$TMPB" /tmp/doit-test-cwdbucket.a /tmp/doit-test-cwdbucket.b
  # Each path's *trailing key* (last segment) is what we want to compare;
  # the parent dir is shared by design.
  ka="${da##*/}"
  kb="${db##*/}"
  if [[ "$ka" == "$kb" ]]; then exit 21; fi
  if [[ "$ka" == "nosession" || "$kb" == "nosession" ]]; then exit 22; fi
)
case "$?" in
  0)  _pass "two non-git cwds resolve to distinct buckets" ;;
  21) _fail "two distinct non-git cwds share the same bucket" ;;
  22) _fail "non-git fallback still uses literal 'nosession' key" ;;
  *)  _fail "subshell crashed (exit=$?)" ;;
esac

# -------------------------------------------------------------------------
echo "Case 3: flock-missing fallback serializes 50 concurrent writers"
(
  _isolate_env "/tmp/doit-test-race"
  # Stub: pretend `flock` is missing.
  command() {
    if [[ "${1:-}" == "-v" && "${2:-}" == "flock" ]]; then return 1; fi
    builtin command "$@"
  }
  export -f command 2>/dev/null
  source "$COMMON"
  if command -v flock >/dev/null 2>&1; then exit 31; fi
  SDIR="$(do_it_session_dir race_test)"
  mkdir -p "$SDIR"
  echo '{}' > "$SDIR/state.json"
  for _ in $(seq 1 50); do
    ( do_it_session_state_inc race_test hook_invocations router ) &
  done
  wait
  if [[ ! -f "$SDIR/state.json" ]]; then exit 32; fi
  if [[ ! -s "$SDIR/state.json" ]]; then exit 33; fi
  jq -e . "$SDIR/state.json" >/dev/null 2>&1 || exit 34
  [[ "$(jq -r '.hook_invocations.router' "$SDIR/state.json")" == "50" ]] || exit 35
  [[ ! -d "$SDIR/.state.lock.d" ]] || exit 36
)
case "$?" in
  0)  _pass "mkdir fallback serialized all 50 state increments" ;;
  31) _fail "flock stub did not take effect" ;;
  32) _fail "state.json missing after race" ;;
  33) _fail "state.json present but empty" ;;
  34) _fail "state.json contains malformed JSON" ;;
  35) _fail "concurrent increments were lost" ;;
  36) _fail "fallback lock directory leaked" ;;
  *)  _fail "subshell crashed (exit=$?)" ;;
esac

# -------------------------------------------------------------------------
echo "Case 3b: jq-free mkdir fallback serializes counters and user turns"
(
  _isolate_env "/tmp/doit-test-race-kv"
  command() {
    if [[ "${1:-}" == "-v" && ( "${2:-}" == "flock" || "${2:-}" == "jq" ) ]]; then return 1; fi
    builtin command "$@"
  }
  export -f command 2>/dev/null
  source "$COMMON"
  DO_IT_HAVE_JQ=0
  for _ in $(seq 1 50); do
    ( do_it_session_state_inc race_kv hook_invocations router ) &
    ( do_it_user_turn_bump race_kv ) &
  done
  for n in $(seq 1 30); do
    ( do_it_session_state_set_many race_kv pair_a "$n" pair_b "$n" ) &
  done
  wait
  wait
  SDIR="$(do_it_session_dir race_kv)"
  [[ "$(do_it_session_state_get race_kv hook_invocations.router)" == "50" ]] || exit 37
  [[ "$(do_it_user_turn_get race_kv)" == "50" ]] || exit 38
  [[ "$(do_it_session_state_get race_kv pair_a)" == "$(do_it_session_state_get race_kv pair_b)" ]] || exit 40
  [[ ! -d "$SDIR/.state.lock.d" ]] || exit 39
)
case "$?" in
  0)  _pass "jq-free fallback serialized counters and user turns" ;;
  37) _fail "jq-free counter increments were lost" ;;
  38) _fail "jq-free user-turn increments were lost" ;;
  39) _fail "jq-free fallback lock directory leaked" ;;
  40) _fail "jq-free batched state write was partially visible" ;;
  *)  _fail "subshell crashed (exit=$?)" ;;
esac

# -------------------------------------------------------------------------
echo "Case 3c: mkdir fallback reclaims a dead-owner lock directory"
(
  _isolate_env "/tmp/doit-test-stale-lock"
  command() {
    if [[ "${1:-}" == "-v" && "${2:-}" == "flock" ]]; then return 1; fi
    builtin command "$@"
  }
  export -f command 2>/dev/null
  source "$COMMON"
  lock="$DO_IT_HOOK_DATA/stale.lock"
  mkdir -p "${lock}.d"
  printf '%s\n' 999999 > "${lock}.d/owner"
  _mark_reclaimed() { : > "$DO_IT_HOOK_DATA/reclaimed"; }
  _do_it_with_state_lock "$lock" _mark_reclaimed || exit 40
  [[ -f "$DO_IT_HOOK_DATA/reclaimed" ]] || exit 41
  [[ ! -d "${lock}.d" ]] || exit 42
)
case "$?" in
  0)  _pass "dead-owner fallback lock reclaimed" ;;
  40) _fail "dead-owner fallback lock was not acquired" ;;
  41) _fail "callback did not run after stale-lock reclaim" ;;
  42) _fail "reclaimed fallback lock directory leaked" ;;
  *)  _fail "subshell crashed (exit=$?)" ;;
esac

# -------------------------------------------------------------------------
echo "Case 3d: mkdir fallback never steals an old lock from a live owner"
(
  _isolate_env "/tmp/doit-test-live-lock"
  command() {
    if [[ "${1:-}" == "-v" && "${2:-}" == "flock" ]]; then return 1; fi
    builtin command "$@"
  }
  export -f command 2>/dev/null
  source "$COMMON"
  mkdir -p "$DO_IT_HOOK_DATA"
  lock="$DO_IT_HOOK_DATA/live.lock"
  _hold_live_lock() {
    : > "$DO_IT_HOOK_DATA/in-critical"
    sleep 2
    rm -f "$DO_IT_HOOK_DATA/in-critical"
  }
  _probe_live_lock() {
    [[ ! -f "$DO_IT_HOOK_DATA/in-critical" ]] || : > "$DO_IT_HOOK_DATA/overlap"
  }
  _do_it_with_state_lock "$lock" _hold_live_lock &
  first=$!
  for _ in $(seq 1 100); do
    [[ -f "${lock}.d/owner" ]] && break
    sleep 0.01
  done
  [[ -f "${lock}.d/owner" ]] || exit 43
  touch -t 200001010000 "${lock}.d"
  _do_it_with_state_lock "$lock" _probe_live_lock || exit 44
  wait "$first" || exit 45
  [[ ! -f "$DO_IT_HOOK_DATA/overlap" ]] || exit 46
  [[ ! -d "${lock}.d" && ! -d "${lock}.d.reaping" ]] || exit 47
)
case "$?" in
  0)  _pass "old live-owner fallback lock was not stolen" ;;
  43) _fail "live-owner fallback never acquired its lock" ;;
  44) _fail "waiting fallback callback did not run" ;;
  45) _fail "live-owner fallback callback failed" ;;
  46) _fail "old live-owner fallback lock was stolen" ;;
  47) _fail "live-owner fallback lock metadata leaked" ;;
  *)  _fail "subshell crashed (exit=$?)" ;;
esac

# -------------------------------------------------------------------------
echo "Case 4: do_it_in_subagent_context honors host and portable path signals"
(
  _isolate_env "/tmp/doit-test-subagent"
  source "$COMMON"
  if do_it_in_subagent_context "/Users/x/.claude/projects/foo/transcript.jsonl"; then exit 41; fi
  if ! do_it_in_subagent_context "/Users/x/.claude/agents/foo/transcript.jsonl"; then exit 42; fi
  if ! do_it_in_subagent_context "/Users/x/.claude/projects/foo/subagents/agent-x.jsonl"; then exit 43; fi
  if ! do_it_in_subagent_context 'C:\Users\x\.pi\subagents\agent-x.jsonl'; then exit 44; fi
  PI_SUBAGENT_CHILD=1
  if ! do_it_in_subagent_context ""; then exit 45; fi
  unset PI_SUBAGENT_CHILD
  if do_it_in_subagent_context ""; then exit 46; fi
)
case "$?" in
  0)  _pass "Pi env plus POSIX/Windows agents paths trigger subagent context" ;;
  41) _fail "non-agents transcript triggered subagent context" ;;
  42) _fail "agents/ transcript did not trigger subagent context" ;;
  43) _fail "subagents/ transcript did not trigger subagent context" ;;
  44) _fail "Windows subagents path did not trigger subagent context" ;;
  45) _fail "PI_SUBAGENT_CHILD=1 did not trigger subagent context" ;;
  46) _fail "empty arg + no env returned subagent context" ;;
  *)  _fail "subshell crashed (exit=$?)" ;;
esac

# -------------------------------------------------------------------------
echo "Case 5: runtime gitignore is self-contained (parent .gitignore untouched)"
(
  _isolate_env ""
  unset DO_IT_HOOK_DATA  # force the repo-root branch
  PROJ="$(mktemp -d)"
  cd "$PROJ"
  git init -q
  echo 'node_modules/' > .gitignore
  git add .gitignore
  git -c user.name=do-it-test -c user.email=do-it-test@example.invalid commit -qm init
  ORIG="$(cat .gitignore)"
  source "$COMMON"
  do_it_session_dir new_session > /dev/null
  if [[ "$(cat .gitignore)" != "$ORIG" ]]; then
    rm -rf "$PROJ"; exit 51
  fi
  if [[ ! -f .do-it/runtime/.gitignore ]]; then
    rm -rf "$PROJ"; exit 52
  fi
  STATUS="$(git status --porcelain --untracked-files=all)"
  if [[ -n "$STATUS" ]]; then
    printf 'runtime git status: %s\n' "$STATUS" >&2
    rm -rf "$PROJ"; exit 53
  fi
  rm -rf "$PROJ"
)
case "$?" in
  0)  _pass "parent .gitignore unchanged; runtime state stays invisible to git" ;;
  51) _fail "parent .gitignore was modified" ;;
  52) _fail "self-contained .do-it/runtime/.gitignore was not written" ;;
  53) _fail "runtime marker leaked into git status" ;;
  *)  _fail "subshell crashed (exit=$?)" ;;
esac

# -------------------------------------------------------------------------
echo "Case 5b: KIMI_CODE_HOME session root sits between OPENCODE_DATA and CODEX_HOME"
(
  _isolate_env ""
  unset DO_IT_HOOK_DATA CURSOR_PLUGIN_DATA CLAUDE_PLUGIN_DATA PLUGIN_DATA OPENCODE_DATA
  export KIMI_CODE_HOME=/tmp/doit-test-kimi-home
  export CODEX_HOME=/tmp/doit-test-codex-home
  rm -rf "$KIMI_CODE_HOME" "$CODEX_HOME"
  source "$COMMON"
  d="$(do_it_session_dir kimi-level)"
  [[ "$d" == "$KIMI_CODE_HOME/do-it-data/sessions/kimi-level" ]] || exit 55
  unset KIMI_CODE_HOME
  d="$(do_it_session_dir kimi-level)"
  [[ "$d" == "$CODEX_HOME/do-it-data/sessions/kimi-level" ]] || exit 56
  rm -rf /tmp/doit-test-kimi-home /tmp/doit-test-codex-home
)
case "$?" in
  0)  _pass "KIMI_CODE_HOME wins over CODEX_HOME; CODEX_HOME applies after unset" ;;
  55) _fail "KIMI_CODE_HOME level not used for session dir" ;;
  56) _fail "CODEX_HOME fallback after KIMI_CODE_HOME unset broken" ;;
  *)  _fail "subshell crashed (exit=$?)" ;;
esac

# -------------------------------------------------------------------------
echo "Case 6: do_it_emit_context emits valid JSON without jq"
(
  _isolate_env "/tmp/doit-test-emitjq"
  source "$COMMON"
  # Force the jq-free fallback path regardless of whether jq is installed.
  DO_IT_HAVE_JQ=0
  ctx="$(do_it_emit_context "Stop" "$(printf 'line one\ttab\nline two \\ end')")"
  [[ -n "$ctx" ]] || exit 62
  if command -v jq >/dev/null 2>&1; then
    printf '%s' "$ctx" | jq -e '.hookSpecificOutput.hookEventName == "Stop"' >/dev/null 2>&1 || exit 64
  fi
)
case "$?" in
  0)  _pass "jq-free emit fallbacks produce valid JSON" ;;
  62) _fail "do_it_emit_context produced no output without jq" ;;
  64) _fail "do_it_emit_context fallback is not valid context JSON" ;;
  *)  _fail "subshell crashed (exit=$?)" ;;
esac

# -------------------------------------------------------------------------
echo "Case 7: do_it_prune_stale_sessions removes stale dirs, keeps fresh + self"
(
  _isolate_env "/tmp/doit-test-prune"
  source "$COMMON"
  base="${DO_IT_HOOK_DATA}/sessions"
  mkdir -p "$base/stale" "$base/fresh"
  echo x > "$base/stale/state.json"
  echo x > "$base/fresh/state.json"
  # Year-2000 timestamp is portable across GNU and BSD touch.
  touch -t 200001010000 "$base/stale/state.json" "$base/stale"
  do_it_prune_stale_sessions "cursess"
  [[ -e "$base/stale" ]] && exit 71
  [[ -e "$base/fresh" ]] || exit 72
  [[ -f "$(do_it_session_dir cursess)/.pruned" ]] || exit 73
)
case "$?" in
  0)  _pass "stale pruned; fresh and current session kept" ;;
  71) _fail "stale session dir was not pruned" ;;
  72) _fail "fresh session dir was wrongly pruned" ;;
  73) _fail ".pruned marker not written for current session" ;;
  *)  _fail "subshell crashed (exit=$?)" ;;
esac

# -------------------------------------------------------------------------
echo "Case 8: do_it_parse_skip_targets — partial vs full skip"
(
  _isolate_env "/tmp/doit-test-parse-skip"
  source "$COMMON"
  source "$REPO_ROOT/hooks/lib/keywords.sh"
  out=$(do_it_parse_skip_targets "please skip grill only")
  [[ "$out" == "grill" ]] || { echo "got: $out" >&2; exit 81; }
  out=$(do_it_parse_skip_targets "skip grill and skip gate thanks")
  case "$out" in
    *grill*) ;;
    *) exit 82 ;;
  esac
  case "$out" in
    *gate*) ;;
    *) exit 83 ;;
  esac
  case "$out" in
    *router*) exit 84 ;;
  esac
  out=$(do_it_parse_skip_targets "yolo 直接做")
  for f in router grill gate; do
    case " $out " in
      *" $f "*) ;;
      *) echo "missing $f in: $out" >&2; exit 85 ;;
    esac
  done
  out=$(do_it_parse_skip_targets "see commands/do-it-skip.md for bypass docs")
  [[ -z "$out" ]] || { echo "doc path wrongly full-skipped: $out" >&2; exit 86; }
  out=$(do_it_parse_skip_targets "please don't skip grill on this turn")
  [[ -z "$out" ]] || { echo "negated skip wrongly parsed: $out" >&2; exit 87; }
)
case "$?" in
  0)  _pass "parse_skip_targets honors partial merge and full skip" ;;
  81) _fail "skip grill did not yield grill only" ;;
  82) _fail "merged partial missing grill" ;;
  83) _fail "merged partial missing gate" ;;
  84) _fail "merged partial wrongly included router" ;;
  85) _fail "full skip missing a target" ;;
  86) _fail "commands/do-it-skip.md path triggered full skip" ;;
  87) _fail "negated skip phrase triggered partial skip" ;;
  *)  _fail "subshell crashed (exit=$?)" ;;
esac

# -------------------------------------------------------------------------
echo "Case 9: do_it_prompt_is_question — narrowed suffix (no bare 吗/呢)"
(
  _isolate_env "/tmp/doit-test-question"
  source "$COMMON"
  source "$REPO_ROOT/hooks/lib/keywords.sh"
  if do_it_prompt_is_question "帮我改一下好吗"; then exit 91; fi
  if ! do_it_prompt_is_question "这是什么？"; then exit 92; fi
)
case "$?" in
  0)  _pass "好吗 not question; 这是什么？ is question" ;;
  91) _fail "帮我改一下好吗 wrongly classified as question" ;;
  92) _fail "这是什么？ not classified as question" ;;
  *)  _fail "subshell crashed (exit=$?)" ;;
esac

# -------------------------------------------------------------------------
echo "Case 10: legacy empty skip flag expires by mtime"
(
  _isolate_env "/tmp/doit-test-skip-ttl"
  source "$COMMON"
  dir="$(do_it_session_dir skip-ttl-test)"
  mkdir -p "$dir"
  : > "$dir/skip-gate"
  touch -t 200001010000 "$dir/skip-gate"
  if do_it_check_skip skip-ttl-test gate; then exit 101; fi
  [[ ! -f "$dir/skip-gate" ]] || exit 102
  : > "$dir/skip-gate"
  if ! do_it_check_skip skip-ttl-test gate; then exit 103; fi
)
case "$?" in
  0)  _pass "stale empty skip removed; fresh empty skip honored" ;;
  101) _fail "stale empty skip still honored" ;;
  102) _fail "stale empty skip file not deleted" ;;
  103) _fail "fresh empty skip not honored" ;;
  *)  _fail "subshell crashed (exit=$?)" ;;
esac

# -------------------------------------------------------------------------
echo "Case 11: do_it_clear_skip removes all skip flags"
(
  _isolate_env "/tmp/doit-test-clear-skip"
  source "$COMMON"
  do_it_write_skip clear-test router grill gate
  dir="$(do_it_session_dir clear-test)"
  for f in router grill gate; do
    [[ -f "$dir/skip-$f" ]] || exit 111
  done
  do_it_clear_skip clear-test
  for f in router grill gate; do
    if [[ -f "$dir/skip-$f" ]]; then exit 112; fi
  done
)
case "$?" in
  0)  _pass "clear_skip removes router/grill/gate flags" ;;
  111) _fail "write_skip did not create flags" ;;
  112) _fail "clear_skip left a flag behind" ;;
  *)  _fail "subshell crashed (exit=$?)" ;;
esac
# -------------------------------------------------------------------------
echo "Case 11b: prompt-scoped skip markers survive concurrent turns and malformed Stop cleanup"
(
  _isolate_env "/tmp/doit-test-skip-scope"
  source "$COMMON"
  export DO_IT_SKIP_PROMPT="skip gate alpha"
  export DO_IT_PROMPT_TURN_TOKEN="turn-a"
  do_it_write_skip scoped gate || exit 113
  export DO_IT_SKIP_PROMPT="skip gate beta"
  export DO_IT_PROMPT_TURN_TOKEN="turn-b"
  do_it_write_skip scoped gate || exit 114
  do_it_check_skip scoped gate || exit 115
  export DO_IT_SKIP_PROMPT="skip gate alpha"
  do_it_clear_skip scoped || exit 116
  export DO_IT_SKIP_PROMPT="skip gate beta"
  do_it_check_skip scoped gate || exit 117
  DO_IT_SKIP_PROMPT="" do_it_clear_skip scoped || exit 118
  do_it_check_skip scoped gate || exit 119

  export DO_IT_SKIP_PROMPT="identical skip gate"
  export DO_IT_PROMPT_TURN_TOKEN="same-a"
  do_it_write_skip identical gate || exit 120
  export DO_IT_PROMPT_TURN_TOKEN="same-b"
  do_it_write_skip identical gate || exit 121
  do_it_clear_skip identical || exit 122
  do_it_check_skip identical gate || exit 123
  do_it_clear_skip identical || exit 124
  if do_it_check_skip identical gate; then exit 125; fi

  # Host-normalized transcript copies (trailing space / newline) must still
  # correlate with the prompt-scoped marker written from the raw payload.
  export DO_IT_SKIP_PROMPT="skip gate alpha"
  export DO_IT_PROMPT_TURN_TOKEN="norm-a"
  do_it_write_skip normalized gate || exit 126
  export DO_IT_SKIP_PROMPT="skip gate alpha "
  do_it_check_skip normalized gate || exit 127
  export DO_IT_SKIP_PROMPT=$'skip gate alpha\n'
  do_it_check_skip normalized gate || exit 128
  export DO_IT_SKIP_PROMPT="skip gate beta"
  if do_it_check_skip normalized gate; then exit 129; fi
  export DO_IT_SKIP_PROMPT="skip gate alpha"
  do_it_clear_skip normalized || exit 130
  if do_it_check_skip normalized gate; then exit 131; fi

  mv() { return 1; }
  export DO_IT_SKIP_PROMPT="write failure"
  export DO_IT_PROMPT_TURN_TOKEN="write-failure"
  if do_it_write_skip write-failure gate; then exit 132; fi
)
case "$?" in
  0)   _pass "prompt and turn scoped skip markers consume independently" ;;
  113|114|120|121) _fail "prompt-scoped skip marker write failed" ;;
  115|117|119|123) _fail "prompt-scoped skip marker was lost across turns" ;;
  116|118|122|124) _fail "prompt-scoped skip cleanup failed" ;;
  125) _fail "identical prompt cleanup consumed fewer than two markers" ;;
  126|130) _fail "normalized skip marker write/cleanup failed" ;;
  127|128) _fail "trailing-whitespace prompt copy did not match its marker" ;;
  129) _fail "different prompt matched the normalized marker" ;;
  131) _fail "normalized cleanup left the marker behind" ;;
  132) _fail "skip marker write failure was swallowed" ;;
  *)   _fail "prompt-scoped skip case crashed (exit=$?)" ;;
esac


# -------------------------------------------------------------------------
echo "Case 12: do_it_prompt_has_word matches ASCII words (incl. MSYS path)"
(
  source "$COMMON"
  do_it_prompt_has_word "please implement the fix" "implement" || exit 11
  if do_it_prompt_has_word "prefix only" "fix"; then exit 12; fi
  # Simulate Git Bash / MSYS environment where grep -q + pipefail aborts.
  export MSYSTEM=MINGW64
  do_it_prompt_has_word "please implement the fix" "implement" || exit 13
  if do_it_prompt_has_word "prefix only" "fix"; then exit 14; fi
  exit 0
)
case "$?" in
  0)  _pass "word-boundary match works; MSYS path uses pure bash" ;;
  11) _fail "implement should match" ;;
  12) _fail "fix matched prefix" ;;
  13) _fail "MSYS implement should match" ;;
  14) _fail "MSYS fix matched prefix" ;;
  *)  _fail "subshell crashed (exit=$?)" ;;
esac

# -------------------------------------------------------------------------
echo "Case 13: local keyword TSV accepts only known tables and flags"
(
  _isolate_env "/tmp/doit-test-local-keywords-valid"
  source "$COMMON"
  source "$REPO_ROOT/hooks/lib/keywords.sh"
  proj="$(mktemp -d)"
  mkdir -p "$proj/.do-it"
  printf '%s\n' \
    $'intent-verbs\tcalibrate' \
    $'heavy-signals\tcutover\ttrailing-ws' \
    $'question-hints\twalk me through' \
    > "$proj/.do-it/keywords.local.tsv"
  do_it_source_local_keywords "$proj"
  do_it_prompt_has_any "calibrate src/app.ts" DO_IT_INTENT_VERBS || exit 131
  found_cutover=0
  for word in "${DO_IT_HEAVY_SIGNALS[@]}"; do
    [[ "$word" == "cutover " ]] && found_cutover=1
  done
  [[ "$found_cutover" -eq 1 ]] || exit 132
  do_it_prompt_has_any "walk me through this" DO_IT_QUESTION_HINTS || exit 133
  rm -rf "$proj"
)
case "$?" in
  0)   _pass "legal local TSV rows append to known keyword tables" ;;
  131) _fail "legal intent-verbs row was not loaded" ;;
  132) _fail "legal flagged heavy-signals row was not loaded" ;;
  133) _fail "legal question-hints row was not loaded" ;;
  *)   _fail "legal local TSV parser crashed (exit=$?)" ;;
esac

# -------------------------------------------------------------------------
echo "Case 14: local keyword TSV rejects malformed rows without executing data"
(
  _isolate_env "/tmp/doit-test-local-keywords-invalid"
  source "$COMMON"
  source "$REPO_ROOT/hooks/lib/keywords.sh"
  proj="$(mktemp -d)"
  marker="$proj/side-effect"
  mkdir -p "$proj/.do-it"
  printf '%s\n' \
    $'unknown-table\tbadword' \
    $'intent-verbs\tbadflag\teval' \
    $'intent-verbs\ttoo\tmany\tcolumns' \
    $'intent-verbs\t' \
    > "$proj/.do-it/keywords.local.tsv"
  printf 'intent-verbs\t%s\n' "\$(touch $marker)" \
    >> "$proj/.do-it/keywords.local.tsv"
  warning_file="$proj/warning"
  do_it_source_local_keywords "$proj" 2> "$warning_file"
  warning="$(cat "$warning_file")"
  [[ ! -e "$marker" ]] || exit 141
  found_literal=0
  for word in "${DO_IT_INTENT_VERBS[@]}"; do
    [[ "$word" == "\$(touch $marker)" ]] && found_literal=1
  done
  [[ "$found_literal" -eq 1 ]] || exit 142
  if do_it_prompt_has_any "badword badflag too" DO_IT_INTENT_VERBS; then exit 143; fi
  [[ "$warning" == *"ignored invalid"* ]] || exit 144
  rm -rf "$proj"
)
case "$?" in
  0)   _pass "malformed rows are skipped and shell-shaped terms stay inert" ;;
  141) _fail "TSV content executed a side effect" ;;
  142) _fail "shell-shaped TSV term was not treated as literal data" ;;
  143) _fail "invalid TSV row reached a keyword array" ;;
  144) _fail "invalid TSV rows emitted no migration/config warning" ;;
  *)   _fail "invalid local TSV parser crashed (exit=$?)" ;;
esac

# -------------------------------------------------------------------------
echo "Case 15: legacy keywords.local.sh is inert and warns to migrate"
(
  _isolate_env "/tmp/doit-test-local-keywords-legacy"
  source "$COMMON"
  source "$REPO_ROOT/hooks/lib/keywords.sh"
  proj="$(mktemp -d)"
  marker="$proj/legacy-side-effect"
  mkdir -p "$proj/.do-it"
  printf 'touch %q\nDO_IT_INTENT_VERBS+=("legacyword")\n' "$marker" \
    > "$proj/.do-it/keywords.local.sh"
  warning="$(do_it_source_local_keywords "$proj" 2>&1)"
  [[ ! -e "$marker" ]] || exit 151
  if do_it_prompt_has_any "legacyword" DO_IT_INTENT_VERBS; then exit 152; fi
  [[ "$warning" == *"keywords.local.sh"* && "$warning" == *"keywords.local.tsv"* ]] || exit 153
  rm -rf "$proj"
)
case "$?" in
  0)   _pass "legacy executable override is ignored with migration warning" ;;
  151) _fail "legacy keywords.local.sh executed a side effect" ;;
  152) _fail "legacy shell override changed keyword arrays" ;;
  153) _fail "legacy shell override emitted no migration warning" ;;
  *)   _fail "legacy override handling crashed (exit=$?)" ;;
esac

# -------------------------------------------------------------------------
echo "Case 16: Kimi protocol helpers (prompt array + plain-text emit)"
(
  _isolate_env "/tmp/doit-test-kimi-proto"
  source "$COMMON"
  # Kimi Code sends prompt as a ContentPart array; other hosts send a string.
  arr='{"prompt":[{"type":"text","text":"line one"},{"type":"text","text":"line two"}]}'
  got="$(do_it_json_get_prompt "$arr")"
  [[ "$got" == $'line one\nline two' ]] || exit 161
  [[ "$(do_it_json_get_prompt '{"prompt":"plain prompt"}')" == "plain prompt" ]] || exit 162
  [[ -z "$(do_it_json_get_prompt '{}')" ]] || exit 163
  # Emit: Kimi gets plain text (its stdout goes verbatim into context);
  # Claude-shaped hosts keep the hookSpecificOutput JSON envelope.
  export KIMI_CODE_HOME="/tmp/doit-test-kimi-proto/home"
  out_kimi="$(do_it_emit_context UserPromptSubmit "kimi note")"
  [[ "$out_kimi" == "kimi note" ]] || exit 164
  unset KIMI_CODE_HOME
  out_json="$(do_it_emit_context UserPromptSubmit "json note")"
  printf '%s' "$out_json" | jq -e '.hookSpecificOutput.additionalContext == "json note"' >/dev/null || exit 165
  exit 0
)
case "$?" in
  0)   _pass "prompt array extracts; emit switches plain text vs JSON envelope" ;;
  161) _fail "ContentPart array prompt not extracted" ;;
  162) _fail "plain string prompt broke" ;;
  163) _fail "missing prompt not empty" ;;
  164) _fail "kimi emit not plain text" ;;
  165) _fail "non-kimi emit lost JSON envelope" ;;
  *)   _fail "kimi proto case crashed (exit=$?)" ;;
esac

# -------------------------------------------------------------------------
echo "Case 16b: jq-free JSON fallback preserves session and prompt payloads"
(
  _isolate_env "/tmp/doit-test-json-fallback"
  DO_IT_FORCE_NO_JQ=1
  export DO_IT_FORCE_NO_JQ
  source "$COMMON"
  raw='{"session_id":"session-fallback","cwd":"/tmp/work tree","nested":{"value":"ok"},"prompt":[{"type":"text","text":"line one"},{"type":"text","text":"line two"}]}'
  [[ "$(do_it_json_get "$raw" session_id)" == "session-fallback" ]] || exit 166
  [[ "$(do_it_json_get "$raw" cwd)" == "/tmp/work tree" ]] || exit 167
  [[ "$(do_it_json_get_nested "$raw" nested.value)" == "ok" ]] || exit 168
  [[ "$(do_it_json_get_prompt "$raw")" == $'line one\nline two' ]] || exit 169
)
case "$?" in
  0)   _pass "jq-free fallback decodes scalar, nested, and prompt-array fields" ;;
  166) _fail "jq-free session_id decode failed" ;;
  167) _fail "jq-free cwd decode failed" ;;
  168) _fail "jq-free nested decode failed" ;;
  169) _fail "jq-free prompt-array decode failed" ;;
  *)   _fail "jq-free JSON fallback crashed (exit=$?)" ;;
esac

# -------------------------------------------------------------------------
echo "Case 17: core-rule registry failures are distinct and never partial"
(
  _isolate_env "/tmp/doit-test-core-registry"
  source "$COMMON"
  registry_dir="$(mktemp -d)"

  _DO_IT_RULES_DATA="$registry_dir/missing.tsv"
  out="$(do_it_core_rule r-verify)"; status=$?
  [[ "$status" -eq "$DO_IT_CORE_RULES_UNAVAILABLE" && -z "$out" ]] || exit 171

  printf '%s\n' $'r-evidence\tvalid prefix\tmodes\tUserPromptSubmit' \
    $'broken\trow\tonly-three' > "$registry_dir/malformed.tsv"
  _DO_IT_RULES_DATA="$registry_dir/malformed.tsv"
  out="$(do_it_core_rules_for UserPromptSubmit)"; status=$?
  [[ "$status" -eq "$DO_IT_CORE_RULES_MALFORMED" && -z "$out" ]] || exit 172

  printf '%s\n' \
    $'r-route\troute text\tmodes\tnone' \
    $'r-evidence\tvalid text\tmodes\tUserPromptSubmit' \
    $'r-scope\tscope text\tmodes\tUserPromptSubmit' \
    $'r-verify\tverify text\tmodes\tUserPromptSubmit,Stop' \
    $'r-uncertainty\tuncertainty text\tmodes\tUserPromptSubmit' \
    $'r-boundary\tboundary text\tmodes\tUserPromptSubmit' \
    $'r-report\treport text\tmodes\tnone' \
    $'r-recovery\trecovery text\tmodes\tnone' > "$registry_dir/valid.tsv"
  _DO_IT_RULES_DATA="$registry_dir/valid.tsv"
  out="$(do_it_core_rule r-unknown)"; status=$?
  [[ "$status" -eq "$DO_IT_CORE_RULES_UNKNOWN" && -z "$out" ]] || exit 173
  [[ "$(do_it_core_rule r-evidence)" == "valid text" ]] || exit 174

  printf '%s\n' \
    $'r-route\troute text\tmodes\tnone' \
    $'r-evidence\tpartial rule must not leak\tmodes\tUserPromptSubmit' \
    $'r-scope\tscope text\tmodes\tUserPromptSubmit' \
    $'r-verify\tverify text\tmodes\tUserPromptSubmit,Stop' \
    $'r-uncertainty\tuncertainty text\tmodes\tUserPromptSubmit' \
    $'r-boundary\tboundary text\tmodes\tUserPromptSubmit' \
    $'r-report\treport text\tmodes\tnone' > "$registry_dir/incomplete.tsv"
  _DO_IT_RULES_DATA="$registry_dir/incomplete.tsv"
  out="$(do_it_core_rules_for UserPromptSubmit)"; status=$?
  [[ "$status" -eq "$DO_IT_CORE_RULES_MALFORMED" && -z "$out" ]] || exit 175

  rm -rf "$registry_dir"
)
case "$?" in
  0)   _pass "registry reports unavailable, malformed, and unknown without partial output" ;;
  171) _fail "missing registry status/output contract failed" ;;
  172) _fail "malformed registry leaked partial output or wrong status" ;;
  173) _fail "unknown rule status/output contract failed" ;;
  174) _fail "valid rule text changed" ;;
  175) _fail "registry missing one required rule leaked partial output or wrong status" ;;
  *)   _fail "core registry case crashed (exit=$?)" ;;
esac

# -------------------------------------------------------------------------
echo
echo "Summary: $PASS passed, $FAIL failed"
if [[ "$FAIL" -gt 0 ]]; then
  exit 1
fi
echo "ok: $PASS tests"
