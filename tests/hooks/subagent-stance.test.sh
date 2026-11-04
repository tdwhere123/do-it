#!/usr/bin/env bash
# Smoke tests for hooks/subagent-stance.sh — child agents receive a compact
# ownership and confirmation boundary while parent turns remain quiet.

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
STANCE="$REPO_ROOT/hooks/subagent-stance.sh"
KERNEL="$REPO_ROOT/hooks/kernel-context.sh"
[[ -x "$STANCE" || -f "$STANCE" ]] || { echo "FAIL: missing $STANCE" >&2; exit 1; }
[[ -x "$KERNEL" || -f "$KERNEL" ]] || { echo "FAIL: missing $KERNEL" >&2; exit 1; }

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

_run_kernel() {
  local session_id="$1" prompt="$2"
  jq -nc --arg sid "$session_id" --arg prompt "$prompt" \
    '{session_id:$sid, prompt:$prompt, cwd:"/tmp"}' \
    | bash "$KERNEL" >/dev/null
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
  and (.hookSpecificOutput.additionalContext | contains("For external writes, destructive or irreversible actions, material cost, or material scope expansion not already authorized"))
  and (.hookSpecificOutput.additionalContext | contains("ask the parent to obtain confirmation"))
' >/dev/null 2>&1; then
  _pass "child reminder states ownership and confirmation boundary"
else
  _fail "child reminder missing authority boundary: $out"
fi

out="$(_run_stance c2 /tmp/agents/child-transcript.jsonl)"
if [[ -z "$out" ]]; then _pass "child reminder is emitted once per session"; else _fail "child reminder repeated: $out"; fi

# -------------------------------------------------------------------------
echo "Case 3: child preserves explicit boundaries without inferring authority from session state"
_isolate /tmp/doit-subagent-stance-c3
_run_kernel c3 "先不改代码；先审查 src/child.ts。"
out="$(_run_stance c3 /tmp/agents/child-no-write-transcript.jsonl)"
if printf '%s' "$out" | jq -e '
  .hookSpecificOutput.additionalContext | contains("review-only and no-write boundaries") and contains("existing authorization")
' >/dev/null 2>&1; then
  _pass "child reminder preserves explicit assigned boundaries"
else
  _fail "child reminder omitted no-write boundary: $out"
fi

# Pi authority must survive the shell boundary even under a misleading path.
echo "Case 4: explicit Pi root overrides legacy child signals"
_isolate /tmp/doit-subagent-stance-c4
out="$(DO_IT_EVENT_HOST=pi DO_IT_PI_SESSION_ROLE=root PI_SUBAGENT_CHILD=1 _run_stance c4 /tmp/agents/root.jsonl)"
if [[ -z "$out" ]]; then _pass "explicit root is not a child"; else _fail "root was reclassified: $out"; fi
out="$(printf '%s' '{"session_id":"c4","transcript_path":"/tmp/agents/root.jsonl"}' | DO_IT_EVENT_HOST=pi DO_IT_PI_SESSION_ROLE=root bash "$KERNEL")"
if printf '%s' "$out" | jq -e '.hookSpecificOutput.additionalContext | contains("Do-it:")' >/dev/null 2>&1; then
  _pass "explicit root retains Core beneath agents path"
else _fail "root Core was skipped: $out"; fi

echo "Case 5: Pi-specific authority does not alter other host heuristics"
_isolate /tmp/doit-subagent-stance-c5
out="$(DO_IT_EVENT_HOST=claude DO_IT_PI_SESSION_ROLE=root _run_stance c5 /tmp/agents/child.jsonl)"
if [[ -n "$out" ]]; then _pass "other host still recognizes child path"; else _fail "Pi role leaked to another host"; fi

echo "Case 6: Pi delivery owner can retry despite a historical pre-output flag"
_isolate /tmp/doit-subagent-stance-c6
_run_stance c6 /tmp/agents/child.jsonl >/dev/null
for attempt in 1 2; do
  out="$(DO_IT_EVENT_HOST=pi DO_IT_PI_SESSION_ROLE=child _run_stance c6 /tmp/child.jsonl)"
  if [[ -n "$out" ]]; then _pass "Pi attempt $attempt emits for SDK delivery"; else _fail "shell state suppressed Pi retry"; fi
done

if [[ "$FAIL" -ne 0 ]]; then
  echo "FAIL: $FAIL test(s) failed" >&2
  exit 1
fi

echo "ok: $PASS tests"
