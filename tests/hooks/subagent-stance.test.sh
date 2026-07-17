#!/usr/bin/env bash
# Smoke tests for hooks/subagent-stance.sh — child agents receive a compact
# ownership and confirmation boundary while parent turns remain quiet.

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
STANCE="$REPO_ROOT/hooks/subagent-stance.sh"
ROUTER="$REPO_ROOT/hooks/router.sh"
[[ -x "$STANCE" || -f "$STANCE" ]] || { echo "FAIL: missing $STANCE" >&2; exit 1; }
[[ -x "$ROUTER" || -f "$ROUTER" ]] || { echo "FAIL: missing $ROUTER" >&2; exit 1; }

PASS=0
FAIL=0

_pass() { echo "  ok: $1"; PASS=$((PASS + 1)); }
_fail() { echo "  FAIL: $1" >&2; FAIL=$((FAIL + 1)); }

_isolate() {
  export DO_IT_HOOK_DATA="$1"
  rm -rf "$DO_IT_HOOK_DATA"
  unset CLAUDE_PLUGIN_DATA CODEX_HOME KIMI_CODE_HOME KIMI_PLUGIN_ROOT CLAUDE_AGENT_CONTEXT CLAUDE_SUBAGENT
  unset DO_IT_DEBUG
}

_run_stance() {
  local session_id="$1" transcript_path="$2"
  jq -nc --arg sid "$session_id" --arg transcript "$transcript_path" \
    '{session_id:$sid, transcript_path:$transcript, cwd:"/tmp"}' \
    | bash "$STANCE"
}

_run_router() {
  local session_id="$1" prompt="$2"
  jq -nc --arg sid "$session_id" --arg prompt "$prompt" \
    '{session_id:$sid, prompt:$prompt, cwd:"/tmp"}' \
    | bash "$ROUTER"
}

# -------------------------------------------------------------------------
echo "Case 1: parent context remains quiet"
_isolate /tmp/doit-subagent-stance-c1
out="$(_run_stance c1 /tmp/parent-transcript.jsonl)"
if [[ -z "$out" ]]; then _pass "parent context receives no child reminder"; else _fail "parent context leaked child reminder: $out"; fi

# -------------------------------------------------------------------------
echo "Case 2: child gets ownership and explicit confirmation boundary once"
_isolate /tmp/doit-subagent-stance-c2
out="$(_run_stance c2 /tmp/agents/child-transcript.jsonl)"
if printf '%s' "$out" | jq -e '
  .hookSpecificOutput.hookEventName == "UserPromptSubmit"
  and (.hookSpecificOutput.additionalContext | contains("within stated ownership"))
  and (.hookSpecificOutput.additionalContext | contains("Before external writes, destructive or irreversible actions, material cost, or material scope expansion"))
  and (.hookSpecificOutput.additionalContext | contains("ask the parent to obtain confirmation"))
' >/dev/null 2>&1; then
  _pass "child reminder states ownership and confirmation boundary"
else
  _fail "child reminder missing authority boundary: $out"
fi

out="$(_run_stance c2 /tmp/agents/child-transcript.jsonl)"
if [[ -z "$out" ]]; then _pass "child reminder is emitted once per session"; else _fail "child reminder repeated: $out"; fi

# -------------------------------------------------------------------------
echo "Case 3: child receives an active no-write boundary from shared session state"
_isolate /tmp/doit-subagent-stance-c3
_run_router c3 "先不改代码；先审查 src/child.ts。" >/dev/null
out="$(_run_stance c3 /tmp/agents/child-no-write-transcript.jsonl)"
if printf '%s' "$out" | jq -e '
  .hookSpecificOutput.additionalContext | contains("no-write boundary") and contains("do not edit")
' >/dev/null 2>&1; then
  _pass "child reminder preserves the shared-session no-write boundary"
else
  _fail "child reminder omitted no-write boundary: $out"
fi

if [[ "$FAIL" -ne 0 ]]; then
  echo "FAIL: $FAIL test(s) failed" >&2
  exit 1
fi

echo "ok: $PASS tests"
