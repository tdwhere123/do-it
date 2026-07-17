#!/usr/bin/env bash
# Direct regression coverage for every write-quality family and its advisory
# lifecycle. Each case edits newly-added source lines in an isolated git repo.

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
HOOK="$REPO_ROOT/hooks/write-quality-lint.sh"
export CLAUDE_PLUGIN_DATA="${TMPDIR:-/tmp}/do-it-wql-test-$$"
unset KIMI_CODE_HOME KIMI_PLUGIN_ROOT
rm -rf "$CLAUDE_PLUGIN_DATA"
mkdir -p "$CLAUDE_PLUGIN_DATA"
trap 'rm -rf "$CLAUDE_PLUGIN_DATA"' EXIT

PASS=0
FAIL=0

_setup_repo() {
  local dir
  dir="$(mktemp -d -t doit-wql-XXXXXX)"
  (cd "$dir" && git init -q && git config user.email t@e.com && git config user.name t) >/dev/null 2>&1
  printf '%s' "$dir"
}

_seed_state() {
  local session="$1" tier="${2:-Heavy}" touch="${3:-1}" interface="${4:-0}" packages="${5:-0}" turn="${6:-1}"
  mkdir -p "$CLAUDE_PLUGIN_DATA/sessions/$session"
  local state="$CLAUDE_PLUGIN_DATA/sessions/$session/state.json"
  if [[ -f "$state" ]]; then
    jq --arg tier "$tier" --arg touch "$touch" --arg interface "$interface" --arg packages "$packages" --arg turn "$turn" \
      '. + {tier:$tier,dim_touches_code:$touch,dim_breaks_interface:$interface,dim_crosses_packages:$packages,user_turn:$turn}' \
      "$state" > "$state.tmp" && mv "$state.tmp" "$state"
  else
    jq -nc --arg tier "$tier" --arg touch "$touch" --arg interface "$interface" --arg packages "$packages" --arg turn "$turn" \
      '{tier:$tier,dim_touches_code:$touch,dim_breaks_interface:$interface,dim_crosses_packages:$packages,user_turn:$turn}' \
      > "$state"
  fi
}

_run_hook() {
  local file="$1" session="$2" tier="${3:-Heavy}" touch="${4:-1}" interface="${5:-0}" packages="${6:-0}" turn="${7:-1}"
  _seed_state "$session" "$tier" "$touch" "$interface" "$packages" "$turn"
  printf '{"tool_name":"Edit","tool_input":{"file_path":"%s"},"session_id":"%s","cwd":"%s"}' \
    "$file" "$session" "$(dirname "$file")" | bash "$HOOK" 2>/dev/null
}

assert_contains() {
  local label="$1" output="$2" needle="$3"
  if [[ "$output" == *"$needle"* ]]; then
    echo "  ok: $label"; PASS=$((PASS + 1))
  else
    echo "  FAIL: $label — expected $needle; got: $output" >&2; FAIL=$((FAIL + 1))
  fi
}

assert_not_contains() {
  local label="$1" output="$2" needle="$3"
  if [[ "$output" != *"$needle"* ]]; then
    echo "  ok: $label"; PASS=$((PASS + 1))
  else
    echo "  FAIL: $label — unexpected $needle; got: $output" >&2; FAIL=$((FAIL + 1))
  fi
}

case_file() {
  local name="$1"
  DIR=$(_setup_repo)
  FILE="$DIR/$name.ts"
  printf 'export const base = 1;\n' > "$FILE"
  (cd "$DIR" && git add . && git commit -q -m base) >/dev/null 2>&1
}

# Existing focused suites cover narrative-comment, orphan-todo, tombstone,
# case-list, no-consumer, and copy-paste. Keep their ids here for registry
# validation and cover the remaining family detectors directly.
: "narrative-comment orphan-todo tombstone case-list no-consumer copy-paste"

echo "Case 1: swallow-error"
case_file swallow
cat > "$FILE" <<'EOF'
export function load() { try { return 1; } catch (error) {} }
EOF
OUT=$(_run_hook "$FILE" swallow)
assert_contains "swallow-error flags empty catch" "$OUT" "swallow-error"
rm -rf "$DIR"

echo "Case 2: debug-leftover"
case_file debug
cat > "$FILE" <<'EOF'
export function load() { console.log('debug'); return 1; }
EOF
OUT=$(_run_hook "$FILE" debug)
assert_contains "debug-leftover flags console" "$OUT" "debug-leftover"
rm -rf "$DIR"

echo "Case 3: test-weakened"
case_file weakened
cat > "$FILE" <<'EOF'
describe.skip('legacy', () => {});
EOF
OUT=$(_run_hook "$FILE" weakened)
assert_contains "test-weakened flags skipped test" "$OUT" "test-weakened"
rm -rf "$DIR"

echo "Case 4: edit-bloat"
case_file bloat
{
  echo 'export const rows = ['
  for i in $(seq 1 121); do printf '  %s,\n' "$i"; done
  echo '];'
} > "$FILE"
OUT=$(_run_hook "$FILE" bloat)
assert_contains "edit-bloat flags large edit" "$OUT" "edit-bloat"
rm -rf "$DIR"

echo "Case 5: scope-chain uses interface risk, not line count"
case_file scope
cat > "$FILE" <<'EOF'
export function handleRequest() { return 1; }
EOF
OUT=$(_run_hook "$FILE" scope Heavy 1 1 0)
assert_contains "scope-chain flags interface surface" "$OUT" "scope-chain"
rm -rf "$DIR"

case_file scope-local
cat > "$FILE" <<'EOF'
export function local() { return 1; }
EOF
OUT=$(_run_hook "$FILE" scope-local Heavy 1 0 0)
assert_not_contains "scope-chain skips local edit" "$OUT" "scope-chain"
rm -rf "$DIR"

echo "Case 6: live-path and type-escape"
case_file live
cat > "$FILE" <<'EOF'
export function handleWebhook(value: unknown) { return value as any; }
EOF
OUT=$(_run_hook "$FILE" live)
assert_contains "live-path flags unreferenced handler" "$OUT" "live-path"
assert_contains "type-escape flags any" "$OUT" "type-escape"
rm -rf "$DIR"

echo "Case 7: secret-leak and test-fiction"
case_file integrity
cat > "$FILE" <<'EOF'
const api_key = 'very-secret-value';
vi.mock('one');
vi.mock('two');
vi.mock('three');
export const ready = true;
EOF
OUT=$(_run_hook "$FILE" integrity)
assert_contains "secret-leak flags credential" "$OUT" "secret-leak"
assert_contains "test-fiction flags mock pile" "$OUT" "test-fiction"
rm -rf "$DIR"

echo "Case 8: scoped suppression never hides secret-leak"
case_file suppression
cat > "$FILE" <<'EOF'
// fixed historical header
// write-quality-lint-allow: narrative-comment — retained public compatibility header
const api_key = 'sk-abcdefghijklmnopqrstuvwx';
EOF
OUT=$(_run_hook "$FILE" suppression)
assert_not_contains "scoped suppression removes narrative family" "$OUT" "matched narrative-comment"
assert_contains "secret remains visible despite marker" "$OUT" "secret-leak"
rm -rf "$DIR"

echo "Case 9: deduplicates one file per user turn"
case_file dedup
cat > "$FILE" <<'EOF'
export function load() { console.log('debug'); return 1; }
EOF
OUT=$(_run_hook "$FILE" dedup Heavy 1 0 0 7)
assert_contains "first edit emits reminder" "$OUT" "debug-leftover"
# The hook increments its own invocation counter in state; preserve the dedup key
# while changing no routing fields for the same user turn.
OUT=$(_run_hook "$FILE" dedup Heavy 1 0 0 7)
assert_not_contains "same turn is deduplicated" "$OUT" "system-reminder"
rm -rf "$DIR"

echo "Case 10: unknown state is Standard-minimal, not Heavy"
case_file fallback
cat > "$FILE" <<'EOF'
export function local() { return 1; }
EOF
rm -rf "$CLAUDE_PLUGIN_DATA/sessions/fallback"
printf '{"tool_name":"Edit","tool_input":{"file_path":"%s"},"session_id":"fallback","cwd":"%s"}' "$FILE" "$(dirname "$FILE")" \
  | bash "$HOOK" 2>/dev/null > "$CLAUDE_PLUGIN_DATA/fallback.out"
OUT=$(<"$CLAUDE_PLUGIN_DATA/fallback.out")
assert_not_contains "unknown state does not trigger Heavy scope nudge" "$OUT" "scope-chain"
rm -rf "$DIR"

if [[ "$FAIL" -gt 0 ]]; then
  echo "FAILED: $PASS passed, $FAIL failed" >&2
  exit 1
fi

echo "ok: $PASS tests"
