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

echo "Case 5: path-only SCOPE_RISK (scope-chain); stale dim_* ignored"
case_file index
cat > "$FILE" <<'EOF'
export function local() { return 1; }
EOF
OUT=$(_run_hook "$FILE" scope Heavy 1 0 0)
assert_contains "index.* basename sets SCOPE_RISK=1 without dim_breaks_interface" "$OUT" "scope-chain"
rm -rf "$DIR"

DIR=$(_setup_repo)
mkdir -p "$DIR/packages/pkg/src"
FILE="$DIR/packages/pkg/src/util.ts"
printf 'export const base = 1;\n' > "$FILE"
(cd "$DIR" && git add . && git commit -q -m base) >/dev/null 2>&1
cat > "$FILE" <<'EOF'
export function local() { return 1; }
EOF
OUT=$(_run_hook "$FILE" scope-pkg Heavy 1 0 0)
assert_contains "nested packages path sets SCOPE_RISK=1 without dim_breaks_interface" "$OUT" "scope-chain"
rm -rf "$DIR"

DIR=$(_setup_repo)
mkdir -p "$DIR/src"
FILE="$DIR/src/foo.ts"
printf 'export const base = 1;\n' > "$FILE"
(cd "$DIR" && git add . && git commit -q -m base) >/dev/null 2>&1
cat > "$FILE" <<'EOF'
export function local() { return 1; }
EOF
OUT=$(_run_hook "$FILE" scope-src Heavy 1 1 1)
assert_not_contains "stale dim_* do not force SCOPE_RISK on src/foo.ts" "$OUT" "scope-chain"
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

echo "Case 10: unknown session state does not invent scope-chain on a local path"
case_file fallback
cat > "$FILE" <<'EOF'
export function local() { return 1; }
EOF
rm -rf "$CLAUDE_PLUGIN_DATA/sessions/fallback"
printf '{"tool_name":"Edit","tool_input":{"file_path":"%s"},"session_id":"fallback","cwd":"%s"}' "$FILE" "$(dirname "$FILE")" \
  | bash "$HOOK" 2>/dev/null > "$CLAUDE_PLUGIN_DATA/fallback.out"
OUT=$(<"$CLAUDE_PLUGIN_DATA/fallback.out")
assert_not_contains "unknown state does not trigger path-unsure scope nudge" "$OUT" "scope-chain"
rm -rf "$DIR"

# Grow $FILE to exactly $1 total lines: 1 base + (N-2) filler committed + 1 tail edit.
_grow_to() {
  local n="$1"
  seq 1 $((n - 2)) | while read -r i; do printf 'export const x%s = %s;\n' "$i" "$i"; done >> "$FILE"
  (cd "$DIR" && git add . && git commit -q -m grow) >/dev/null 2>&1
  printf 'const tail = 1;\n' >> "$FILE"
}

echo "Case 11: file-size thresholds and overrides"
case_file size-warn
_grow_to 512
OUT=$(_run_hook "$FILE" size-warn)
assert_contains "512 lines trips warn threshold" "$OUT" "file-size: 512 lines (warn threshold 500)"
assert_not_contains "512 lines stays below split" "$OUT" "split threshold"
rm -rf "$DIR"

case_file size-split
_grow_to 812
OUT=$(_run_hook "$FILE" size-split)
assert_contains "812 lines trips split threshold" "$OUT" "file-size: 812 lines (split threshold 800)"
rm -rf "$DIR"

case_file size-local
mkdir -p "$DIR/.do-it"
printf 'file-size-warn\t600\nfile-size-split\t1000\n' > "$DIR/.do-it/write-quality.local.tsv"
_grow_to 562
OUT=$(_run_hook "$FILE" size-local)
assert_not_contains "project override raises warn above 562" "$OUT" "file-size"
OUT=$(DO_IT_FILE_SIZE_WARN_LINES=550 _run_hook "$FILE" size-local-env)
assert_contains "env var beats project file" "$OUT" "file-size: 562 lines (warn threshold 550)"
rm -rf "$DIR"

case_file size-small
cat > "$FILE" <<'EOF'
export function local() { return 1; }
EOF
OUT=$(_run_hook "$FILE" size-small)
assert_not_contains "small file stays quiet" "$OUT" "file-size"
rm -rf "$DIR"

echo "Case 12: file-size parsing edges and boundaries"
case_file size-boundary-warn
_grow_to 500
OUT=$(_run_hook "$FILE" size-boundary-warn)
assert_not_contains "exactly 500 lines stays quiet (warn is strict >)" "$OUT" "file-size"
rm -rf "$DIR"

case_file size-boundary-split
_grow_to 800
OUT=$(_run_hook "$FILE" size-boundary-split)
assert_contains "exactly 800 lines trips split (split is >=)" "$OUT" "file-size: 800 lines (split threshold 800)"
rm -rf "$DIR"

case_file size-crlf
mkdir -p "$DIR/.do-it"
printf 'file-size-warn\t600\r\nfile-size-split\t1000\r\n' > "$DIR/.do-it/write-quality.local.tsv"
_grow_to 562
OUT=$(_run_hook "$FILE" size-crlf)
assert_not_contains "CRLF override file is honored" "$OUT" "file-size"
rm -rf "$DIR"

case_file size-noeol
mkdir -p "$DIR/.do-it"
printf 'file-size-warn\t600' > "$DIR/.do-it/write-quality.local.tsv"
_grow_to 562
OUT=$(_run_hook "$FILE" size-noeol)
assert_not_contains "final row without trailing newline is honored" "$OUT" "file-size"
rm -rf "$DIR"

case_file size-badrow
mkdir -p "$DIR/.do-it"
printf 'file-size-warn\tabc\n' > "$DIR/.do-it/write-quality.local.tsv"
_grow_to 512
OUT=$(_run_hook "$FILE" size-badrow)
assert_contains "non-numeric row falls back to default" "$OUT" "file-size: 512 lines (warn threshold 500)"
rm -rf "$DIR"

case_file size-badenv
mkdir -p "$DIR/.do-it"
printf 'file-size-warn\t600\n' > "$DIR/.do-it/write-quality.local.tsv"
_grow_to 562
OUT=$(DO_IT_FILE_SIZE_WARN_LINES=abc _run_hook "$FILE" size-badenv)
assert_not_contains "non-numeric env does not discard valid file value" "$OUT" "file-size"
rm -rf "$DIR"

case_file size-splitenv
_grow_to 812
OUT=$(DO_IT_FILE_SIZE_SPLIT_LINES=1000 _run_hook "$FILE" size-splitenv)
assert_contains "split env override drops 812 back to warn" "$OUT" "file-size: 812 lines (warn threshold 500)"
assert_not_contains "split env override silences split message" "$OUT" "split threshold"
rm -rf "$DIR"

case_file size-octal
mkdir -p "$DIR/.do-it"
printf 'file-size-warn\t0600\n' > "$DIR/.do-it/write-quality.local.tsv"
_grow_to 562
OUT=$(_run_hook "$FILE" size-octal)
assert_not_contains "zero-padded value is decimal, not octal" "$OUT" "file-size"
rm -rf "$DIR"

echo "Case 13: override resolves from git root of edited file, not session cwd"
DIR=$(_setup_repo)
mkdir -p "$DIR/sub" "$DIR/.do-it"
printf 'file-size-warn\t600\n' > "$DIR/.do-it/write-quality.local.tsv"
FILE="$DIR/sub/size-cwd.ts"
printf 'export const base = 1;\n' > "$FILE"
(cd "$DIR" && git add . && git commit -q -m base) >/dev/null 2>&1
_grow_to 562
OUT=$(_run_hook "$FILE" size-cwd)   # _run_hook passes cwd=dirname(file)=$DIR/sub
assert_not_contains "repo-root override applies despite subdir cwd" "$OUT" "file-size"
rm -rf "$DIR"

echo "Case 14: no session tier + small code edit still scans (thin default)"
case_file thin-default
cat > "$FILE" <<'EOF'
export function load() { console.log('debug'); return 1; }
EOF
rm -rf "$CLAUDE_PLUGIN_DATA/sessions/thin-default"
printf '{"tool_name":"Edit","tool_input":{"file_path":"%s"},"session_id":"thin-default","cwd":"%s"}' \
  "$FILE" "$(dirname "$FILE")" | bash "$HOOK" 2>/dev/null > "$CLAUDE_PLUGIN_DATA/thin-default.out"
OUT=$(<"$CLAUDE_PLUGIN_DATA/thin-default.out")
assert_contains "missing tier still flags debug-leftover" "$OUT" "debug-leftover"
rm -rf "$DIR"

echo "Case 15: session tier=Light no longer skips a code edit with added lines"
case_file light-scan
cat > "$FILE" <<'EOF'
export function load() { console.log('debug'); return 1; }
EOF
OUT=$(_run_hook "$FILE" light-scan Light 1 0 0)
assert_contains "Light still scans added lines" "$OUT" "debug-leftover"
rm -rf "$DIR"

echo "Case 16: dim_touches_code=0 and 2 added lines still scans"
case_file dim-skip-gone
cat > "$FILE" <<'EOF'
export function load() { console.log('debug'); return 1; }
export const extra = 2;
EOF
OUT=$(_run_hook "$FILE" dim-skip-gone Standard 0 0 0)
assert_contains "Standard dim_touches_code=0 still scans two added lines" "$OUT" "debug-leftover"
rm -rf "$DIR"

if [[ "$FAIL" -gt 0 ]]; then
  echo "FAILED: $PASS passed, $FAIL failed" >&2
  exit 1
fi

echo "ok: $PASS tests"
