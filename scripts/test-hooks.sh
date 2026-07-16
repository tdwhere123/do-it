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

if grep -R -n -E '^[[:space:]]*(local|declare)[[:space:]][^#;]*-n' hooks/*.sh hooks/lib; then
  fail "hooks must stay compatible with macOS Bash 3.2; nameref local/declare -n is not allowed"
fi

json_prompt() {
  local session_id="$1" prompt="$2" cwd="${3:-$REPO_ROOT}"
  jq -nc --arg prompt "$prompt" --arg sid "$session_id" --arg cwd "$cwd" \
    '{prompt: $prompt, session_id: $sid, cwd: $cwd}'
}

json_stop() {
  local session_id="$1" transcript_path="$2"
  jq -nc --arg sid "$session_id" --arg transcript "$transcript_path" \
    '{session_id: $sid, transcript_path: $transcript, stop_hook_active: "false"}'
}

json_posttool() {
  local session_id="$1" cwd="$2" tool_name="$3" file_path="$4"
  jq -nc \
    --arg sid "$session_id" \
    --arg cwd "$cwd" \
    --arg tool "$tool_name" \
    --arg file_path "$file_path" \
    '{session_id: $sid, cwd: $cwd, tool_name: $tool, tool_input: {file_path: $file_path}}'
}

run_router() {
  local session_id="$1" prompt="$2" cwd="${3:-$REPO_ROOT}"
  json_prompt "$session_id" "$prompt" "$cwd" | bash hooks/router.sh >/dev/null
}

run_grill() {
  local session_id="$1" prompt="$2" cwd="${3:-$REPO_ROOT}"
  json_prompt "$session_id" "$prompt" "$cwd" | bash hooks/grill-prompt.sh
}

run_subagent_stance() {
  local session_id="$1" prompt="$2" cwd="${3:-$REPO_ROOT}" transcript="${4:-$TMP_ROOT/agents/child.jsonl}"
  mkdir -p "$(dirname "$transcript")"
  json_prompt "$session_id" "$prompt" "$cwd" \
    | jq --arg transcript "$transcript" '. + {transcript_path: $transcript}' \
    | bash hooks/subagent-stance.sh
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

assert_not_contains() {
  local haystack="$1" needle="$2" label="$3"
  [[ "$haystack" != *"$needle"* ]] || fail "$label: expected no '$needle' in: $haystack"
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
assert_contains "$gate_after_work" '"additionalContext"' "question skip must not stick to later work verify reminder"
assert_contains "$gate_after_work" 'do-it verify (advisory)' "later edited completion should receive verify reminder"

risk_question_session="risk-question-work"
run_router "$risk_question_session" "Can you publish the release to production?"
[[ "$(state_value "$risk_question_session" tier)" == "Heavy" ]] \
  || fail "high-consequence question should remain Heavy work"
[[ "$(state_value "$risk_question_session" last_prompt_kind)" == "work" ]] \
  || fail "high-consequence question should remain a work turn"
risk_question_grill="$(run_grill "$risk_question_session" "Can you publish the release to production?")"
assert_contains "$risk_question_grill" "do-it grill" "question wording must not suppress Heavy grill"
risk_question_gate="$(run_stop "$risk_question_session" "$transcript")"
assert_contains "$risk_question_gate" 'do-it verify (advisory)' "question wording must not suppress completion reminder"

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

brainstorm_session="brainstorm-is-not-escape"
run_router "$brainstorm_session" "brainstorm the Codex plugin distribution"
if [[ -f "$CLAUDE_PLUGIN_DATA/sessions/$brainstorm_session/skip-router" ]] \
  || [[ -f "$CLAUDE_PLUGIN_DATA/sessions/$brainstorm_session/skip-grill" ]] \
  || [[ -f "$CLAUDE_PLUGIN_DATA/sessions/$brainstorm_session/skip-gate" ]]; then
  fail "brainstorm should not set escape skip flags"
fi

single_heavy_signal_session="single-heavy-signal"
run_router "$single_heavy_signal_session" "across packages refactor"
[[ "$(state_value "$single_heavy_signal_session" tier)" == "Standard" ]] \
  || fail "one heavy signal should stay Standard"

heavy_session="heavy-two-signals"
run_router "$heavy_session" "Prepare the release schema migration"
heavy_grill="$(run_grill "$heavy_session" "Prepare the release schema migration")"
assert_contains "$heavy_grill" "do-it grill" "Heavy two-signal prompt should grill"
assert_contains "$heavy_grill" "heavy-tier" "Heavy grill should cite heavy-tier trigger"

subagent_session="subagent-stance"
subagent_out="$(run_subagent_stance "$subagent_session" "Fix the delegated test")"
assert_contains "$subagent_out" "do-it subagent stance" "subagent context should get compact stance"
subagent_repeat="$(run_subagent_stance "$subagent_session" "Continue delegated test")"
assert_empty "$subagent_repeat" "subagent stance should be one-shot per session"
parent_stance="$(json_prompt parent-stance "Fix src/a.ts" "$REPO_ROOT" | bash hooks/subagent-stance.sh)"
assert_empty "$parent_stance" "parent context should not get subagent stance"

filler="$(printf 'neutral %.0s' {1..70})"
long_without_hint_session="long-without-hint"
run_router "$long_without_hint_session" "schema $filler"
long_without_hint_grill="$(run_grill "$long_without_hint_session" "schema $filler")"
assert_not_contains "$long_without_hint_grill" "do-it grill" "long Standard prompt without code object should not grill"

long_with_hint_session="long-with-hint"
run_router "$long_with_hint_session" "schema 方案 $filler"
long_with_hint_grill="$(run_grill "$long_with_hint_session" "schema 方案 $filler")"
assert_not_contains "$long_with_hint_grill" "do-it grill" "long Standard prompt alone should not grill (long-input trigger removed)"

# Dim-aware grill suppression: Standard tier with uncertainty word but no code
# object (`dim_touches_code=0`) should be treated as discussion and silenced.
nocode_uncertain_session="nocode-uncertain-grill"
run_router "$nocode_uncertain_session" "release 我想确认一下"
[[ "$(state_value "$nocode_uncertain_session" tier)" == "Standard" ]] \
  || fail "release+uncertainty should classify as Standard"
[[ "$(state_value "$nocode_uncertain_session" dim_touches_code)" == "0" ]] \
  || fail "release+uncertainty should set dim_touches_code=0"
nocode_uncertain_grill="$(run_grill "$nocode_uncertain_session" "release 我想确认一下")"
assert_empty "$nocode_uncertain_grill" "Standard + uncertainty + dim_touches_code=0 should suppress grill"

# Counter-case: Standard + uncertainty + code object stays silent (Heavy-only grill).
withcode_session="withcode-uncertain-grill"
run_router "$withcode_session" "release 我想确认 src/release.ts"
[[ "$(state_value "$withcode_session" tier)" == "Standard" ]] \
  || fail "release+file should classify as Standard"
[[ "$(state_value "$withcode_session" dim_touches_code)" == "1" ]] \
  || fail "release+file should set dim_touches_code=1"
withcode_grill="$(run_grill "$withcode_session" "release 我想确认 src/release.ts")"
assert_not_contains "$withcode_grill" "do-it grill" "Standard + uncertainty must not grill after Heavy-only slim"

# ---- advisory nudges (plan-card reliability + existing-codebase) ----

# Plan-card nudge: after grill on durable-plan work with no plan card, a later
# grilled turn emits a one-shot plan-card nudge.
nudge_project="$TMP_ROOT/plan-nudge-project"
mkdir -p "$nudge_project"
plan_nudge_session="plan-card-nudge"
run_router "$plan_nudge_session" "Prepare the release schema migration" "$nudge_project"
run_grill "$plan_nudge_session" "Prepare the release schema migration" "$nudge_project" >/dev/null
[[ "$(state_value "$plan_nudge_session" durable_plan_seen)" == "1" ]] \
  || fail "Heavy turn should set durable_plan_seen"
run_router "$plan_nudge_session" "ok implement it" "$nudge_project"
plan_nudge_out="$(run_grill "$plan_nudge_session" "ok implement it" "$nudge_project")"
assert_contains "$plan_nudge_out" "do-it decide: this is durable coordination work" \
  "durable coordination without a plan card should nudge decide"

# one-shot: a third turn does not repeat the plan nudge
run_router "$plan_nudge_session" "continue implementing" "$nudge_project"
plan_nudge_repeat="$(run_grill "$plan_nudge_session" "continue implementing" "$nudge_project")"
[[ "$plan_nudge_repeat" != *"do-it decide: this is durable coordination work"* ]] \
  || fail "plan-card nudge should be one-shot per session"

# with a plan card present, no plan nudge
nudge_has_plan="$TMP_ROOT/plan-present-project"
mkdir -p "$nudge_has_plan/.do-it/plans"
printf '# plan\n' > "$nudge_has_plan/.do-it/plans/task.md"
has_plan_session="plan-present"
run_router "$has_plan_session" "Prepare the release schema migration" "$nudge_has_plan"
run_grill "$has_plan_session" "Prepare the release schema migration" "$nudge_has_plan" >/dev/null
run_router "$has_plan_session" "ok implement it" "$nudge_has_plan"
has_plan_out="$(run_grill "$has_plan_session" "ok implement it" "$nudge_has_plan")"
[[ "$has_plan_out" != *"do-it decide: this is durable coordination work"* ]] \
  || fail "existing plan card should suppress the planning nudge"

# Port/restore intent emits a one-shot "grep current code first" nudge.
port_session="port-intent-nudge"
run_router "$port_session" "port the BudgetService from v0.1" "$REPO_ROOT"
[[ "$(state_value "$port_session" port_intent)" == "1" ]] \
  || fail "port prompt should set port_intent"
port_out="$(run_grill "$port_session" "port the BudgetService from v0.1" "$REPO_ROOT")"
assert_contains "$port_out" "port / restore / reintroduce work" \
  "port intent should nudge to grep current code first"

# Established project (has .do-it/CONTEXT.md) + Standard code edit emits the
# read-existing nudge; a greenfield repo does not.
brown_project="$TMP_ROOT/brownfield-project"
mkdir -p "$brown_project/.do-it"
printf '# context\n' > "$brown_project/.do-it/CONTEXT.md"
brown_session="brownfield-nudge"
run_router "$brown_session" "Implement the cleanup in src/util.ts" "$brown_project"
[[ "$(state_value "$brown_session" dim_brownfield)" == "1" ]] \
  || fail "project with .do-it/CONTEXT.md should set dim_brownfield"
brown_out="$(run_grill "$brown_session" "Implement the cleanup in src/util.ts" "$brown_project")"
assert_contains "$brown_out" "established codebase" \
  "brownfield Standard code edit should nudge read-existing"

greenfield_project="$TMP_ROOT/greenfield-project"
mkdir -p "$greenfield_project"
greenfield_session="greenfield-no-nudge"
run_router "$greenfield_session" "Implement the cleanup in src/util.ts" "$greenfield_project"
green_out="$(run_grill "$greenfield_session" "Implement the cleanup in src/util.ts" "$greenfield_project")"
[[ "$green_out" != *"established codebase"* ]] \
  || fail "greenfield repo should not emit the read-existing nudge"

# A Chinese no-write request is a session boundary, not merely a generic
# reminder. It must survive a follow-up turn, keep port/brownfield nudges
# inspection-only, and clear only after explicit implementation permission.
no_write_port_project="$TMP_ROOT/no-write-port-project"
mkdir -p "$no_write_port_project"
no_write_port_session="no-write-port"
no_write_port_prompt="先不改代码；先移植 BudgetService 前排查现有实现。"
run_router "$no_write_port_session" "$no_write_port_prompt" "$no_write_port_project"
[[ "$(state_value "$no_write_port_session" no_write_boundary)" == "1" ]] \
  || fail "Chinese 先不改代码 should persist no_write_boundary=1"
no_write_port_out="$(run_grill "$no_write_port_session" "$no_write_port_prompt" "$no_write_port_project")"
assert_contains "$no_write_port_out" "no-write boundary" \
  "port nudge must make the active no-write boundary explicit"
assert_not_contains "$no_write_port_out" "Before writing" \
  "port nudge must not encourage writing under a no-write boundary"

no_write_brown_project="$TMP_ROOT/no-write-brownfield-project"
mkdir -p "$no_write_brown_project/.do-it"
printf '# context\n' > "$no_write_brown_project/.do-it/CONTEXT.md"
no_write_brown_session="no-write-brownfield"
no_write_brown_prompt="先不改，先审查 src/util.ts 的现有实现。"
run_router "$no_write_brown_session" "$no_write_brown_prompt" "$no_write_brown_project"
[[ "$(state_value "$no_write_brown_session" no_write_boundary)" == "1" ]] \
  || fail "Chinese 先不改 should persist no_write_boundary=1"
no_write_brown_out="$(run_grill "$no_write_brown_session" "$no_write_brown_prompt" "$no_write_brown_project")"
assert_contains "$no_write_brown_out" "no-write boundary" \
  "brownfield nudge must make the active no-write boundary explicit"
assert_not_contains "$no_write_brown_out" "Before editing" \
  "brownfield nudge must not encourage editing under a no-write boundary"

no_write_followup="$(json_prompt "$no_write_brown_session" "继续排查 src/util.ts 的调用方。" "$no_write_brown_project" | bash hooks/router.sh)"
assert_contains "$no_write_followup" "no-write boundary" \
  "follow-up work turn must retain the no-write boundary"
[[ "$(state_value "$no_write_brown_session" no_write_boundary)" == "1" ]] \
  || fail "follow-up work turn should not clear no_write_boundary"

# A mutation word inside an explanation is not permission to reopen writes.
# This is deliberately the same ambiguous shape that previously routed a
# repair request incorrectly: "why ... fix" must retain the user boundary
# unless the user explicitly says implementation may resume.
no_write_explanation="$(json_prompt "$no_write_brown_session" "为什么要修复 src/util.ts？" "$no_write_brown_project" | bash hooks/router.sh)"
assert_contains "$no_write_explanation" "no-write boundary" \
  "an explanatory why+fix prompt must not implicitly reopen writes"
[[ "$(state_value "$no_write_brown_session" no_write_boundary)" == "1" ]] \
  || fail "an explanatory why+fix prompt must retain no_write_boundary"

# Asking whether a change may resume is not the same as authorizing it.
no_write_permission_question="$(json_prompt "$no_write_brown_session" "现在可以改吗？" "$no_write_brown_project" | bash hooks/router.sh)"
assert_contains "$no_write_permission_question" "no-write boundary" \
  "a permission question must not implicitly reopen writes"
[[ "$(state_value "$no_write_brown_session" no_write_boundary)" == "1" ]] \
  || fail "a permission question must retain no_write_boundary"

run_router "$no_write_brown_session" "现在可以开始实现 src/util.ts。" "$no_write_brown_project"
[[ "$(state_value "$no_write_brown_session" no_write_boundary)" == "0" ]] \
  || fail "explicit implementation permission should clear no_write_boundary"

echo "[test-hooks] ok"
