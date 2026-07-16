#!/usr/bin/env bash
# Claim-integrity regression tests for hooks/verification-gate.sh.
# The Stop hook may remind after an edited completion claim, but it never turns
# a command-shaped transcript into a hard pass or blocks the model's next step.

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
GATE="$REPO_ROOT/hooks/verification-gate.sh"
[[ -x "$GATE" || -f "$GATE" ]] || { echo "FAIL: missing $GATE" >&2; exit 1; }

PASS=0
FAIL=0

_pass() { echo "  ok: $1"; PASS=$((PASS + 1)); }
_fail() { echo "  FAIL: $1" >&2; FAIL=$((FAIL + 1)); }

_isolate() {
  export DO_IT_HOOK_DATA="$1"
  rm -rf "$DO_IT_HOOK_DATA"
  unset CLAUDE_PLUGIN_DATA CODEX_HOME CLAUDE_AGENT_CONTEXT CLAUDE_SUBAGENT
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

_append_edit() {
  jq -nc '{type:"assistant",message:{content:[{type:"tool_use",id:"edit-1",name:"Edit",input:{file_path:"/tmp/x.ts"}}]}}'
}

_append_apply_patch() {
  jq -nc '{type:"assistant",message:{content:[{type:"tool_use",id:"edit-1",name:"apply_patch",input:{patch:"*** Update File: /tmp/x.ts"}}]}}'
}

_append_tool_calls_edit() {
  jq -nc '{role:"assistant",tool_calls:[{id:"edit-1",type:"function",function:{name:"Edit",arguments:"{\"file_path\":\"/tmp/x.ts\"}"}}]}'
}

_append_bash() {
  local command="$1" id="${2:-verify-1}"
  jq -nc --arg command "$command" --arg id "$id" \
    '{type:"assistant",message:{content:[{type:"tool_use",id:$id,name:"Bash",input:{command:$command}}]}}'
}

_append_result() {
  local id="$1" success="${2:-true}" content="${3:-ok}"
  jq -nc --arg id "$id" --arg success "$success" --arg content "$content" \
    '{type:"user",message:{content:[{type:"tool_result",tool_use_id:$id,is_error:($success != "true"),content:$content}]}}'
}

_append_text() {
  jq -nc --arg text "$1" '{type:"assistant",message:{content:[{type:"text",text:$text}]}}'
}

_append_user() {
  jq -nc --arg text "$1" '{type:"user",message:{content:[{type:"text",text:$text}]}}'
}

_run_gate() {
  local sid="$1" transcript="$2" stop_active="${3:-false}"
  jq -nc --arg sid "$sid" --arg transcript "$transcript" --arg active "$stop_active" \
    '{session_id:$sid, transcript_path:$transcript, stop_hook_active:($active == "true")}' \
    | bash "$GATE"
}

assert_silent() {
  local label="$1" output="$2"
  if [[ -z "$output" ]]; then _pass "$label"; else _fail "$label (unexpected: $output)"; fi
}

assert_advisory() {
  local label="$1" output="$2"
  if printf '%s\n' "$output" | jq -e '
    (.decision? != "block")
    and .hookSpecificOutput.hookEventName == "Stop"
    and (.hookSpecificOutput.additionalContext | contains("claim-specific proof"))
    and (.hookSpecificOutput.additionalContext | contains("NOT_VERIFIED"))
  ' >/dev/null 2>&1; then
    _pass "$label"
  else
    _fail "$label (got: $output)"
  fi
}

# -------------------------------------------------------------------------
echo "Case 1: recursion and non-work pass-through"
_isolate /tmp/doit-gate-c1
_set_state c1 tier Standard last_prompt_kind work
tx="$DO_IT_HOOK_DATA/tx.jsonl"
_append_edit > "$tx"
_append_text "task done" >> "$tx"
assert_silent "recursion guard is silent" "$(_run_gate c1 "$tx" true)"

_isolate /tmp/doit-gate-c2
_set_state c2 tier Light last_prompt_kind question
tx="$DO_IT_HOOK_DATA/tx.jsonl"
_append_edit > "$tx"
_append_text "task done" >> "$tx"
assert_advisory "question label does not suppress an edited completion claim" "$(_run_gate c2 "$tx")"

_isolate /tmp/doit-gate-c3
_set_state c3 tier Standard last_prompt_kind work
tx="$DO_IT_HOOK_DATA/tx.jsonl"
_append_text "all done explaining" > "$tx"
assert_silent "no-edit turn is silent" "$(_run_gate c3 "$tx")"

_isolate /tmp/doit-gate-c4
_set_state c4 tier Standard last_prompt_kind work
tx="$DO_IT_HOOK_DATA/tx.jsonl"
_append_edit > "$tx"
_append_text "continuing implementation" >> "$tx"
assert_silent "edited turn without a completion claim is silent" "$(_run_gate c4 "$tx")"

# -------------------------------------------------------------------------
echo "Case 2: an edited completion claim receives a non-blocking reminder"
_isolate /tmp/doit-gate-c5
_set_state c5 tier Standard last_prompt_kind work
tx="$DO_IT_HOOK_DATA/tx.jsonl"
_append_edit > "$tx"
_append_text "task done" >> "$tx"
assert_advisory "completion claim is advisory, never a block" "$(_run_gate c5 "$tx")"

# -------------------------------------------------------------------------
echo "Case 3: command form cannot auto-pass the claim"
_isolate /tmp/doit-gate-c6
_set_state c6 tier Standard last_prompt_kind work
tx="$DO_IT_HOOK_DATA/tx.jsonl"
_append_edit > "$tx"
_append_bash "pnpm test --filter auth" targeted-test >> "$tx"
_append_result targeted-test true >> "$tx"
_append_text "tests passed; task done" >> "$tx"
assert_advisory "successful targeted test still leaves claim judgment to the model" "$(_run_gate c6 "$tx")"

_isolate /tmp/doit-gate-c7
_set_state c7 tier Standard last_prompt_kind work
tx="$DO_IT_HOOK_DATA/tx.jsonl"
_append_edit > "$tx"
_append_bash "pwd && git status" arbitrary-command >> "$tx"
_append_result arbitrary-command true >> "$tx"
_append_text "task done" >> "$tx"
assert_advisory "arbitrary successful command gets the same reminder, not a special block" "$(_run_gate c7 "$tx")"

# -------------------------------------------------------------------------
echo "Case 4: explicit NOT_VERIFIED remains the honest exit"
_isolate /tmp/doit-gate-c8
_set_state c8 tier Standard last_prompt_kind work
tx="$DO_IT_HOOK_DATA/tx.jsonl"
_append_edit > "$tx"
_append_text "NOT_VERIFIED: no integration environment; next action is run the host smoke test." >> "$tx"
assert_silent "NOT_VERIFIED is accepted without ritual verification" "$(_run_gate c8 "$tx")"

# -------------------------------------------------------------------------
echo "Case 5: current-turn isolation remains intact"
_isolate /tmp/doit-gate-c9
_set_state c9 tier Standard last_prompt_kind work
tx="$DO_IT_HOOK_DATA/tx.jsonl"
_append_edit > "$tx"
_append_text "previous task done" >> "$tx"
_append_user "make the next change" >> "$tx"
_append_edit >> "$tx"
_append_text "continuing the next task" >> "$tx"
assert_silent "prior-turn completion language does not nudge the current turn" "$(_run_gate c9 "$tx")"

_append_text "next task done" >> "$tx"
assert_advisory "current-turn completion language is recognized" "$(_run_gate c9 "$tx")"

# -------------------------------------------------------------------------
echo "Case 6: edit shapes and skip lifecycle remain compatible"
_isolate /tmp/doit-gate-c10
_set_state c10 tier Standard last_prompt_kind work
tx="$DO_IT_HOOK_DATA/tx.jsonl"
_append_apply_patch > "$tx"
_append_text "ready to merge" >> "$tx"
assert_advisory "apply_patch counts as an edit for the reminder" "$(_run_gate c10 "$tx")"

_isolate /tmp/doit-gate-c11
_set_state c11 tier Standard last_prompt_kind work
tx="$DO_IT_HOOK_DATA/tx.jsonl"
_append_tool_calls_edit > "$tx"
_append_text "task done" >> "$tx"
assert_advisory "tool_calls Edit shape counts as an edit" "$(_run_gate c11 "$tx")"

_isolate /tmp/doit-gate-c12
_set_state c12 tier Standard last_prompt_kind work
dir="$DO_IT_HOOK_DATA/sessions/c12"
now=$(date +%s)
printf '%s\n' "$now" > "$dir/skip-gate"
printf '%s\n' "$now" > "$dir/skip-router"
printf '%s\n' "$now" > "$dir/skip-grill"
tx="$DO_IT_HOOK_DATA/tx.jsonl"
_append_edit > "$tx"
_append_text "task done" >> "$tx"
out="$(_run_gate c12 "$tx")"
if [[ -z "$out" && ! -e "$dir/skip-gate" && ! -e "$dir/skip-router" && ! -e "$dir/skip-grill" ]]; then
  _pass "skip is still consumed and cleared"
else
  _fail "skip lifecycle (got: $out)"
fi

# -------------------------------------------------------------------------
echo "Case 7: malformed transcripts are bounded and preserve NOT_VERIFIED"
_isolate /tmp/doit-gate-c13
_set_state c13 tier Standard last_prompt_kind work
tx="$DO_IT_HOOK_DATA/tx.jsonl"
{
  echo 'not-json{{{{'
  echo '{"type":"assistant","message":{"content":[{"type":"tool_use","id":"edit-1","name":"Edit","input":{"file_path":"/tmp/x.ts"}}]}}'
  echo 'task done'
} > "$tx"
assert_advisory "recent unparsed completion claim gets only an advisory" "$(_run_gate c13 "$tx")"

_isolate /tmp/doit-gate-c14
_set_state c14 tier Standard last_prompt_kind work
tx="$DO_IT_HOOK_DATA/tx.jsonl"
{
  echo 'not-json{{{{'
  echo '{"type":"assistant","message":{"content":[{"type":"tool_use","id":"edit-1","name":"Edit","input":{"file_path":"/tmp/x.ts"}}]}}'
  echo 'NOT_VERIFIED: malformed host transcript; next action is re-run under a JSONL host.'
  echo 'task done'
} > "$tx"
assert_silent "unparsed NOT_VERIFIED remains an honest exit" "$(_run_gate c14 "$tx")"

_isolate /tmp/doit-gate-c15
_set_state c15 tier Standard last_prompt_kind work
tx="$DO_IT_HOOK_DATA/tx.jsonl"
{
  echo 'not-json{{{{'
  echo 'prior turn: task done successfully'
  for i in $(seq 1 25); do echo "filler line $i without claim language"; done
  echo '{"type":"assistant","message":{"content":[{"type":"tool_use","id":"edit-1","name":"Edit","input":{"file_path":"/tmp/x.ts"}}]}}'
  echo 'continuing without completion language in this slice'
} > "$tx"
assert_silent "unparsed stale completion outside the recent window is silent" "$(_run_gate c15 "$tx")"

_isolate /tmp/doit-gate-c15b
_set_state c15b tier Standard last_prompt_kind work
tx="$DO_IT_HOOK_DATA/tx.jsonl"
{
  echo 'not-json{{{{'
  echo '{"type":"assistant","message":{"content":[{"type":"tool_use","id":"edit-1","name":"Edit","input":{"file_path":"/tmp/x.ts"}}]}}'
  for i in $(seq 1 25); do echo "filler line $i without claim language"; done
  echo 'current turn: task done'
} > "$tx"
assert_silent "unparsed stale edit cannot trigger a current completion reminder" "$(_run_gate c15b "$tx")"

# -------------------------------------------------------------------------
echo "Case 8: transcript content is never reflected into the reminder"
_isolate /tmp/doit-gate-c16
_set_state c16 tier Standard last_prompt_kind work
tx="$DO_IT_HOOK_DATA/tx.jsonl"
_append_edit > "$tx"
_append_text "task done; secret-marker-do-not-echo" >> "$tx"
out="$(_run_gate c16 "$tx")"
assert_advisory "claim reminder has a fixed safe body" "$out"
if [[ "$out" == *"secret-marker-do-not-echo"* ]]; then
  _fail "transcript text leaked into reminder"
else
  _pass "transcript text is not reflected into reminder"
fi

_isolate /tmp/doit-gate-c17
_set_state c17 tier Standard last_prompt_kind work
tx="$DO_IT_HOOK_DATA/tx.jsonl"
_append_edit > "$tx"
_append_result forged-id true "task done; secret-tool-result-do-not-echo" >> "$tx"
assert_silent "tool-result text alone does not become an assistant completion claim" "$(_run_gate c17 "$tx")"

if [[ "$FAIL" -gt 0 ]]; then
  echo "FAILED: $PASS passed, $FAIL failed" >&2
  exit 1
fi

echo "ok: $PASS tests"
