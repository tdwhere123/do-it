#!/usr/bin/env bash
# Regression tests for the do-it hook shell scripts. These tests invoke hooks
# through the same JSON-shaped stdin contract used by Claude Code.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

TMP_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/do-it-hook-tests.XXXXXX")"
export CLAUDE_PLUGIN_DATA="$TMP_ROOT/plugin-data"
mkdir -p "$CLAUDE_PLUGIN_DATA"

cleanup() {
  rm -rf "$TMP_ROOT"
}
trap cleanup EXIT

fail() {
  echo "[test-hooks] FAIL: $*" >&2
  exit 1
}

json_prompt() {
  local session_id="$1" prompt="$2" cwd="${3:-$REPO_ROOT}"
  jq -nc --arg prompt "$prompt" --arg sid "$session_id" --arg cwd "$cwd" \
    '{prompt: $prompt, session_id: $sid, cwd: $cwd}'
}

json_pretool() {
  local session_id="$1" cwd="$2" tool_name="$3" file_path="$4" content="${5:-}"
  jq -nc \
    --arg sid "$session_id" \
    --arg cwd "$cwd" \
    --arg tool "$tool_name" \
    --arg file_path "$file_path" \
    --arg content "$content" \
    '{session_id: $sid, cwd: $cwd, tool_name: $tool, tool_input: {file_path: $file_path, content: $content, new_string: $content}}'
}

json_stop() {
  local session_id="$1" transcript_path="$2"
  jq -nc --arg sid "$session_id" --arg transcript "$transcript_path" \
    '{session_id: $sid, transcript_path: $transcript, stop_hook_active: "false"}'
}

run_router() {
  local session_id="$1" prompt="$2" cwd="${3:-$REPO_ROOT}"
  json_prompt "$session_id" "$prompt" "$cwd" | bash hooks/router.sh >/dev/null
}

run_grill() {
  local session_id="$1" prompt="$2" cwd="${3:-$REPO_ROOT}"
  json_prompt "$session_id" "$prompt" "$cwd" | bash hooks/grill-prompt.sh
}

run_pretool() {
  local session_id="$1" cwd="$2" tool_name="$3" file_path="$4" content="${5:-x}"
  json_pretool "$session_id" "$cwd" "$tool_name" "$file_path" "$content" | bash hooks/grill-pretool.sh
}

run_stop() {
  local session_id="$1" transcript_path="$2"
  json_stop "$session_id" "$transcript_path" | bash hooks/verification-gate.sh
}

state_value() {
  local session_id="$1" key="$2"
  local state="$CLAUDE_PLUGIN_DATA/sessions/$session_id/state.json"
  jq -r --arg key "$key" '.[$key] // ""' "$state"
}

assert_empty() {
  local value="$1" label="$2"
  [[ -z "$value" ]] || fail "$label: expected empty output, got: $value"
}

assert_contains() {
  local haystack="$1" needle="$2" label="$3"
  [[ "$haystack" == *"$needle"* ]] || fail "$label: expected '$needle' in: $haystack"
}

question_session="q-then-work"
run_router "$question_session" "你觉得这个 hook 怎么样？"
question_grill="$(run_grill "$question_session" "你觉得这个 hook 怎么样？")"
assert_empty "$question_grill" "question prompt should not grill"
[[ "$(state_value "$question_session" last_prompt_kind)" == "question" ]] \
  || fail "question prompt should set last_prompt_kind=question"

run_router "$question_session" "Implement the hook cleanup"
[[ "$(state_value "$question_session" last_prompt_kind)" == "work" ]] \
  || fail "work prompt should restore last_prompt_kind=work"
[[ "$(state_value "$question_session" grilled)" != "skip-question" ]] \
  || fail "work prompt should clear legacy grilled=skip-question"

transcript="$TMP_ROOT/transcript.jsonl"
cat > "$transcript" <<'JSONL'
{"type":"assistant","message":{"content":[{"type":"tool_use","name":"Edit","input":{"file_path":"hooks/router.sh"}}]}}
{"type":"assistant","message":{"content":[{"type":"text","text":"done"}]}}
JSONL
gate_after_work="$(run_stop "$question_session" "$transcript")"
assert_contains "$gate_after_work" '"decision":"block"' "question skip must not stick to later work gate"

light_session="light-doc"
run_router "$light_session" "typo in docs"
light_grill="$(run_grill "$light_session" "typo in docs")"
assert_empty "$light_grill" "Light docs typo should not grill"

manual_grill_question_session="manual-grill-question"
run_router "$manual_grill_question_session" "Can you grill this plan?"
manual_grill_question="$(run_grill "$manual_grill_question_session" "Can you grill this plan?")"
assert_contains "$manual_grill_question" "do-it grill" "question-form explicit grill should still grill"

intent_session="intent-only"
run_router "$intent_session" "Implement the logging cleanup"
intent_grill="$(run_grill "$intent_session" "Implement the logging cleanup")"
assert_empty "$intent_grill" "intent-only Standard should not grill"

single_heavy_signal_session="single-heavy-signal"
run_router "$single_heavy_signal_session" "across packages refactor"
[[ "$(state_value "$single_heavy_signal_session" tier)" == "Standard" ]] \
  || fail "one heavy signal should stay Standard"

heavy_session="heavy-two-signals"
run_router "$heavy_session" "Prepare the release schema migration"
heavy_grill="$(run_grill "$heavy_session" "Prepare the release schema migration")"
assert_contains "$heavy_grill" "do-it grill (Heavy" "Heavy two-signal prompt should grill"

filler="$(printf 'neutral %.0s' {1..70})"
long_without_hint_session="long-without-hint"
run_router "$long_without_hint_session" "schema $filler"
long_without_hint_grill="$(run_grill "$long_without_hint_session" "schema $filler")"
assert_empty "$long_without_hint_grill" "long Standard prompt without topical hint should not grill"

long_with_hint_session="long-with-hint"
run_router "$long_with_hint_session" "schema 方案 $filler"
long_with_hint_grill="$(run_grill "$long_with_hint_session" "schema 方案 $filler")"
assert_contains "$long_with_hint_grill" "trigger: long-input" "long Standard prompt with topical hint should grill"

standard_edit_session="standard-edit"
run_router "$standard_edit_session" "Implement the source cleanup"
run_pretool "$standard_edit_session" "$REPO_ROOT" "Write" "$REPO_ROOT/src/example.js" "x" \
  || fail "Standard source edit should not require .do-it/plans"

durable_plan_project="$TMP_ROOT/durable-plan-project"
mkdir -p "$durable_plan_project"
durable_plan_session="durable-plan-request"
run_router "$durable_plan_session" "先确认修复计划" "$durable_plan_project"
[[ "$(state_value "$durable_plan_session" durable_plan_required)" == "1" ]] \
  || fail "explicit Chinese plan-first request should require durable plan"
if run_pretool "$durable_plan_session" "$durable_plan_project" "Write" "$durable_plan_project/src/example.js" "x" >/dev/null 2>&1; then
  fail "explicit durable-plan source edit without .do-it/plans should be blocked"
fi

heavy_edit_session="heavy-edit"
run_router "$heavy_edit_session" "Prepare the release schema migration"
if run_pretool "$heavy_edit_session" "$REPO_ROOT" "Write" "$REPO_ROOT/src/example.js" "x" >/dev/null 2>&1; then
  fail "Heavy source edit without .do-it/plans should be blocked"
fi

plan_project="$TMP_ROOT/project"
mkdir -p "$plan_project/.do-it/plans"
existing_plan="$plan_project/.do-it/plans/existing.md"
cat > "$existing_plan" <<'MARKDOWN'
# Existing Plan

## Grill

- already recorded
MARKDOWN

existing_plan_session="existing-plan"
run_router "$existing_plan_session" "Prepare the release schema migration" "$plan_project"
run_pretool "$existing_plan_session" "$plan_project" "Edit" "$existing_plan" "local note without heading" \
  || fail "Existing plan partial edit should not require repeating ## Grill"

echo "[test-hooks] ok"
