#!/usr/bin/env bash
# Opt-in learning recorder: silent default-off, redacted observations, no policy.

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
HOOK="$REPO_ROOT/hooks/learning-recorder.sh"
[[ -x "$HOOK" || -f "$HOOK" ]] || { echo "FAIL: missing $HOOK" >&2; exit 1; }

PASS=0
FAIL=0
TMP_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/do-it-learning-test.XXXXXX")"
export GIT_CONFIG_GLOBAL=/dev/null
export GIT_CONFIG_SYSTEM=/dev/null
unset GIT_DIR GIT_WORK_TREE

cleanup() { chmod -R u+w "$TMP_ROOT" 2>/dev/null || true; rm -rf "$TMP_ROOT"; }
trap cleanup EXIT

_pass() { echo "  ok: $1"; PASS=$((PASS + 1)); }
_fail() { echo "  FAIL: $1" >&2; FAIL=$((FAIL + 1)); }

_run() {
  local session_id="$1" prompt="$2" cwd="$3" extra="${4-}"
  [[ -n "$extra" ]] || extra='{}'
  jq -nc --arg sid "$session_id" --arg prompt "$prompt" --arg cwd "$cwd" --argjson extra "$extra" \
    '{session_id:$sid, prompt:$prompt, cwd:$cwd} + $extra' \
    | CLAUDE_PLUGIN_DATA="$TMP_ROOT/plugin-data" CLAUDE_PLUGIN_ROOT="/tmp/do-it-plugin" \
      env -u KIMI_CODE_HOME -u KIMI_PLUGIN_ROOT bash "$HOOK"
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
  local file="$1"
  [[ -f "$file" ]] || { printf '0'; return 0; }
  wc -l < "$file" | tr -d ' '
}

project="$TMP_ROOT/project"
mkdir -p "$project"
runtime="$project/.do-it/runtime"
config="$runtime/retrospective/config.json"
learning="$runtime/events/learning.jsonl"
compat="$runtime/retrospective/events.jsonl"

echo "Case 1: logging off is silent and creates no files"
out="$(_run s1 'do-it 的行为不对，为什么没有调用子智能体？' "$project")"
_assert_empty "disabled recorder is silent" "$out"
_assert "disabled recorder creates no runtime directory" "[[ ! -e \"$runtime\" ]]"
_assert "disabled recorder creates no learning log" "[[ ! -e \"$learning\" ]]"

echo "Case 2: exact slash command enables without an event"
out="$(_run s1 '/do-it-retrospective on' "$project" '{"hook_event_name":"UserPromptExpansion","command_name":"do-it-retrospective"}')"
_assert_empty "enable command is silent" "$out"
_assert "enable command writes local config" "jq -e '.schema == 1 and .enabled == true' \"$config\" >/dev/null"
_assert "runtime is self-ignored" "grep -qx '\\*' \"$runtime/.gitignore\""
_assert "enable command does not create a learning event" "[[ ! -e \"$learning\" ]]"

echo "Case 3: user feedback is redacted; session id is hashed"
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
_assert "learning event has schema 1 user_feedback" "jq -e '.schema == 1 and .kind == \"user_feedback\" and .source == \"user\" and .host == \"claude\" and .privacy == \"redacted-excerpt\" and (.session_hash | test(\"^[0-9a-f]{12}$\")) and (.signals | index(\"delegation\") != null)' \"$learning\" >/dev/null"
_assert "compat copy exists" "[[ -f \"$compat\" ]]"
_assert "feedback keeps a redacted excerpt" "jq -e '.prompt_excerpt | contains(\"[REDACTED_SECRET]\")' \"$learning\" >/dev/null"
_assert "feedback redacts local identifiers" "jq -e '.prompt_excerpt | contains(\"[REDACTED_EMAIL]\") and contains(\"[REDACTED_URL]\") and contains(\"[REDACTED_PATH]\") and contains(\"[REDACTED_JWT]\") and contains(\"[REDACTED_CODE]\")' \"$learning\" >/dev/null"
_assert "omits raw credential, paths, code, and session id" "! grep -Fq \"$secret\" \"$learning\" && ! grep -Fq \"$email\" \"$learning\" && ! grep -Fq \"$url\" \"$learning\" && ! grep -Fq \"$absolute_path\" \"$learning\" && ! grep -Fq \"$windows_path\" \"$learning\" && ! grep -Fq \"$jwt\" \"$learning\" && ! grep -Fq 'never-store-this' \"$learning\" && ! grep -Fq s1 \"$learning\""
mode="$(stat -c %a "$learning" 2>/dev/null || stat -f %OLp "$learning")"
_assert "learning.jsonl mode is 600" "[[ \"$mode\" == \"600\" ]]"

line_count="$(_event_count "$learning")"
out="$(_run s1 "$prompt" "$project")"
_assert_empty "duplicate feedback remains silent" "$out"
_assert "same session/prompt is deduplicated" "[[ \"$(_event_count "$learning")\" == \"$line_count\" ]]"

echo "Case 4: malformed payload and invalid kind are dropped"
out="$(printf '{not-json' | CLAUDE_PLUGIN_DATA="$TMP_ROOT/plugin-data" bash "$HOOK")"
_assert_empty "malformed stdin is silent" "$out"
_assert "malformed stdin does not add an event" "[[ \"$(_event_count "$learning")\" == \"$line_count\" ]]"
out="$(_run s1 '' "$project" '{"learning":{"kind":"not-a-kind","source":"observed","summary":"nope"}}')"
_assert_empty "invalid kind is silent" "$out"
_assert "invalid kind is dropped" "[[ \"$(_event_count "$learning")\" == \"$line_count\" ]]"

echo "Case 5: objective workflow events are observations"
out="$(_run s-obj '' "$project" '{"hook_event_name":"PostToolUse","tool_name":"Edit","tool_input":{"file_path":"src/unrelated.ts"},"learning":{"kind":"edit","source":"observed","signals":["scope-creep"],"summary":"edit outside active contract"}}')"
_assert_empty "scope-creep observation is silent" "$out"
_assert "scope-creep is recorded as edit observation" "jq -s -e 'map(select(.kind==\"edit\" and .source==\"observed\" and (.signals|index(\"scope-creep\")!=null))) | length > 0' \"$learning\" >/dev/null"
out="$(_run s-rev '' "$project" '{"learning":{"kind":"review","source":"observed","signals":["review-blocking"],"summary":"review blocking"}}')"
_assert_empty "review-blocking observation is silent" "$out"
_assert "review-blocking is recorded" "jq -s -e 'map(select(.kind==\"review\" and (.signals|index(\"review-blocking\")!=null))) | length > 0' \"$learning\" >/dev/null"

echo "Case 6: harvest completion-after-edit from evidence ledger"
mkdir -p "$runtime/events"
printf '%s\n' '{"schema":1,"event_id":"E-harvest-1","recorded_at":"2026-08-31T00:00:00Z","kind":"edit","source":"observed","host":"claude","summary":"edit README","worktree":{"head":null,"fingerprint":null,"coverage":"unavailable"}}' \
  '{"schema":1,"event_id":"E-harvest-2","recorded_at":"2026-08-31T00:00:01Z","kind":"completion-claim","source":"reported","host":"claude","summary":"completion language observed","worktree":{"head":null,"fingerprint":null,"coverage":"unavailable"}}' \
  > "$runtime/events/evidence.jsonl"
before="$(_event_count "$learning")"
fb_before="$(jq -s 'map(select(.kind=="user_feedback")) | length' "$learning")"
out="$(_run s-harvest '请修复 src/auth.ts。' "$project")"
_assert_empty "ordinary prompt stays silent while harvesting" "$out"
fb_after="$(jq -s 'map(select(.kind=="user_feedback")) | length' "$learning")"
_assert "ordinary prompt is not stored as user_feedback" "[[ \"$fb_before\" == \"$fb_after\" ]]"
after="$(_event_count "$learning")"
_assert "harvest added objective events" "[[ \"$after\" -gt \"$before\" ]]"
_assert "harvested completion-after-edit" "jq -s -e 'map(select(.kind==\"completion\" and .source==\"reported\" and (.signals|index(\"completion-after-edit\")!=null))) | length > 0' \"$learning\" >/dev/null"
_assert "harvest does not backfill raw session id" "! grep -Fq s-harvest \"$learning\""

echo "Case 7: Stop payload records completion-after-edit when evidence exists"
out="$(_run s-stop '' "$project" '{"hook_event_name":"Stop","transcript_path":"/tmp/t.jsonl"}')"
_assert_empty "stop observation is silent" "$out"
_assert "stop records completion observation" "jq -s -e 'map(select(.kind==\"completion\")) | length > 0' \"$learning\" >/dev/null"

echo "Case 8: report/status do not write profile or Core"
profile="$runtime/adaptive/profile.md"
mkdir -p "$runtime/adaptive"
core_before="$(wc -c < "$REPO_ROOT/skills/do-it/do-it-core/SKILL.md" | tr -d ' ')"
out="$(_run s1 '/do-it-retrospective report' "$project" '{"hook_event_name":"UserPromptExpansion","command_name":"do-it-retrospective"}')"
_assert_empty "report command stays silent" "$out"
_assert "report does not create adaptive profile" "[[ ! -e \"$profile\" ]]"
out="$(_run s1 '/do-it-retrospective status' "$project" '{"hook_event_name":"UserPromptExpansion","command_name":"do-it-retrospective"}')"
_assert_empty "status command stays silent" "$out"
core_after="$(wc -c < "$REPO_ROOT/skills/do-it/do-it-core/SKILL.md" | tr -d ' ')"
_assert "report does not write Core" "[[ \"$core_before\" == \"$core_after\" ]]"

echo "Case 9: off stops future recording; child context is skipped"
out="$(_run s1 '/do-it-retrospective off' "$project" '{"hook_event_name":"UserPromptExpansion","command_name":"do-it-retrospective"}')"
_assert_empty "disable command is silent" "$out"
_assert "disable command writes disabled config" "jq -e '.enabled == false' \"$config\" >/dev/null"
frozen="$(_event_count "$learning")"
out="$(_run s1 'do-it 的行为不对。' "$project")"
_assert_empty "disabled post-feedback turn is silent" "$out"
_assert "disabled recorder keeps event count unchanged" "[[ \"$(_event_count "$learning")\" == \"$frozen\" ]]"
# re-enable to test child skip still works
_run s1 '/do-it-retrospective on' "$project" '{"hook_event_name":"UserPromptExpansion","command_name":"do-it-retrospective"}' >/dev/null
out="$(_run s-child 'do-it 的行为不对。' "$project" '{"agent_id":"agent-child","agent_type":"general-purpose"}')"
_assert_empty "explicit agent metadata is silent" "$out"
_assert "explicit agent metadata is not recorded" "[[ \"$(_event_count "$learning")\" == \"$frozen\" ]]"

echo "Case 10: hashed session ids differ across sessions and never store the raw id"
_run s1 '/do-it-retrospective on' "$project" '{"hook_event_name":"UserPromptExpansion","command_name":"do-it-retrospective"}' >/dev/null
_run sess-alpha 'do-it behavior is unexpected: delegation was missed' "$project" >/dev/null
_run sess-beta 'do-it behavior is unexpected: delegation was missed' "$project" >/dev/null
hashes="$(jq -r 'select(.kind=="user_feedback") | .session_hash' "$learning" | sort -u)"
hash_n="$(printf '%s\n' "$hashes" | grep -c . | tr -d ' ')"
_assert "cross-session hashes are distinct" "[[ \"$hash_n\" -ge 2 ]]"
_assert "raw session ids are absent" "! grep -Fq sess-alpha \"$learning\" && ! grep -Fq sess-beta \"$learning\""

if [[ "$FAIL" -ne 0 ]]; then
  echo "FAIL: $FAIL test(s) failed" >&2
  exit 1
fi

echo "ok: $PASS tests"
