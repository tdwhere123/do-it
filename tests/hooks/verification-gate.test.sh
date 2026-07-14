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
  jq -nc '{type:"assistant",message:{content:[{type:"tool_use",id:"edit-1",name:"Edit",input:{file_path:"/tmp/x.ts"}}]}}'
}

_append_bash() {
  local command="$1" id="${2:-verify-1}"
  jq -nc --arg command "$command" --arg id "$id" \
    '{type:"assistant",message:{content:[{type:"tool_use",id:$id,name:"Bash",input:{command:$command}}]}}'
}

_append_shell() {
  local command="$1" id="${2:-verify-1}"
  jq -nc --arg command "$command" --arg id "$id" \
    '{role:"assistant",content:[{type:"tool_use",id:$id,name:"Shell",input:{command:$command}}]}'
}

_append_result() {
  local id="$1" success="${2:-true}"
  jq -nc --arg id "$id" --arg success "$success" \
    '{type:"user",message:{content:[{type:"tool_result",tool_use_id:$id,is_error:($success != "true"),content:(if $success == "true" then "ok" else "failed" end)}]}}'
}

_append_role_result() {
  local id="$1" status="${2:-success}"
  jq -nc --arg id "$id" --arg status "$status" \
    '{role:"tool",tool_call_id:$id,status:$status,content:"command output"}'
}

_append_top_result() {
  local id="$1" status="${2:-completed}"
  jq -nc --arg id "$id" --arg status "$status" \
    '{type:"tool_result",tool_use_id:$id,status:$status,content:"command output"}'
}

_append_result_no_error_field() {
  local id="$1"
  jq -nc --arg id "$id" \
    '{type:"user",message:{content:[{type:"tool_result",tool_use_id:$id,content:"ok"}]}}'
}

_append_tool_calls_edit() {
  jq -nc '{role:"assistant",tool_calls:[{id:"edit-1",type:"function",function:{name:"Edit",arguments:"{\"file_path\":\"/tmp/x.ts\"}"}}]}'
}

_append_apply_patch() {
  jq -nc '{type:"assistant",message:{content:[{type:"tool_use",id:"edit-1",name:"apply_patch",input:{patch:"*** Update File: /tmp/x.ts"}}]}}'
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
  _append_bash "pnpm test --filter auth" verify-auth >> "$tx"
  _append_result verify-auth true >> "$tx"
  _append_text "tests passed; task done" >> "$tx"
  [[ -z "$(_run_gate c6 "$tx")" ]]
)
case "$?" in 0) _pass "targeted test passes";; *) _fail "targeted test evidence";; esac

(
  _isolate /tmp/doit-gate-c7
  _set_state c7 tier Standard last_prompt_kind work
  tx="$DO_IT_HOOK_DATA/tx.jsonl"
  _append_edit > "$tx"
  _append_bash "git diff --check" verify-diff >> "$tx"
  _append_result verify-diff true >> "$tx"
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
  _append_bash "pnpm test" stale-verify >> "$tx"
  _append_result stale-verify true >> "$tx"
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
  _append_shell "npm test" shell-verify >> "$tx"
  _append_role_result shell-verify success >> "$tx"
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
  _append_shell "npm test" patch-verify >> "$tx"
  _append_role_result patch-verify success >> "$tx"
  _append_text "VERIFIED; ready to merge" >> "$tx"
  [[ -z "$(_run_gate c13 "$tx")" ]]
)
case "$?" in 0) _pass "apply_patch + Shell evidence passes";; *) _fail "apply_patch + Shell";; esac

# -------------------------------------------------------------------------
echo "Case 9: failed, missing, and forged results fail closed"
(
  _isolate /tmp/doit-gate-c14
  _set_state c14 tier Standard last_prompt_kind work
  tx="$DO_IT_HOOK_DATA/tx.jsonl"
  _append_edit > "$tx"
  _append_bash "pnpm test" failed-verify >> "$tx"
  _append_result failed-verify false >> "$tx"
  _append_text "tests passed; task done" >> "$tx"
  out=$(_run_gate c14 "$tx")
  [[ "$out" == *'fresh, relevant current-turn proof'* ]]
)
case "$?" in 0) _pass "failed verification result blocks";; *) _fail "failed result passed";; esac

(
  _isolate /tmp/doit-gate-c15
  _set_state c15 tier Standard last_prompt_kind work
  tx="$DO_IT_HOOK_DATA/tx.jsonl"
  _append_edit > "$tx"
  _append_bash "pnpm test" missing-result >> "$tx"
  _append_text "tests passed; task done" >> "$tx"
  out=$(_run_gate c15 "$tx")
  [[ "$out" == *'fresh, relevant current-turn proof'* ]]
)
case "$?" in 0) _pass "verification command without result blocks";; *) _fail "missing result passed";; esac

(
  _isolate /tmp/doit-gate-c16
  _set_state c16 tier Standard last_prompt_kind work
  tx="$DO_IT_HOOK_DATA/tx.jsonl"
  _append_edit > "$tx"
  _append_result forged-id true >> "$tx"
  _append_text "pnpm test passed; task done" >> "$tx"
  out=$(_run_gate c16 "$tx")
  [[ "$out" == *'fresh, relevant current-turn proof'* ]]
)
case "$?" in 0) _pass "forged unpaired result blocks";; *) _fail "forged result passed";; esac

# -------------------------------------------------------------------------
echo "Case 10: top-level tool_result success shape pairs explicitly"
(
  _isolate /tmp/doit-gate-c17
  _set_state c17 tier Standard last_prompt_kind work
  tx="$DO_IT_HOOK_DATA/tx.jsonl"
  _append_edit > "$tx"
  _append_bash "cargo check" top-verify >> "$tx"
  _append_top_result top-verify completed >> "$tx"
  _append_text "check passed; task done" >> "$tx"
  [[ -z "$(_run_gate c17 "$tx")" ]]
)
case "$?" in 0) _pass "top-level completed result passes";; *) _fail "top-level result shape blocked";; esac

# -------------------------------------------------------------------------
echo "Case 11: tool_result with omitted is_error passes (Claude convention)"
(
  _isolate /tmp/doit-gate-c18
  _set_state c18 tier Standard last_prompt_kind work
  tx="$DO_IT_HOOK_DATA/tx.jsonl"
  _append_edit > "$tx"
  _append_bash "npm test" verify-err >> "$tx"
  _append_result_no_error_field verify-err >> "$tx"
  _append_text "tests passed; task done" >> "$tx"
  [[ -z "$(_run_gate c18 "$tx")" ]]
)
case "$?" in 0) _pass "omitted is_error passes";; *) _fail "omitted is_error blocked";; esac

(
  _isolate /tmp/doit-gate-c18b
  _set_state c18b tier Standard last_prompt_kind work
  tx="$DO_IT_HOOK_DATA/tx.jsonl"
  _append_edit > "$tx"
  _append_shell "npm test" role-missing >> "$tx"
  jq -nc '{role:"tool",tool_call_id:"role-missing",content:"failed hard"}' >> "$tx"
  _append_text "tests passed; task done" >> "$tx"
  out=$(_run_gate c18b "$tx")
  [[ "$out" == *'fresh, relevant current-turn proof'* ]]
)
case "$?" in 0) _pass "role result without status blocks";; *) _fail "role missing status passed";; esac

(
  _isolate /tmp/doit-gate-c18c
  _set_state c18c tier Standard last_prompt_kind work
  tx="$DO_IT_HOOK_DATA/tx.jsonl"
  _append_edit > "$tx"
  _append_bash "pnpm test" early-verify >> "$tx"
  _append_result early-verify true >> "$tx"
  _append_edit >> "$tx"
  _append_text "tests passed; task done" >> "$tx"
  out=$(_run_gate c18c "$tx")
  [[ "$out" == *'fresh, relevant current-turn proof'* ]]
)
case "$?" in 0) _pass "evidence before later edit blocks";; *) _fail "stale within-turn evidence passed";; esac

# -------------------------------------------------------------------------
echo "Case 12: compound verification command with prefix passes"
(
  _isolate /tmp/doit-gate-c19
  _set_state c19 tier Standard last_prompt_kind work
  tx="$DO_IT_HOOK_DATA/tx.jsonl"
  _append_edit > "$tx"
  _append_bash "cd packages/auth && NODE_ENV=test npm test" verify-prefix >> "$tx"
  _append_result verify-prefix true >> "$tx"
  _append_text "tests passed; task done" >> "$tx"
  [[ -z "$(_run_gate c19 "$tx")" ]]
)
case "$?" in 0) _pass "compound prefix command passes";; *) _fail "compound prefix command blocked";; esac

# -------------------------------------------------------------------------
echo "Case 13: claim bypass via tool_calls blocks without verification"
(
  _isolate /tmp/doit-gate-c20
  _set_state c20 tier Standard last_prompt_kind work
  tx="$DO_IT_HOOK_DATA/tx.jsonl"
  _append_tool_calls_edit > "$tx"
  _append_text "task done" >> "$tx"
  out=$(_run_gate c20 "$tx")
  [[ "$out" == *'fresh, relevant current-turn proof'* ]]
)
case "$?" in 0) _pass "tool_calls edit without verification blocks";; *) _fail "tool_calls bypass allowed";; esac

# -------------------------------------------------------------------------
echo "Case 14: OpenAI/Cursor tool_calls with verification passes"
(
  _isolate /tmp/doit-gate-c21
  _set_state c21 tier Standard last_prompt_kind work
  tx="$DO_IT_HOOK_DATA/tx.jsonl"
  _append_tool_calls_edit > "$tx"
  _append_bash "pnpm test" verify-tc >> "$tx"
  _append_result verify-tc true >> "$tx"
  _append_text "tests passed; task done" >> "$tx"
  [[ -z "$(_run_gate c21 "$tx")" ]]
)
case "$?" in 0) _pass "tool_calls edit with verification passes";; *) _fail "tool_calls edit with verification blocked";; esac


echo "Case 15: substring carriers echo/pnpm and comment-trailing vitest block"
(
  _isolate /tmp/doit-gate-c15
  _set_state c15 tier Standard last_prompt_kind work
  tx="$DO_IT_HOOK_DATA/tx.jsonl"
  _append_edit > "$tx"
  _append_bash "echo pnpm test" bogus-echo >> "$tx"
  _append_result bogus-echo true >> "$tx"
  _append_text "task done" >> "$tx"
  out=$(_run_gate c15 "$tx")
  [[ "$out" == *'fresh, relevant current-turn proof'* ]] || exit 11

  _isolate /tmp/doit-gate-c15b
  _set_state c15b tier Standard last_prompt_kind work
  tx="$DO_IT_HOOK_DATA/tx.jsonl"
  _append_edit > "$tx"
  _append_bash "true # vitest" bogus-comment >> "$tx"
  _append_result bogus-comment true >> "$tx"
  _append_text "task done" >> "$tx"
  out=$(_run_gate c15b "$tx")
  [[ "$out" == *'fresh, relevant current-turn proof'* ]] || exit 12
)
case "$?" in
  0)  _pass "echo pnpm test and true # vitest do not count as evidence" ;;
  11) _fail "echo pnpm test falsely passed" ;;
  12) _fail "true # vitest falsely passed" ;;
  *)  _fail "substring carrier case failed (exit $?)" ;;
esac

# -------------------------------------------------------------------------
echo "Case 16: evidence must follow the last edit in the turn"
(
  _isolate /tmp/doit-gate-c16
  _set_state c16 tier Standard last_prompt_kind work
  tx="$DO_IT_HOOK_DATA/tx.jsonl"
  _append_bash "pnpm test" verify-early > "$tx"
  _append_result verify-early true >> "$tx"
  jq -nc '{type:"assistant",message:{content:[{type:"tool_use",id:"edit-2",name:"Edit",input:{file_path:"/tmp/y.ts"}}]}}' >> "$tx"
  _append_text "task done" >> "$tx"
  out=$(_run_gate c16 "$tx")
  [[ "$out" == *'fresh, relevant current-turn proof'* ]] || exit 11

  _isolate /tmp/doit-gate-c16b
  _set_state c16b tier Standard last_prompt_kind work
  tx="$DO_IT_HOOK_DATA/tx.jsonl"
  _append_edit > "$tx"
  _append_bash "pnpm test" verify-late >> "$tx"
  _append_result verify-late true >> "$tx"
  _append_text "tests passed; task done" >> "$tx"
  [[ -z "$(_run_gate c16b "$tx")" ]] || exit 12
)
case "$?" in
  0)  _pass "verify→edit→done blocks; edit→verify→done passes" ;;
  11) _fail "verify before last edit falsely passed" ;;
  12) _fail "edit then verify should pass" ;;
  *)  _fail "ordering case failed (exit $?)" ;;
esac

# -------------------------------------------------------------------------
echo "Case 17: unparsed transcript with NOT_VERIFIED allows"
(
  _isolate /tmp/doit-gate-c17
  _set_state c17 tier Standard last_prompt_kind work
  tx="$DO_IT_HOOK_DATA/tx.jsonl"
  {
    echo 'not-json{{{{'
    echo '{"type":"assistant","message":{"content":[{"type":"tool_use","id":"edit-1","name":"Edit","input":{"file_path":"/tmp/x.ts"}}]}}'
    echo 'NOT_VERIFIED: malformed host transcript; next action is re-run under a JSONL host.'
    echo 'task done'
  } > "$tx"
  [[ -z "$(_run_gate c17 "$tx")" ]] || exit 11
)
case "$?" in
  0)  _pass "PARSE_OK=0 honors NOT_VERIFIED" ;;
  11) _fail "malformed + NOT_VERIFIED should allow" ;;
  *)  _fail "unparsed NOT_VERIFIED case failed (exit $?)" ;;
esac


# -------------------------------------------------------------------------
echo "Case 18: left-to-right peel so || before && still finds npm test"
(
  _isolate /tmp/doit-gate-c18
  _set_state c18 tier Standard last_prompt_kind work
  tx="$DO_IT_HOOK_DATA/tx.jsonl"
  _append_edit > "$tx"
  _append_bash "true || npm test && echo done" verify-ltr >> "$tx"
  _append_result verify-ltr true >> "$tx"
  _append_text "tests passed; task done" >> "$tx"
  [[ -z "$(_run_gate c18 "$tx")" ]]
)
case "$?" in 0) _pass "true || npm test && echo done passes";; *) _fail "left-to-right ||/&& evidence blocked";; esac

# -------------------------------------------------------------------------
echo "Case 19: unparsed stale done outside recent slice is silent"
(
  _isolate /tmp/doit-gate-c19u
  _set_state c19u tier Standard last_prompt_kind work
  tx="$DO_IT_HOOK_DATA/tx.jsonl"
  {
    echo 'not-json{{{{'
    # Older completion language, then enough non-completion filler that the
    # last-20-line unparsed window excludes the stale "done".
    echo 'prior turn: task done successfully'
    for i in $(seq 1 25); do echo "filler line $i without claim language"; done
    echo '{"type":"assistant","message":{"content":[{"type":"tool_use","id":"edit-1","name":"Edit","input":{"file_path":"/tmp/x.ts"}}]}}'
    echo 'continuing without completion language in this slice'
  } > "$tx"
  [[ -z "$(_run_gate c19u "$tx")" ]] || exit 11

  _isolate /tmp/doit-gate-c19b
  _set_state c19b tier Standard last_prompt_kind work
  tx="$DO_IT_HOOK_DATA/tx.jsonl"
  {
    echo 'not-json{{{{'
    echo '{"type":"assistant","message":{"content":[{"type":"tool_use","id":"edit-1","name":"Edit","input":{"file_path":"/tmp/x.ts"}}]}}'
    echo 'task done'
  } > "$tx"
  out=$(_run_gate c19b "$tx")
  [[ "$out" == *'fresh, relevant current-turn proof'* ]] || exit 12
)
case "$?" in
  0)  _pass "unparsed: stale done silent; recent done without evidence blocks" ;;
  11) _fail "stale done outside recent slice should be silent" ;;
  12) _fail "recent unparsed done without evidence should block" ;;
  *)  _fail "unparsed stale-completion case failed (exit $?)" ;;
esac

if [[ "$FAIL" -gt 0 ]]; then
  echo "FAILED: $PASS passed, $FAIL failed" >&2
  exit 1
fi

echo "ok: $PASS tests"
