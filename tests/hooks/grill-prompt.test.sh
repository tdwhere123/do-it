#!/usr/bin/env bash
# Heavy-only / explicit grill policy for hooks/grill-prompt.sh.

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
HOOK="$REPO_ROOT/hooks/grill-prompt.sh"
[[ -x "$HOOK" || -f "$HOOK" ]] || { echo "FAIL: missing $HOOK" >&2; exit 1; }

PASS=0
FAIL=0

_pass() { echo "  ok: $1"; PASS=$((PASS + 1)); }
_fail() { echo "  FAIL: $1" >&2; FAIL=$((FAIL + 1)); }

_isolate() {
  export DO_IT_HOOK_DATA="$1"
  rm -rf "$DO_IT_HOOK_DATA"
  mkdir -p "$DO_IT_HOOK_DATA"
  unset CLAUDE_PLUGIN_DATA CODEX_HOME KIMI_CODE_HOME KIMI_PLUGIN_ROOT CLAUDE_AGENT_CONTEXT CLAUDE_SUBAGENT PLUGIN_DATA
  unset DO_IT_DEBUG
}

_set_state() {
  local sid="$1"; shift
  local dir="$DO_IT_HOOK_DATA/sessions/$sid"
  mkdir -p "$dir"
  local obj='{}'
  while (( $# >= 2 )); do
    obj=$(jq -nc --arg k "$1" --arg v "$2" --argjson current "$obj" '$current + {($k): $v}')
    shift 2
  done
  printf '%s' "$obj" > "$dir/state.json"
}

_run() {
  local sid="$1" prompt="$2" cwd="${3:-/tmp}"
  jq -nc --arg sid "$sid" --arg prompt "$prompt" --arg cwd "$cwd" \
    '{session_id:$sid, prompt:$prompt, cwd:$cwd, transcript_path:""}' \
    | bash "$HOOK"
}

echo "Case 1: Standard is silent (no grill body)"
(
  _isolate /tmp/doit-grill-c1
  _set_state g1 tier Standard last_prompt_kind work
  out=$(_run g1 "fix the auth helper")
  [[ "$out" != *"do-it grill"* ]]
)
case "$?" in 0) _pass "Standard stays silent";; *) _fail "Standard silence";; esac

echo "Case 2: Heavy injects grill"
(
  _isolate /tmp/doit-grill-c2
  _set_state g2 tier Heavy last_prompt_kind work
  out=$(_run g2 "ship the release cut")
  [[ "$out" == *"do-it grill"* && "$out" == *"heavy-tier"* ]]
)
case "$?" in 0) _pass "Heavy injects";; *) _fail "Heavy inject";; esac

echo "Case 2b: question label does not suppress Heavy"
(
  _isolate /tmp/doit-grill-c2b
  _set_state g2b tier Heavy last_prompt_kind question
  out=$(_run g2b "Can you deploy production?")
  [[ "$out" == *"do-it grill"* && "$out" == *"heavy-tier"* ]]
)
case "$?" in 0) _pass "Heavy question injects";; *) _fail "Heavy question suppression";; esac

echo "Case 3: explicit grill on Standard"
(
  _isolate /tmp/doit-grill-c3
  _set_state g3 tier Standard last_prompt_kind work
  out=$(_run g3 "please grill this migration plan")
  [[ "$out" == *"do-it grill"* && "$out" == *"explicit"* ]]
)
case "$?" in 0) _pass "explicit grill overrides Standard";; *) _fail "explicit grill";; esac

echo "Case 4: Light never auto-grills without explicit"
(
  _isolate /tmp/doit-grill-c4
  _set_state g4 tier Light last_prompt_kind work
  out=$(_run g4 "typo in README")
  [[ "$out" != *"do-it grill"* ]]
)
case "$?" in 0) _pass "Light stays silent";; *) _fail "Light silence";; esac

echo "Case 5: Kimi ContentPart[] prompt still grills on explicit"
(
  _isolate /tmp/doit-grill-kimi
  export KIMI_CODE_HOME="/tmp/doit-grill-kimi/home"
  _set_state gk tier Standard last_prompt_kind work
  # Array-shaped prompt (Kimi UserPromptSubmit); emit must be plain text.
  out=$(jq -nc '{session_id:"gk",prompt:[{type:"text",text:"please grill this migration plan"}]}' \
    | bash "$HOOK")
  [[ "$out" == *"do-it grill"* ]] && ! printf '%s' "$out" | jq -e . >/dev/null 2>&1
)
case "$?" in 0) _pass "Kimi array prompt grills as plain text";; *) _fail "Kimi array grill";; esac

if [[ "$FAIL" -gt 0 ]]; then
  echo "FAILED: $PASS passed, $FAIL failed" >&2
  exit 1
fi

echo "ok: $PASS tests"
