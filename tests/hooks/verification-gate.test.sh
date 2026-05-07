#!/usr/bin/env bash
# Smoke tests for hooks/verification-gate.sh — locks in:
#   - Recursion guard (STOP_HOOK_ACTIVE=true)
#   - No-transcript pass-through
#   - No-completion-language pass-through
#   - No-edit-this-turn pass-through
#   - Question-turn pass-through
#   - Light-tier inline-review block (B3 fix: marker line-anchored, gate's own
#     block reason cannot self-satisfy on replay)
#   - Light-tier inline-review pass-through when marker present
#   - Standard tier no-evidence block
#   - Standard tier evidence pass-through
#
# Usage: bash tests/hooks/verification-gate.test.sh
# Exits non-zero on first failure; prints "ok: <N> tests" on success.

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
GATE="$REPO_ROOT/hooks/verification-gate.sh"

[[ -x "$GATE" ]] || { echo "FAIL: gate not executable at $GATE" >&2; exit 1; }

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

# Write state.json for a session_id.
_set_state() {
  # args: sid key value [key value]...
  local sid="$1"; shift
  local dir="$DO_IT_HOOK_DATA/sessions/$sid"
  mkdir -p "$dir"
  local jq_args=() obj='{}'
  while (( $# >= 2 )); do
    obj=$(jq -nc --arg k "$1" --arg v "$2" --argjson cur "$obj" '$cur + {($k): $v}')
    shift 2
  done
  printf '%s' "$obj" > "$dir/state.json"
}

# Build a fake transcript JSONL containing assistant text + optionally tool_use.
# args: <out-path> <assistant-text> [edit:1] [bash:1]
_build_transcript() {
  local out="$1" text="$2" edit="${3:-}" bash="${4:-}"
  : > "$out"
  if [[ "$edit" == "edit:1" || "$bash" == "edit:1" ]]; then
    jq -nc '{type:"assistant", message:{content:[{type:"tool_use", name:"Edit", input:{file_path:"/tmp/x.ts"}}]}}' >> "$out"
  fi
  if [[ "$edit" == "bash:1" || "$bash" == "bash:1" ]]; then
    jq -nc '{type:"assistant", message:{content:[{type:"tool_use", name:"Bash", input:{command:"pnpm test"}}]}}' >> "$out"
  fi
  jq -nc --arg t "$text" '{type:"assistant", message:{content:[{type:"text", text:$t}]}}' >> "$out"
}

# Run gate; capture stdout + exit code.
_run_gate() {
  # args: sid transcript [stop_hook_active]
  local sid="$1" transcript="$2" stop_active="${3:-false}"
  local payload
  payload=$(jq -nc --arg s "$sid" --arg t "$transcript" --arg a "$stop_active" \
    '{session_id: $s, transcript_path: $t, stop_hook_active: ($a == "true")}')
  printf '%s' "$payload" | bash "$GATE"
}

# -------------------------------------------------------------------------
echo "Case 1: STOP_HOOK_ACTIVE=true → recursion skip"
(
  _isolate "/tmp/doit-test-gate-c1"
  _set_state c1 tier Standard last_prompt_kind work
  tx="$DO_IT_HOOK_DATA/tx.jsonl"
  _build_transcript "$tx" "task done"
  out=$(_run_gate c1 "$tx" true)
  [[ -z "$out" ]] || { echo "leaked output: $out" >&2; exit 11; }
)
case "$?" in
  0)  _pass "stop_hook_active true → silent" ;;
  *)  _fail "recursion guard regressed" ;;
esac

# -------------------------------------------------------------------------
echo "Case 2: no transcript_path → silent"
(
  _isolate "/tmp/doit-test-gate-c2"
  _set_state c2 tier Standard last_prompt_kind work
  out=$(_run_gate c2 "/nonexistent/path.jsonl" false)
  [[ -z "$out" ]] || { echo "leaked: $out" >&2; exit 11; }
)
case "$?" in 0) _pass "missing transcript → silent" ;; *) _fail "transcript guard regressed" ;; esac

# -------------------------------------------------------------------------
echo "Case 3: question-turn → silent regardless of completion language"
(
  _isolate "/tmp/doit-test-gate-c3"
  _set_state c3 tier Light last_prompt_kind question
  tx="$DO_IT_HOOK_DATA/tx.jsonl"
  _build_transcript "$tx" "I think we are done here." edit:1
  out=$(_run_gate c3 "$tx" false)
  [[ -z "$out" ]] || { echo "leaked: $out" >&2; exit 11; }
)
case "$?" in 0) _pass "question-turn pass-through" ;; *) _fail "question-turn regressed" ;; esac

# -------------------------------------------------------------------------
echo "Case 4: no completion language → silent"
(
  _isolate "/tmp/doit-test-gate-c4"
  _set_state c4 tier Standard last_prompt_kind work
  tx="$DO_IT_HOOK_DATA/tx.jsonl"
  _build_transcript "$tx" "Here is some explanation but no completion claim." edit:1
  out=$(_run_gate c4 "$tx" false)
  [[ -z "$out" ]] || { echo "leaked: $out" >&2; exit 11; }
)
case "$?" in 0) _pass "no completion language → silent" ;; *) _fail "completion-language guard regressed" ;; esac

# -------------------------------------------------------------------------
echo "Case 5: no edits this turn → silent (pure discussion done)"
(
  _isolate "/tmp/doit-test-gate-c5"
  _set_state c5 tier Standard last_prompt_kind work
  tx="$DO_IT_HOOK_DATA/tx.jsonl"
  _build_transcript "$tx" "All done with the explanation."  # no edit:1
  out=$(_run_gate c5 "$tx" false)
  [[ -z "$out" ]] || { echo "leaked: $out" >&2; exit 11; }
)
case "$?" in 0) _pass "no edits + done → silent" ;; *) _fail "no-edit guard regressed" ;; esac

# -------------------------------------------------------------------------
echo "Case 6: Light + edits + done + no inline-review marker → BLOCK"
(
  _isolate "/tmp/doit-test-gate-c6"
  _set_state c6 tier Light last_prompt_kind work
  tx="$DO_IT_HOOK_DATA/tx.jsonl"
  _build_transcript "$tx" "task done all set" edit:1
  out=$(_run_gate c6 "$tx" false)
  case "$out" in
    *'"decision":"block"'*'review-quick'*) exit 0 ;;
    *) echo "no review-quick block: $out" >&2; exit 11 ;;
  esac
)
case "$?" in 0) _pass "Light + edits + done + no marker → block" ;; *) _fail "inline-review block missing" ;; esac

# -------------------------------------------------------------------------
echo "Case 7: B3 — gate's own block reason replayed must NOT self-satisfy"
(
  _isolate "/tmp/doit-test-gate-c7"
  _set_state c7 tier Light last_prompt_kind work
  tx="$DO_IT_HOOK_DATA/tx.jsonl"
  # Simulate: assistant text contains the gate's own block reason text
  # (which mentions \`inline-review:\` mid-line behind backticks).
  reason_text='do-it review-quick (Light tier): this session edited code and the latest response declares completion, but no inline self-review marker is present. Output a single line that begins with the marker prefix `inline-review:` (clean, or a finding). All set, task done.'
  _build_transcript "$tx" "$reason_text" edit:1
  out=$(_run_gate c7 "$tx" false)
  # Expect: still blocks (no real marker on its own line)
  case "$out" in
    *'"decision":"block"'*'review-quick'*) exit 0 ;;
    *) echo "self-satisfied: $out" >&2; exit 11 ;;
  esac
)
case "$?" in
  0)  _pass "gate's block reason replay does NOT self-satisfy marker" ;;
  *)  _fail "B3 regression: gate self-bypasses on replay" ;;
esac

# -------------------------------------------------------------------------
echo "Case 8: Light + edits + done + line-anchored marker → proceed (then no-evidence block)"
(
  _isolate "/tmp/doit-test-gate-c8"
  _set_state c8 tier Light last_prompt_kind work
  tx="$DO_IT_HOOK_DATA/tx.jsonl"
  _build_transcript "$tx" $'inline-review: clean\nAll done.' edit:1
  out=$(_run_gate c8 "$tx" false)
  # Marker satisfied → falls through to evidence check; no Bash in transcript → block on evidence
  case "$out" in
    *'"decision":"block"'*'no verification evidence'*) exit 0 ;;
    *) echo "expected evidence-block: $out" >&2; exit 11 ;;
  esac
)
case "$?" in
  0)  _pass "marker satisfied → falls to evidence-stage block" ;;
  *)  _fail "marker-anchored detection broken" ;;
esac

# -------------------------------------------------------------------------
echo "Case 9: Light + edits + done + marker + Bash evidence → silent"
(
  _isolate "/tmp/doit-test-gate-c9"
  _set_state c9 tier Light last_prompt_kind work
  tx="$DO_IT_HOOK_DATA/tx.jsonl"
  _build_transcript "$tx" $'inline-review: clean\nAll done.' edit:1 bash:1
  out=$(_run_gate c9 "$tx" false)
  [[ -z "$out" ]] || { echo "leaked: $out" >&2; exit 11; }
)
case "$?" in 0) _pass "Light + marker + evidence → silent pass" ;; *) _fail "happy path blocked" ;; esac

# -------------------------------------------------------------------------
echo "Case 10: Standard + edits + done + no evidence → BLOCK (no inline-review check)"
(
  _isolate "/tmp/doit-test-gate-c10"
  _set_state c10 tier Standard last_prompt_kind work
  tx="$DO_IT_HOOK_DATA/tx.jsonl"
  _build_transcript "$tx" "task done" edit:1
  out=$(_run_gate c10 "$tx" false)
  case "$out" in
    *'"decision":"block"'*'no verification evidence'*) exit 0 ;;
    *'review-quick'*) echo "Standard wrongly hit review-quick: $out" >&2; exit 12 ;;
    *) echo "expected evidence block: $out" >&2; exit 11 ;;
  esac
)
case "$?" in
  0)  _pass "Standard skips inline-review and blocks on no-evidence" ;;
  *)  _fail "Standard tier mishandled (exit $?)" ;;
esac

# -------------------------------------------------------------------------
echo "Case 11: Standard + edits + done + Bash evidence → silent"
(
  _isolate "/tmp/doit-test-gate-c11"
  _set_state c11 tier Standard last_prompt_kind work
  tx="$DO_IT_HOOK_DATA/tx.jsonl"
  _build_transcript "$tx" "task done" edit:1 bash:1
  out=$(_run_gate c11 "$tx" false)
  [[ -z "$out" ]] || { echo "leaked: $out" >&2; exit 11; }
)
case "$?" in 0) _pass "Standard happy path → silent" ;; *) _fail "Standard happy path blocked" ;; esac

# -------------------------------------------------------------------------
echo
if [[ "$FAIL" -gt 0 ]]; then
  echo "FAILED: $PASS passed, $FAIL failed" >&2
  exit 1
fi
echo "Summary: $PASS passed, $FAIL failed"
echo "ok: $PASS tests"
