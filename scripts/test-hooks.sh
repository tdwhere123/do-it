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

json_pretool_path() {
  local session_id="$1" cwd="$2" tool_name="$3" path="$4" content="${5:-}"
  jq -nc \
    --arg sid "$session_id" \
    --arg cwd "$cwd" \
    --arg tool "$tool_name" \
    --arg path "$path" \
    --arg content "$content" \
    '{session_id: $sid, cwd: $cwd, tool_name: $tool, tool_input: {path: $path, content: $content, new_string: $content}}'
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
assert_contains "$heavy_grill" "do-it grill (Heavy" "Heavy two-signal prompt should grill"

subagent_session="subagent-stance"
subagent_out="$(run_subagent_stance "$subagent_session" "Fix the delegated test")"
assert_contains "$subagent_out" "do-it subagent stance" "subagent context should get compact stance"
subagent_repeat="$(run_subagent_stance "$subagent_session" "Continue delegated test")"
assert_empty "$subagent_repeat" "subagent stance should be one-shot per session"
parent_stance="$(json_prompt parent-stance "Fix src/a.ts" "$REPO_ROOT" | bash hooks/subagent-stance.sh)"
assert_empty "$parent_stance" "parent context should not get subagent stance"

# Handbook bootstrap nudge: first Heavy/Standard code turn in a greenfield
# project should advise bootstrapping the handbook skeleton.
greenfield_project="$TMP_ROOT/greenfield-project"
mkdir -p "$greenfield_project"
handbook_nudge_session="handbook-nudge"
run_router "$handbook_nudge_session" "Fix the bug in src/auth.ts" "$greenfield_project"
handbook_nudge_grill="$(run_grill "$handbook_nudge_session" "Fix the bug in src/auth.ts" "$greenfield_project")"
assert_contains "$handbook_nudge_grill" "do-it (handbook)" "greenfield Standard code turn should nudge handbook bootstrap"
[[ "$(state_value "$handbook_nudge_session" handbook_nudged)" == "1" ]] \
  || fail "handbook nudge should set handbook_nudged=1"

# Existing .do-it/CONTEXT.md should suppress the handbook nudge.
brownfield_project="$TMP_ROOT/brownfield-project"
mkdir -p "$brownfield_project/.do-it"
touch "$brownfield_project/.do-it/CONTEXT.md"
handbook_suppress_session="handbook-suppress"
run_router "$handbook_suppress_session" "Implement the logging cleanup" "$brownfield_project"
handbook_suppress_grill="$(run_grill "$handbook_suppress_session" "Implement the logging cleanup" "$brownfield_project")"
assert_empty "$handbook_suppress_grill" "existing CONTEXT.md should suppress handbook nudge"

filler="$(printf 'neutral %.0s' {1..70})"
long_without_hint_session="long-without-hint"
run_router "$long_without_hint_session" "schema $filler"
long_without_hint_grill="$(run_grill "$long_without_hint_session" "schema $filler")"
assert_not_contains "$long_without_hint_grill" "do-it grill" "long Standard prompt without code object should not grill"

long_with_hint_session="long-with-hint"
run_router "$long_with_hint_session" "schema 方案 $filler"
long_with_hint_grill="$(run_grill "$long_with_hint_session" "schema 方案 $filler")"
assert_not_contains "$long_with_hint_grill" "do-it grill" "long Standard prompt alone should not grill (long-input trigger removed)"

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

heavy_path_session="heavy-edit-path"
run_router "$heavy_path_session" "Prepare the release schema migration"
if json_pretool_path "$heavy_path_session" "$REPO_ROOT" "StrReplace" "$REPO_ROOT/src/example.js" "x" \
     | bash hooks/grill-pretool.sh >/dev/null 2>&1; then
  fail "Heavy StrReplace via tool_input.path should be blocked without plan"
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

# Counter-case: same uncertainty word with a code object should still grill.
withcode_session="withcode-uncertain-grill"
run_router "$withcode_session" "release 我想确认 src/release.ts"
[[ "$(state_value "$withcode_session" tier)" == "Standard" ]] \
  || fail "release+file should classify as Standard"
[[ "$(state_value "$withcode_session" dim_touches_code)" == "1" ]] \
  || fail "release+file should set dim_touches_code=1"
withcode_grill="$(run_grill "$withcode_session" "release 我想确认 src/release.ts")"
assert_contains "$withcode_grill" "do-it grill (uncertainty)" "Standard + uncertainty + dim_touches_code=1 should still grill"

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
assert_contains "$plan_nudge_out" "no .do-it/plans/<slug>.md exists yet" \
  "post-grill durable work with no plan card should nudge planning"

# one-shot: a third turn does not repeat the plan nudge
run_router "$plan_nudge_session" "continue implementing" "$nudge_project"
plan_nudge_repeat="$(run_grill "$plan_nudge_session" "continue implementing" "$nudge_project")"
[[ "$plan_nudge_repeat" != *"no .do-it/plans/<slug>.md exists yet"* ]] \
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
[[ "$has_plan_out" != *"no .do-it/plans/<slug>.md exists yet"* ]] \
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

echo "[test-hooks] ok"
