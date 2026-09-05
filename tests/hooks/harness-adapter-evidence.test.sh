#!/usr/bin/env bash
# Host-shaped payloads must write the same evidence-event schema.
# Fail-open. Gaps are partial/unavailable, never complete.

set -uo pipefail
export DO_IT_EVIDENCE_MODE=observe

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
OBSERVER="$REPO_ROOT/hooks/evidence-observer.sh"
VALIDATOR="$REPO_ROOT/scripts/validate-runtime-events.mjs"
HOOKS_JSON="$REPO_ROOT/hooks/hooks.json"
CODEX_HOOKS="$REPO_ROOT/install/codex-hooks.json"
CURSOR_HOOKS="$REPO_ROOT/install/cursor-hooks.json"
KIMI_PLUGIN="$REPO_ROOT/kimi.plugin.json"
RUN_HOOK="$REPO_ROOT/hooks/run-hook.cmd"

PASS=0
FAIL=0
TMP_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/doit-harness-evidence.XXXXXX")"
export HOME="$TMP_ROOT/home"
mkdir -p "$HOME"
export GIT_CONFIG_GLOBAL=/dev/null
export GIT_CONFIG_SYSTEM=/dev/null
unset GIT_DIR GIT_WORK_TREE
unset DO_IT_EVENT_ACCEPTANCE_HINT DO_IT_EVENT_COMMAND DO_IT_EVENT_EXIT_CODE
unset DO_IT_EVENT_TASK_ID DO_IT_EVENT_HOST DO_IT_EVENT_FORCE_COVERAGE
export CLAUDE_PLUGIN_DATA="$TMP_ROOT/plugin-data"
mkdir -p "$CLAUDE_PLUGIN_DATA"

cleanup() { chmod -R u+w "$TMP_ROOT" 2>/dev/null || true; rm -rf "$TMP_ROOT"; }
trap cleanup EXIT

_pass() { echo "  ok: $1"; PASS=$((PASS + 1)); }
_fail() { echo "  FAIL: $1" >&2; FAIL=$((FAIL + 1)); }

_setup_repo() {
  local dir
  dir="$(mktemp -d "$TMP_ROOT/repo.XXXXXX")"
  git -C "$dir" init -q
  git -C "$dir" config user.email t@e.com
  git -C "$dir" config user.name t
  printf 'base\n' > "$dir/README"
  git -C "$dir" add README
  git -C "$dir" commit -q -m base
  printf '%s' "$dir"
}

_last_event() {
  local repo="$1" log
  log="$repo/.do-it/runtime/events/evidence.jsonl"
  [[ -f "$log" ]] || return 1
  tail -n1 "$log"
}

_event_count() {
  local log="$1/.do-it/runtime/events/evidence.jsonl"
  [[ -f "$log" ]] || { printf '0'; return 0; }
  wc -l < "$log" | tr -d ' '
}

_assert_schema() {
  local line="$1" kind="$2"
  [[ "$(jq -r .schema <<<"$line")" == "1" ]] || return 1
  [[ "$(jq -r .kind <<<"$line")" == "$kind" ]] || return 2
  [[ "$(jq -r .source <<<"$line")" == "observed" ]] || return 3
  jq -e 'has("event_id") and has("recorded_at") and has("host") and has("worktree")' \
    <<<"$line" >/dev/null || return 4
  jq -e 'has("acceptance_hint")' <<<"$line" >/dev/null && return 5
  local coverage
  coverage="$(jq -r .worktree.coverage <<<"$line")"
  case "$coverage" in
    complete|partial|unavailable) ;;
    *) return 6 ;;
  esac
  return 0
}

echo "Case 1: Claude/Cursor/Pi/Kimi edit payloads share schema 1"
(
  _observe_edit() {
    local repo payload
    repo="$(_setup_repo)"
    payload="$(jq -nc --arg cwd "$repo" --arg file "$repo/README" "$1")"
    printf '%s\n' "$payload" | bash "$OBSERVER" >/dev/null
    line="$(_last_event "$repo")" || return 12
    _assert_schema "$line" edit || return $((20 + $?))
    node "$VALIDATOR" "$repo/.do-it/runtime/events/evidence.jsonl" >/dev/null || return 19
  }
  _observe_edit '{session_id:"claude",cwd:$cwd,tool_name:"Edit",tool_input:{file_path:$file}}' || exit $?
  _observe_edit '{conversation_id:"cursor",cwd:$cwd,hook_event_name:"afterFileEdit",file_path:$file}' || exit $?
  _observe_edit '{session_id:"pi",cwd:$cwd,tool_name:"Edit",tool_input:{path:$file}}' || exit $?
  _observe_edit '{session_id:"kimi",cwd:$cwd,hook_event_name:"PostToolUse",tool_name:"Write",tool_input:{file_path:$file}}' || exit $?

  repo="$(_setup_repo)"
  file="$repo/README"
  claude="$(jq -nc --arg cwd "$repo" --arg file "$file" \
    '{session_id:"dup",cwd:$cwd,tool_name:"StrReplace",tool_input:{file_path:$file}}')"
  cursor="$(jq -nc --arg cwd "$repo" --arg file "$file" \
    '{conversation_id:"dup",cwd:$cwd,hook_event_name:"afterFileEdit",file_path:$file}')"
  printf '%s\n' "$claude" | bash "$OBSERVER" >/dev/null
  printf '%s\n' "$cursor" | bash "$OBSERVER" >/dev/null
  count="$(_event_count "$repo")"
  [[ "$count" == "1" ]] || exit 11
)
case "$?" in
  0)  _pass "host edit payloads share schema and Cursor afterFileEdit is deduped" ;;
  11) _fail "edit event count mismatch (Cursor postToolUse/afterFileEdit not deduped?)" ;;
  12) _fail "no edit ledger row" ;;
  19) _fail "edit events failed schema validation" ;;
  *)  _fail "edit schema case failed (exit=$?)" ;;
esac

echo "Case 2: shell/test payloads share schema; missing exit is partial"
(
  repo="$(_setup_repo)"
  claude="$(jq -nc --arg cwd "$repo" \
    '{session_id:"s2",cwd:$cwd,tool_name:"Bash",tool_input:{command:"npm test"},tool_response:{exit_code:0,stdout:"ok"}}')"
  opencode="$(jq -nc --arg cwd "$repo" \
    '{session_id:"s2",cwd:$cwd,tool_name:"Bash",tool_input:{command:"npm test"},tool_response:{exit_code:0,output:"ok"}}')"
  pi="$(jq -nc --arg cwd "$repo" \
    '{session_id:"s2",cwd:$cwd,tool_name:"bash",tool_input:{command:"npm test"},tool_response:{exit_code:0,output:"ok"}}')"
  kimi="$(jq -nc --arg cwd "$repo" \
    '{session_id:"s2",cwd:$cwd,hook_event_name:"PostToolUse",tool_name:"Bash",tool_input:{command:"npm test"}}')"
  printf '%s\n' "$claude" | DO_IT_EVENT_HOST=claude bash "$OBSERVER" >/dev/null
  printf '%s\n' "$opencode" | DO_IT_EVENT_HOST=opencode bash "$OBSERVER" >/dev/null
  printf '%s\n' "$pi" | DO_IT_EVENT_HOST=pi bash "$OBSERVER" >/dev/null
  printf '%s\n' "$kimi" | DO_IT_EVENT_HOST=kimi bash "$OBSERVER" >/dev/null
  log="$repo/.do-it/runtime/events/evidence.jsonl"
  [[ "$(_event_count "$repo")" == "4" ]] || exit 31
  kinds="$(jq -r .kind "$log" | tr '\n' ' ')"
  [[ "$kinds" == "test test test test " ]] || exit 32
  hosts="$(jq -r .host "$log" | tr '\n' ' ')"
  [[ "$hosts" == "claude opencode pi kimi " ]] || exit 33
  last="$(tail -n1 "$log")"
  _assert_schema "$last" test || exit $((40 + $?))
  jq -e 'has("exit_code")' <<<"$last" >/dev/null && exit 34
  [[ "$(jq -r .worktree.coverage <<<"$last")" == "partial" ]] || exit 35
  [[ "$(jq -r .summary <<<"$last")" == *"exit unavailable"* ]] || exit 36
  nojq_repo="$(_setup_repo)"
  nojq="$(jq -nc --arg cwd "$nojq_repo" \
    '{session_id:"s2",cwd:$cwd,hook_event_name:"PostToolUse",tool_name:"Bash",tool_input:{command:"npm test"}}')"
  printf '%s\n' "$nojq" | DO_IT_FORCE_NO_JQ=1 DO_IT_EVENT_HOST=kimi bash "$OBSERVER" >/dev/null
  nojq_last="$(_last_event "$nojq_repo")" || exit 91
  jq -e 'has("exit_code")' <<<"$nojq_last" >/dev/null && exit 92
  [[ "$(jq -r .worktree.coverage <<<"$nojq_last")" == "partial" ]] || exit 93
  first="$(head -n1 "$log")"
  [[ "$(jq -r .exit_code <<<"$first")" == "0" ]] || exit 37
  coverage="$(jq -r .worktree.coverage <<<"$first")"
  case "$coverage" in
    complete|partial|unavailable) ;;
    *) exit 38 ;;
  esac
  node "$VALIDATOR" "$log" >/dev/null || exit 39
)
case "$?" in
  0)  _pass "shell facts share schema; Kimi missing exit is partial, never complete" ;;
  31) _fail "shell event count mismatch" ;;
  32) _fail "shell kinds mismatch" ;;
  33) _fail "shell hosts mismatch" ;;
  34) _fail "Kimi missing exit invented exit_code" ;;
  35) _fail "Kimi missing exit did not record partial coverage" ;;
  36) _fail "Kimi missing exit summary was not unavailable" ;;
  91) _fail "no-jq missing exit did not write a row" ;;
  92) _fail "no-jq missing exit invented exit_code" ;;
  93) _fail "no-jq missing exit coverage was not partial" ;;
  37) _fail "Claude test exit_code mismatch" ;;
  38) _fail "Claude test coverage was not a legal value" ;;
  39) _fail "shell events failed schema validation" ;;
  *)  _fail "shell schema case failed (exit=$?)" ;;
esac

echo "Case 3: diagnostic hook remains available without automatic registration"
if grep -q 'evidence-observer.sh' "$RUN_HOOK" && ! grep -q 'evidence-observer' "$HOOKS_JSON" "$CODEX_HOOKS" "$CURSOR_HOOKS" "$KIMI_PLUGIN"; then
  _pass "observer available for explicit diagnostics, absent from default native wiring"
else
  _fail "diagnostic default wiring drift"
fi

echo "Case 4: missing evidence-observer fail-open via run-hook.cmd"
(
  dir="$TMP_ROOT/missing-observer"
  mkdir -p "$dir"
  cp "$RUN_HOOK" "$dir/run-hook.cmd"
  chmod +x "$dir/run-hook.cmd"
  st=0
  bash "$dir/run-hook.cmd" evidence-observer >/dev/null 2>"$TMP_ROOT/missing.err" || st=$?
  [[ "$st" -eq 0 ]] || exit 61
  grep -q 'skipping' "$TMP_ROOT/missing.err" || exit 62
)
case "$?" in
  0)  _pass "run-hook.cmd skips a missing evidence-observer without crashing" ;;
  61) _fail "missing observer returned nonzero" ;;
  62) _fail "missing observer did not diagnose skip" ;;
  *)  _fail "fail-open case failed (exit=$?)" ;;
esac

echo
echo "Summary: $PASS passed, $FAIL failed"
if [[ "$FAIL" -gt 0 ]]; then
  exit 1
fi
echo "ok: $PASS tests"
