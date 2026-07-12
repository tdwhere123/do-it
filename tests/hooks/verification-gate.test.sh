#!/usr/bin/env bash
# Claim-integrity regression tests for hooks/verification-gate.sh.
# Completion after edits needs fresh, relevant evidence; workflow markers and
# arbitrary shell commands never count as proof.

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
  jq -nc '{type:"assistant",message:{content:[{type:"tool_use",name:"Edit",input:{file_path:"/tmp/x.ts"}}]}}'
}

_append_bash() {
  jq -nc --arg command "$1" '{type:"assistant",message:{content:[{type:"tool_use",name:"Bash",input:{command:$command}}]}}'
}

_append_shell() {
  jq -nc --arg command "$1" '{type:"assistant",message:{content:[{type:"tool_use",name:"Shell",input:{command:$command}}]}}'
}

_append_apply_patch() {
  jq -nc '{type:"assistant",message:{content:[{type:"tool_use",name:"apply_patch",input:{patch:"*** Update File: /tmp/x.ts"}}]}}'
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

assert_block() {
  local label="$1" output="$2" needle="$3"
  if [[ "$output" == *'"decision":"block"'* && "$output" == *"$needle"* ]]; then
    _pass "$label"
  else
    _fail "$label (got: $output)"
  fi
}

# -------------------------------------------------------------------------
echo "Case 1: recursion guard"
(
  _isolate /tmp/doit-gate-c1
  _set_state c1 tier Standard last_prompt_kind work
  tx="$DO_IT_HOOK_DATA/tx.jsonl"
  _append_edit > "$tx"
  _append_text "task done" >> "$tx"
  [[ -z "$(_run_gate c1 "$tx" true)" ]]
)
case "$?" in 0) _pass "recursion guard is silent";; *) _fail "recursion guard";; esac

# -------------------------------------------------------------------------
echo "Case 2: discussion and no-edit pass-through"
(
  _isolate /tmp/doit-gate-c2
  _set_state c2 tier Light last_prompt_kind question
  tx="$DO_IT_HOOK_DATA/tx.jsonl"
  _append_edit > "$tx"
  _append_text "task done" >> "$tx"
  [[ -z "$(_run_gate c2 "$tx")" ]]
)
case "$?" in 0) _pass "question turn is silent";; *) _fail "question turn";; esac

(
  _isolate /tmp/doit-gate-c3
  _set_state c3 tier Standard last_prompt_kind work
  tx="$DO_IT_HOOK_DATA/tx.jsonl"
  _append_text "all done explaining" > "$tx"
  [[ -z "$(_run_gate c3 "$tx")" ]]
)
case "$?" in 0) _pass "no-edit turn is silent";; *) _fail "no-edit turn";; esac

# -------------------------------------------------------------------------
echo "Case 3: completion without proof blocks"
(
  _isolate /tmp/doit-gate-c4
  _set_state c4 tier Standard last_prompt_kind work
  tx="$DO_IT_HOOK_DATA/tx.jsonl"
  _append_edit > "$tx"
  _append_text "task done" >> "$tx"
  out=$(_run_gate c4 "$tx")
  [[ "$out" == *'fresh, relevant current-turn proof'* ]]
)
case "$?" in 0) _pass "no evidence blocks";; *) _fail "no evidence block";; esac

# -------------------------------------------------------------------------
echo "Case 4: arbitrary Bash and workflow words are not evidence"
(
  _isolate /tmp/doit-gate-c5
  _set_state c5 tier Standard last_prompt_kind work dim_breaks_interface 1 dim_needs_review_loop 1
  tx="$DO_IT_HOOK_DATA/tx.jsonl"
  _append_edit > "$tx"
  _append_bash "pwd && git status" >> "$tx"
  _append_text $'ran do-it-review and inline-review: clean\ntask done' >> "$tx"
  out=$(_run_gate c5 "$tx")
  [[ "$out" == *'fresh, relevant current-turn proof'* ]]
)
case "$?" in 0) _pass "pwd and marker prose do not pass";; *) _fail "ritual evidence block";; esac

# -------------------------------------------------------------------------
echo "Case 5: relevant command and focused inspection pass"
(
  _isolate /tmp/doit-gate-c6
  _set_state c6 tier Standard last_prompt_kind work
  tx="$DO_IT_HOOK_DATA/tx.jsonl"
  _append_edit > "$tx"
  _append_bash "pnpm test --filter auth" >> "$tx"
  _append_text "tests passed; task done" >> "$tx"
  [[ -z "$(_run_gate c6 "$tx")" ]]
)
case "$?" in 0) _pass "targeted test passes";; *) _fail "targeted test evidence";; esac

(
  _isolate /tmp/doit-gate-c7
  _set_state c7 tier Standard last_prompt_kind work
  tx="$DO_IT_HOOK_DATA/tx.jsonl"
  _append_edit > "$tx"
  _append_bash "git diff --check" >> "$tx"
  _append_text "metadata update done" >> "$tx"
  [[ -z "$(_run_gate c7 "$tx")" ]]
)
case "$?" in 0) _pass "focused diff inspection passes";; *) _fail "diff inspection evidence";; esac

# -------------------------------------------------------------------------
echo "Case 6: honest missing proof and stale evidence"
(
  _isolate /tmp/doit-gate-c8
  _set_state c8 tier Standard last_prompt_kind work
  tx="$DO_IT_HOOK_DATA/tx.jsonl"
  _append_edit > "$tx"
  _append_text "NOT_VERIFIED: no integration environment; next action is run the host smoke test." >> "$tx"
  [[ -z "$(_run_gate c8 "$tx")" ]]
)
case "$?" in 0) _pass "NOT_VERIFIED is an honest exit";; *) _fail "NOT_VERIFIED handling";; esac

(
  _isolate /tmp/doit-gate-c9
  _set_state c9 tier Standard last_prompt_kind work
  tx="$DO_IT_HOOK_DATA/tx.jsonl"
  _append_edit > "$tx"
  _append_bash "pnpm test" >> "$tx"
  _append_text "previous task done" >> "$tx"
  _append_user "ship the next change" >> "$tx"
  _append_edit >> "$tx"
  _append_text "next task done" >> "$tx"
  out=$(_run_gate c9 "$tx")
  [[ "$out" == *'fresh, relevant current-turn proof'* ]]
)
case "$?" in 0) _pass "previous-turn evidence does not pass";; *) _fail "stale evidence handling";; esac

# -------------------------------------------------------------------------
echo "Case 7: skip flags still clear"
(
  _isolate /tmp/doit-gate-c10
  _set_state c10 tier Standard last_prompt_kind work
  dir="$DO_IT_HOOK_DATA/sessions/c10"
  now=$(date +%s)
  printf '%s\n' "$now" > "$dir/skip-gate"
  printf '%s\n' "$now" > "$dir/skip-router"
  printf '%s\n' "$now" > "$dir/skip-grill"
  tx="$DO_IT_HOOK_DATA/tx.jsonl"
  _append_edit > "$tx"
  _append_text "task done" >> "$tx"
  [[ -z "$(_run_gate c10 "$tx")" ]]
  [[ ! -e "$dir/skip-gate" && ! -e "$dir/skip-router" && ! -e "$dir/skip-grill" ]]
)
case "$?" in 0) _pass "skip is consumed and cleared";; *) _fail "skip lifecycle";; esac

# -------------------------------------------------------------------------
echo "Case 8: Shell evidence and apply_patch edits (Codex/Cursor)"
(
  _isolate /tmp/doit-gate-c11
  _set_state c11 tier Standard last_prompt_kind work
  tx="$DO_IT_HOOK_DATA/tx.jsonl"
  _append_edit > "$tx"
  _append_shell "npm test" >> "$tx"
  _append_text "tests passed; task done" >> "$tx"
  [[ -z "$(_run_gate c11 "$tx")" ]]
)
case "$?" in 0) _pass "Shell npm test counts as evidence";; *) _fail "Shell evidence";; esac

(
  _isolate /tmp/doit-gate-c12
  _set_state c12 tier Standard last_prompt_kind work
  tx="$DO_IT_HOOK_DATA/tx.jsonl"
  _append_apply_patch > "$tx"
  _append_text "ready to merge" >> "$tx"
  out=$(_run_gate c12 "$tx")
  [[ "$out" == *'fresh, relevant current-turn proof'* ]]
)
case "$?" in 0) _pass "apply_patch without proof blocks";; *) _fail "apply_patch edit detection";; esac

(
  _isolate /tmp/doit-gate-c13
  _set_state c13 tier Standard last_prompt_kind work
  tx="$DO_IT_HOOK_DATA/tx.jsonl"
  _append_apply_patch > "$tx"
  _append_shell "npm test" >> "$tx"
  _append_text "VERIFIED; ready to merge" >> "$tx"
  [[ -z "$(_run_gate c13 "$tx")" ]]
)
case "$?" in 0) _pass "apply_patch + Shell evidence passes";; *) _fail "apply_patch + Shell";; esac

if [[ "$FAIL" -gt 0 ]]; then
  echo "FAILED: $PASS passed, $FAIL failed" >&2
  exit 1
fi

echo "ok: $PASS tests"
