#!/usr/bin/env bash
# Live-network admission: Claude PreToolUse ask in thin/shadow; silent in
# legacy; hosts that cannot veto remind. Never echoes the raw command.

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
HOOK="$REPO_ROOT/hooks/network-admission.sh"
[[ -f "$HOOK" ]] || { echo "FAIL: missing $HOOK" >&2; exit 1; }

PASS=0
FAIL=0
TMP_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/doit-network-admission.XXXXXX")"

cleanup() { rm -rf "$TMP_ROOT"; }
trap cleanup EXIT

_pass() { echo "  ok: $1"; PASS=$((PASS + 1)); }
_fail() { echo "  FAIL: $1" >&2; FAIL=$((FAIL + 1)); }

_isolate() {
  unset KIMI_CODE_HOME KIMI_PLUGIN_ROOT CURSOR_PLUGIN_ROOT CURSOR_PLUGIN_DATA
  unset DO_IT_EVENT_HOST CODEX_HOME PLUGIN_ROOT DO_IT_NETWORK_ADMISSION
  unset DO_IT_DEBUG DO_IT_CONTEXT_OUTPUT CLAUDE_PLUGIN_ROOT CLAUDE_PLUGIN_DATA
  unset DO_IT_ROUTER_MODE
  export DO_IT_HOOK_DATA="$TMP_ROOT/data"
  mkdir -p "$DO_IT_HOOK_DATA"
}

_payload() {
  local cmd="$1"
  jq -nc --arg cmd "$cmd" '{tool_name:"Bash",tool_input:{command:$cmd}}'
}

_run() {
  local stdout_file="$1" stderr_file="$2" cmd="$3"
  _payload "$cmd" | bash "$HOOK" >"$stdout_file" 2>"$stderr_file"
  return $?
}

_assert_exit0() {
  local label="$1" status="$2"
  if [[ "$status" -eq 0 ]]; then
    _pass "$label"
  else
    _fail "$label (exit $status)"
  fi
}

_assert_empty() {
  local label="$1" output="$2"
  if [[ -z "$output" ]]; then
    _pass "$label"
  else
    _fail "$label (got: $output)"
  fi
}

_assert_ask() {
  local label="$1" output="$2"
  if printf '%s' "$output" | jq -e '
    .hookSpecificOutput.hookEventName == "PreToolUse"
    and .hookSpecificOutput.permissionDecision == "ask"
    and .hookSpecificOutput.permissionDecisionReason == "do-it: live network request needs explicit user authorization."
  ' >/dev/null 2>&1; then
    _pass "$label"
  else
    _fail "$label (got: $output)"
  fi
}

_assert_no_command() {
  local label="$1" blob="$2" cmd="$3"
  if [[ -n "$cmd" && "$blob" == *"$cmd"* ]]; then
    _fail "$label echoed the command"
    return
  fi
  if [[ "$blob" == *"example.com"* || "$blob" == *"example.invalid"* ]]; then
    _fail "$label leaked a URL"
    return
  fi
  _pass "$label does not print the command or URL"
}

echo "Case 1: legacy mode + curl example.com is silent"
_isolate
export DO_IT_ROUTER_MODE=legacy
export CLAUDE_PLUGIN_ROOT="$REPO_ROOT"
cmd='curl https://example.com/'
_run "$TMP_ROOT/legacy.out" "$TMP_ROOT/legacy.err" "$cmd"
_assert_exit0 "legacy exits 0" "$?"
_assert_empty "legacy stdout empty" "$(cat "$TMP_ROOT/legacy.out")"
_assert_no_command "legacy" "$(cat "$TMP_ROOT/legacy.out")$(cat "$TMP_ROOT/legacy.err")" "$cmd"

echo "Case 2: thin + curl example.com asks when CLAUDE_PLUGIN_ROOT is set"
_isolate
export DO_IT_ROUTER_MODE=thin
export CLAUDE_PLUGIN_ROOT="$REPO_ROOT"
cmd='curl https://example.com/'
_run "$TMP_ROOT/thin-curl.out" "$TMP_ROOT/thin-curl.err" "$cmd"
_assert_exit0 "thin curl exits 0" "$?"
_assert_ask "thin curl emits Claude ask JSON" "$(cat "$TMP_ROOT/thin-curl.out")"
_assert_no_command "thin curl" "$(cat "$TMP_ROOT/thin-curl.out")$(cat "$TMP_ROOT/thin-curl.err")" "$cmd"

echo "Case 3: thin + LIVE_PING_URL=https://example.invalid node --test asks"
_isolate
export DO_IT_ROUTER_MODE=thin
export CLAUDE_PLUGIN_ROOT="$REPO_ROOT"
cmd='LIVE_PING_URL=https://example.invalid/ping node --test tests/foo.test.js'
_run "$TMP_ROOT/thin-ping.out" "$TMP_ROOT/thin-ping.err" "$cmd"
_assert_exit0 "thin LIVE_PING_URL exits 0" "$?"
_assert_ask "thin LIVE_PING_URL emits Claude ask JSON" "$(cat "$TMP_ROOT/thin-ping.out")"
_assert_no_command "thin LIVE_PING_URL" "$(cat "$TMP_ROOT/thin-ping.out")$(cat "$TMP_ROOT/thin-ping.err")" "$cmd"

echo "Case 4: thin + curl 127.0.0.1 is silent"
_isolate
export DO_IT_ROUTER_MODE=thin
export CLAUDE_PLUGIN_ROOT="$REPO_ROOT"
cmd='curl http://127.0.0.1/'
_run "$TMP_ROOT/loopback.out" "$TMP_ROOT/loopback.err" "$cmd"
_assert_exit0 "loopback exits 0" "$?"
_assert_empty "loopback stdout empty" "$(cat "$TMP_ROOT/loopback.out")"
_assert_no_command "loopback" "$(cat "$TMP_ROOT/loopback.out")$(cat "$TMP_ROOT/loopback.err")" "$cmd"

echo "Case 5: thin + npm install is silent"
_isolate
export DO_IT_ROUTER_MODE=thin
export CLAUDE_PLUGIN_ROOT="$REPO_ROOT"
cmd='npm install'
_run "$TMP_ROOT/npm.out" "$TMP_ROOT/npm.err" "$cmd"
_assert_exit0 "npm install exits 0" "$?"
_assert_empty "npm install stdout empty" "$(cat "$TMP_ROOT/npm.out")"
_assert_no_command "npm install" "$(cat "$TMP_ROOT/npm.out")$(cat "$TMP_ROOT/npm.err")" "$cmd"

echo "Case 6: thin + git clone https://github.com/x/y is silent"
_isolate
export DO_IT_ROUTER_MODE=thin
export CLAUDE_PLUGIN_ROOT="$REPO_ROOT"
cmd='git clone https://github.com/x/y'
_run "$TMP_ROOT/git.out" "$TMP_ROOT/git.err" "$cmd"
_assert_exit0 "git clone exits 0" "$?"
_assert_empty "git clone stdout empty" "$(cat "$TMP_ROOT/git.out")"
if [[ "$(cat "$TMP_ROOT/git.out")$(cat "$TMP_ROOT/git.err")" == *"github.com"* || "$(cat "$TMP_ROOT/git.out")$(cat "$TMP_ROOT/git.err")" == *"$cmd"* ]]; then
  _fail "git clone leaked the command or URL"
else
  _pass "git clone does not print the command or URL"
fi

echo "Case 7: malformed stdin exits 0"
_isolate
export DO_IT_ROUTER_MODE=thin
export CLAUDE_PLUGIN_ROOT="$REPO_ROOT"
printf 'not-json {' | bash "$HOOK" >"$TMP_ROOT/malformed.out" 2>"$TMP_ROOT/malformed.err"
_assert_exit0 "malformed stdin exits 0" "$?"

echo "Case 8: observe env reminds instead of asking"
_isolate
export DO_IT_ROUTER_MODE=thin
export CLAUDE_PLUGIN_ROOT="$REPO_ROOT"
export DO_IT_NETWORK_ADMISSION=observe
cmd='curl https://example.com/'
_run "$TMP_ROOT/observe.out" "$TMP_ROOT/observe.err" "$cmd"
_assert_exit0 "observe exits 0" "$?"
out="$(cat "$TMP_ROOT/observe.out")"
if [[ "$out" == *"permissionDecision"* ]]; then
  _fail "observe must not emit a veto"
else
  _pass "observe does not ask"
fi
if [[ "$out" == *"additionalContext"* || "$out" == *"r-boundary"* ]]; then
  _pass "observe emits a reminder"
else
  _fail "observe stdout missing reminder (got: $out)"
fi
_assert_no_command "observe" "$out$(cat "$TMP_ROOT/observe.err")" "$cmd"

echo "Case 9: host that cannot veto reminds"
_isolate
export DO_IT_ROUTER_MODE=thin
cmd='curl https://example.com/'
_run "$TMP_ROOT/remind.out" "$TMP_ROOT/remind.err" "$cmd"
_assert_exit0 "cannot-veto exits 0" "$?"
out="$(cat "$TMP_ROOT/remind.out")"
if [[ "$out" == *"permissionDecision"* ]]; then
  _fail "cannot-veto host must not ask"
else
  _pass "cannot-veto does not ask"
fi
if [[ "$out" == *"additionalContext"* || "$out" == *"r-boundary"* ]]; then
  _pass "cannot-veto emits a reminder"
else
  _fail "cannot-veto stdout missing reminder (got: $out)"
fi
_assert_no_command "cannot-veto" "$out$(cat "$TMP_ROOT/remind.err")" "$cmd"

if [[ "$FAIL" -ne 0 ]]; then
  echo "FAIL: $FAIL test(s) failed" >&2
  exit 1
fi

echo "ok: $PASS tests"
