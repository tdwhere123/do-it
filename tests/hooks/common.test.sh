#!/usr/bin/env bash
# Smoke tests for hooks/lib/common.sh — locks in the red-team fixes:
#   - flock-missing race no longer evaporates state.json
#   - SESSION_ID path-injection is sanitized
#   - empty SESSION_ID + non-git cwd no longer share a global `nosession` bucket
#   - do_it_in_subagent_context honors Claude and generic transcript_path arguments
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
  unset CLAUDE_PLUGIN_DATA CODEX_HOME transcript_path CLAUDE_AGENT_CONTEXT CLAUDE_SUBAGENT
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
echo "Case 3: flock-missing race — state.json survives 50 concurrent writers"
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
  if command -v jq >/dev/null 2>&1; then
    if ! jq -e . "$SDIR/state.json" >/dev/null 2>&1; then exit 34; fi
  fi
) 2>/dev/null
case "$?" in
  0)  _pass "state.json survived race and contains valid JSON" ;;
  31) _fail "flock stub did not take effect" ;;
  32) _fail "state.json missing after race (file disappeared)" ;;
  33) _fail "state.json present but empty" ;;
  34) _fail "state.json contains malformed JSON" ;;
  *)  _fail "subshell crashed (exit=$?)" ;;
esac

# -------------------------------------------------------------------------
echo "Case 4: do_it_in_subagent_context honors transcript_path argument"
(
  _isolate_env "/tmp/doit-test-subagent"
  source "$COMMON"
  if do_it_in_subagent_context "/Users/x/.claude/projects/foo/transcript.jsonl"; then exit 41; fi
  if ! do_it_in_subagent_context "/Users/x/.claude/agents/foo/transcript.jsonl"; then exit 42; fi
  if ! do_it_in_subagent_context "/Users/x/.claude/projects/foo/subagents/agent-x.jsonl"; then exit 43; fi
  if do_it_in_subagent_context ""; then exit 44; fi
)
case "$?" in
  0)  _pass "argument-based agents/ and subagents/ detection works" ;;
  41) _fail "non-agents transcript triggered subagent context" ;;
  42) _fail "agents/ transcript did not trigger subagent context" ;;
  43) _fail "subagents/ transcript did not trigger subagent context" ;;
  44) _fail "empty arg + no env returned subagent context" ;;
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
echo
echo "Summary: $PASS passed, $FAIL failed"
if [[ "$FAIL" -gt 0 ]]; then
  exit 1
fi
echo "ok: $PASS tests"
