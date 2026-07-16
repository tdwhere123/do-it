#!/usr/bin/env bash
# Regression tests for hooks/behavior-feedback.sh. The recorder is deliberately
# opt-in, silent, local, and bounded: it must not create state while disabled or
# retain raw credentials when enabled.

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
HOOK="$REPO_ROOT/hooks/behavior-feedback.sh"
[[ -x "$HOOK" || -f "$HOOK" ]] || { echo "FAIL: missing $HOOK" >&2; exit 1; }

PASS=0
FAIL=0
TMP_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/do-it-feedback-test.XXXXXX")"

cleanup() { rm -rf "$TMP_ROOT"; }
trap cleanup EXIT

_pass() { echo "  ok: $1"; PASS=$((PASS + 1)); }
_fail() { echo "  FAIL: $1" >&2; FAIL=$((FAIL + 1)); }

_run() {
  local session_id="$1" prompt="$2" cwd="$3" transcript="${4:-}" agent_id="${5:-}" agent_type="${6:-}" event_name="${7:-}" command_name="${8:-}"
  jq -nc --arg sid "$session_id" --arg prompt "$prompt" --arg cwd "$cwd" --arg transcript "$transcript" --arg agent_id "$agent_id" --arg agent_type "$agent_type" --arg event_name "$event_name" --arg command_name "$command_name" \
    '{session_id:$sid, prompt:$prompt, cwd:$cwd, transcript_path:$transcript, agent_id:$agent_id, agent_type:$agent_type, hook_event_name:$event_name, command_name:$command_name}' \
    | CLAUDE_PLUGIN_DATA="$TMP_ROOT/plugin-data" CLAUDE_PLUGIN_ROOT="/tmp/do-it-plugin" bash "$HOOK"
}

_assert_empty() {
  local label="$1" value="$2"
  if [[ -z "$value" ]]; then _pass "$label"; else _fail "$label emitted output: $value"; fi
}

_assert() {
  local label="$1" condition="$2"
  if eval "$condition"; then _pass "$label"; else _fail "$label"; fi
}

_event_count() {
  wc -l < "$events" | tr -d ' '
}

project="$TMP_ROOT/project"
mkdir -p "$project"
runtime="$project/.do-it/runtime"
config="$runtime/retrospective/config.json"
events="$runtime/retrospective/events.jsonl"

echo "Case 1: default is disabled and leaves no project state"
out="$(_run s1 'do-it 的行为不对，为什么没有调用子智能体？' "$project")"
_assert_empty "disabled recorder is silent" "$out"
_assert "disabled recorder creates no runtime directory" "[[ ! -e \"$runtime\" ]]"

echo "Case 2: exact slash command enables local recording without an event"
out="$(_run s1 '/do-it-retrospective on' "$project" '' '' '' 'UserPromptExpansion' 'do-it-retrospective')"
_assert_empty "enable command is silent" "$out"
_assert "enable command writes local config" "jq -e '.schema == 1 and .enabled == true' \"$config\" >/dev/null"
_assert "runtime is self-ignored" "grep -qx '\\*' \"$runtime/.gitignore\""
_assert "enable command does not create an event" "[[ ! -e \"$events\" ]]"

echo "Case 3: explicit behavioral feedback records a redacted local excerpt once"
secret='sk-abcdefghijklmnopqrstuvwxyz123456'
email='person@example.test'
url='https://example.test/private?token=long-secret-value'
absolute_path='/var/folders/do-it-feedback-test/private/src/auth.ts'
windows_path='C:\Users\do-it\private\src\auth.ts'
jwt='eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJwcml2YXRlLXVzZXIifQ.signature-value-123456'
code='```const apiKey = "never-store-this";```'
prompt="do-it 的行为不对：你没有调用我预先设计好的子智能体。Bearer $secret access_token=long-secret-value email=$email url=$url path=$absolute_path windows_path=$windows_path jwt=$jwt $code"
out="$(_run s1 "$prompt" "$project")"
_assert_empty "feedback recorder is silent" "$out"
_assert "feedback event has bounded schema" "jq -e '.schema == 1 and .kind == \"behavior-feedback\" and .host == \"claude\" and (.session | test(\"^[0-9a-f]{12}$\")) and (.signals | contains(\"delegation\"))' \"$events\" >/dev/null"
_assert "feedback event keeps a redacted excerpt" "jq -e '.prompt_excerpt | contains(\"[REDACTED_SECRET]\")' \"$events\" >/dev/null"
_assert "feedback event redacts common local identifiers" "jq -e '.prompt_excerpt | contains(\"[REDACTED_EMAIL]\") and contains(\"[REDACTED_URL]\") and contains(\"[REDACTED_PATH]\") and contains(\"[REDACTED_JWT]\") and contains(\"[REDACTED_CODE]\")' \"$events\" >/dev/null"
_assert "feedback event omits raw credential, local identifiers, code, and session id" "! grep -Fq \"$secret\" \"$events\" && ! grep -Fq \"$email\" \"$events\" && ! grep -Fq \"$url\" \"$events\" && ! grep -Fq \"$absolute_path\" \"$events\" && ! grep -Fq \"$windows_path\" \"$events\" && ! grep -Fq \"$jwt\" \"$events\" && ! grep -Fq 'never-store-this' \"$events\" && ! grep -Fq s1 \"$events\""

line_count="$(wc -l < "$events" | tr -d ' ')"
out="$(_run s1 "$prompt" "$project")"
_assert_empty "duplicate feedback remains silent" "$out"
_assert "same session/prompt is deduplicated" "[[ \"$(_event_count)\" == \"$line_count\" ]]"

echo "Case 4: unrelated prompts and child context do not create events"
out="$(_run s1 '请修复 src/auth.ts。' "$project")"
_assert_empty "ordinary implementation prompt is silent" "$out"
_assert "ordinary implementation prompt is not recorded" "[[ \"$(_event_count)\" == \"$line_count\" ]]"
out="$(_run s1 '你觉得这个算法为什么不对？' "$project")"
_assert_empty "ordinary question addressed to the assistant is silent" "$out"
_assert "ordinary assistant question is not recorded" "[[ \"$(_event_count)\" == \"$line_count\" ]]"
out="$(_run s1 'Fix the agent parser\x27s unexpected default.' "$project")"
_assert_empty "ordinary English agent task is silent" "$out"
_assert "ordinary English agent task is not recorded" "[[ \"$(_event_count)\" == \"$line_count\" ]]"
out="$(_run s2 '你这样做不对。' "$project" '/tmp/agents/child.jsonl')"
_assert_empty "child feedback hook is silent" "$out"
_assert "child context is not recorded" "[[ \"$(_event_count)\" == \"$line_count\" ]]"
out="$(_run s3 'do-it 的行为不对。' "$project" '/tmp/subagents/agent-child.jsonl')"
_assert_empty "Claude subagents transcript is silent" "$out"
_assert "Claude subagents transcript is not recorded" "[[ \"$(_event_count)\" == \"$line_count\" ]]"
out="$(_run s4 'do-it 的行为不对。' "$project" '' 'agent-child' 'general-purpose')"
_assert_empty "explicit agent metadata is silent" "$out"
_assert "explicit agent metadata is not recorded" "[[ \"$(_event_count)\" == \"$line_count\" ]]"

echo "Case 5: report stays silent at hook level; off stops future recording and prose does not toggle state"
out="$(_run s1 '/do-it-retrospective report' "$project" '' '' '' 'UserPromptExpansion' 'do-it-retrospective')"
_assert_empty "report command stays silent for the hook" "$out"
_assert "report command does not create an event" "[[ \"$(_event_count)\" == \"$line_count\" ]]"
out="$(_run s1 '/do-it-retrospective off' "$project" '' '' '' 'UserPromptExpansion' 'do-it-retrospective')"
_assert_empty "disable command is silent" "$out"
_assert "disable command writes disabled config" "jq -e '.enabled == false' \"$config\" >/dev/null"
out="$(_run s1 '说明 /do-it-retrospective on 如何使用。' "$project")"
_assert_empty "documentation prose is silent" "$out"
_assert "documentation prose does not re-enable recording" "jq -e '.enabled == false' \"$config\" >/dev/null"
out="$(_run s1 '你这次的行为不符合预期。' "$project")"
_assert_empty "disabled post-feedback turn is silent" "$out"
_assert "disabled recorder keeps event count unchanged" "[[ \"$(_event_count)\" == \"$line_count\" ]]"
out="$(_run s1 '/another-command on' "$project" '' '' '' 'UserPromptExpansion' 'another-command')"
_assert_empty "unrelated slash expansion stays silent" "$out"
_assert "unrelated slash expansion does not create an event" "[[ \"$(_event_count)\" == \"$line_count\" ]]"

if [[ "$FAIL" -ne 0 ]]; then
  echo "FAIL: $FAIL test(s) failed" >&2
  exit 1
fi

echo "ok: $PASS tests"
