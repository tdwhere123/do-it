#!/usr/bin/env bash
# Retrospective v2 report: observations only; never writes profile or Core.

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RECORDER="$REPO_ROOT/hooks/learning-recorder.sh"
SKILL="$REPO_ROOT/skills/do-it/do-it-retrospective/SKILL.md"
COMMAND="$REPO_ROOT/commands/do-it-retrospective.md"
FIXTURES="$REPO_ROOT/tests/fixtures/retrospective"

[[ -f "$RECORDER" ]] || { echo "FAIL: missing $RECORDER" >&2; exit 1; }
[[ -f "$SKILL" ]] || { echo "FAIL: missing $SKILL" >&2; exit 1; }
[[ -f "$COMMAND" ]] || { echo "FAIL: missing $COMMAND" >&2; exit 1; }

PASS=0
FAIL=0
TMP_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/do-it-retro-report.XXXXXX")"

cleanup() { rm -rf "$TMP_ROOT"; }
trap cleanup EXIT

_pass() { echo "  ok: $1"; PASS=$((PASS + 1)); }
_fail() { echo "  FAIL: $1" >&2; FAIL=$((FAIL + 1)); }

# shellcheck source=../hooks/learning-recorder.sh
source "$RECORDER"

_setup_project() {
  local name="$1" fixture="$2"
  local dir="$TMP_ROOT/$name"
  mkdir -p "$dir/.do-it/runtime/events" "$dir/.do-it/runtime/retrospective" "$dir/.do-it/runtime/adaptive"
  printf '{"schema":1,"enabled":true}\n' > "$dir/.do-it/runtime/retrospective/config.json"
  cp "$fixture" "$dir/.do-it/runtime/events/learning.jsonl"
  printf '%s' "$dir"
}

echo "Case 1: skill and command forbid auto-writing profile/core"
if grep -q 'adaptive profile' "$SKILL" && grep -q 'do-it-core' "$SKILL" \
   && grep -q 'Candidate policies (max 3)' "$SKILL" \
   && grep -q 'no-action' "$SKILL" \
   && grep -q 'Never auto-write' "$SKILL"; then
  _pass "skill has v2 report shape and no-auto-write"
else
  _fail "skill missing v2 report or no-auto-write contract"
fi
if grep -q 'profile' "$COMMAND" && grep -q 'Core' "$COMMAND" \
   && grep -q 'no-action' "$COMMAND"; then
  _pass "command forbids auto profile/core writes"
else
  _fail "command missing no-auto-write contract"
fi

echo "Case 2: single event defaults to no-action"
project="$(_setup_project single "$FIXTURES/single-event.jsonl")"
core_before="$(wc -c < "$REPO_ROOT/skills/do-it/do-it-core/SKILL.md" | tr -d ' ')"
report="$(do_it_learning_report_text "$project")"
if printf '%s' "$report" | grep -q 'Recommended action: no-action'; then
  _pass "single event recommends no-action"
else
  _fail "single event did not recommend no-action: $report"
fi
if printf '%s' "$report" | grep -q 'valid=1'; then
  _pass "single event counts one valid row"
else
  _fail "single event valid count missing"
fi
if [[ ! -e "$project/.do-it/runtime/adaptive/profile.md" ]]; then
  _pass "single-event report did not write adaptive profile"
else
  _fail "single-event report wrote adaptive profile"
fi
core_after="$(wc -c < "$REPO_ROOT/skills/do-it/do-it-core/SKILL.md" | tr -d ' ')"
if [[ "$core_before" == "$core_after" ]]; then
  _pass "single-event report did not write Core"
else
  _fail "single-event report mutated Core"
fi

echo "Case 3: repeated signals cap candidates at 3 and do not dump excerpts"
project="$(_setup_project repeated "$FIXTURES/repeated-signals.jsonl")"
report="$(do_it_learning_report_text "$project")"
if printf '%s' "$report" | grep -q 'Candidate policies (max 3)'; then
  _pass "repeated report includes candidate heading"
else
  _fail "repeated report missing candidate heading"
fi
cand_n="$(printf '%s' "$report" | grep -c '^(max 3)' || true)"
_="$cand_n"
bullet_n="$(printf '%s\n' "$report" | sed -n '/Candidate policies/,/Counterexamples/p' | grep -c '^- ' || true)"
if [[ "$bullet_n" -ge 1 && "$bullet_n" -le 3 ]]; then
  _pass "at most 3 candidate bullets ($bullet_n)"
else
  _fail "candidate bullet count $bullet_n is outside 1–3"
fi
if printf '%s' "$report" | grep -q 'Recommended action: code/test fix'; then
  _pass "repeated completion-after-edit prefers code/test fix"
else
  _fail "repeated report action mismatch: $report"
fi
if ! printf '%s' "$report" | grep -Fq 'plugin behavior missed subagent'; then
  _pass "report omits raw excerpts"
else
  _fail "report leaked a raw excerpt"
fi

echo "Case 4: malformed lines are skipped; legacy kind is an observation"
project="$(_setup_project malformed "$FIXTURES/malformed.jsonl")"
report="$(do_it_learning_report_text "$project")"
if printf '%s' "$report" | grep -q 'skipped=2'; then
  _pass "malformed and illegal kind are skipped"
else
  _fail "malformed skip count mismatch: $report"
fi

project="$(_setup_project legacy "$FIXTURES/legacy-behavior-feedback.jsonl")"
report="$(do_it_learning_report_text "$project")"
if printf '%s' "$report" | grep -q 'valid=1' && printf '%s' "$report" | grep -q 'kinds: user_feedback'; then
  _pass "legacy behavior-feedback maps to user_feedback"
else
  _fail "legacy event was not mapped: $report"
fi
if printf '%s' "$report" | grep -q 'Recommended action: no-action'; then
  _pass "legacy single event stays no-action"
else
  _fail "legacy single event was promoted"
fi

echo "Case 5: objective mix stays observation; no profile/core writes"
project="$(_setup_project objective "$FIXTURES/objective-mix.jsonl")"
mkdir -p "$project/.do-it/runtime/adaptive"
printf 'must-not-change\n' > "$project/.do-it/runtime/adaptive/profile.md"
before_profile="$(cat "$project/.do-it/runtime/adaptive/profile.md")"
report="$(do_it_learning_report_text "$project")"
if printf '%s' "$report" | grep -q 'Recommended action: task-contract fix'; then
  _pass "repeated scope-creep prefers task-contract fix"
else
  _fail "objective mix action mismatch: $report"
fi
if printf '%s' "$report" | grep -q 'not active policy'; then
  _pass "candidates are labeled observation-only"
else
  _fail "candidates were not labeled observation-only"
fi
if printf '%s' "$report" | grep -q 'does not write adaptive profile or Core'; then
  _pass "report states it does not write profile/core"
else
  _fail "report missing no-write footer"
fi
after_profile="$(cat "$project/.do-it/runtime/adaptive/profile.md")"
if [[ "$before_profile" == "$after_profile" ]]; then
  _pass "objective report did not modify existing profile"
else
  _fail "objective report modified adaptive profile"
fi
if ! printf '%s' "$report" | grep -Fq 'sk-abcdefghijklmnopqrstuvwxyz' \
   && ! printf '%s' "$report" | grep -Fq '/var/folders/' \
   && ! printf '%s' "$report" | grep -Fq 'C:\Users\do-it'; then
  _pass "report does not leak secret/path material"
else
  _fail "report leaked secret or path text"
fi

echo "Case 6: hook report command does not write profile/core"
hook_proj="$TMP_ROOT/hook-report"
mkdir -p "$hook_proj"
core_before="$(wc -c < "$REPO_ROOT/skills/do-it/do-it-core/SKILL.md" | tr -d ' ')"
jq -nc --arg cwd "$hook_proj" \
  '{session_id:"report-cmd", prompt:"/do-it-retrospective report", cwd:$cwd, hook_event_name:"UserPromptExpansion", command_name:"do-it-retrospective"}' \
  | CLAUDE_PLUGIN_DATA="$TMP_ROOT/plugin-data" bash "$RECORDER" >/dev/null
if [[ ! -e "$hook_proj/.do-it/runtime/adaptive/profile.md" ]]; then
  _pass "hook report did not create a profile"
else
  _fail "hook report created a profile"
fi
core_after="$(wc -c < "$REPO_ROOT/skills/do-it/do-it-core/SKILL.md" | tr -d ' ')"
if [[ "$core_before" == "$core_after" ]]; then
  _pass "hook report did not write Core"
else
  _fail "hook report mutated Core"
fi

if [[ "$FAIL" -ne 0 ]]; then
  echo "FAIL: $FAIL test(s) failed" >&2
  exit 1
fi

echo "ok: $PASS tests"
