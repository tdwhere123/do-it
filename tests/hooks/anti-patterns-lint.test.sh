#!/usr/bin/env bash
# Smoke tests for hooks/anti-patterns-lint.sh.
#
# Each case sets up a temporary git repo, stages a base file, then edits it
# and feeds the hook a synthetic PostToolUse JSON blob. We assert on the
# presence/absence of the system-reminder + family label in stdout.
#
# Usage: bash tests/hooks/anti-patterns-lint.test.sh
# Exits non-zero on first failure; prints "ok: <N> tests" on success.

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
HOOK="$REPO_ROOT/hooks/anti-patterns-lint.sh"

if [[ ! -x "$HOOK" ]]; then
  if [[ ! -f "$HOOK" ]]; then
    echo "FAIL: hook not found at $HOOK" >&2
    exit 1
  fi
fi

PASS=0
FAIL=0

_setup_repo() {
  local dir
  dir="$(mktemp -d -t doit-anti-patterns-XXXXXX)"
  ( cd "$dir" \
    && git init -q \
    && git config user.email test@example.com \
    && git config user.name test ) >/dev/null 2>&1
  printf '%s' "$dir"
}

_run_hook() {
  local file="$1"
  local payload
  payload=$(printf '{"tool_name":"Edit","tool_input":{"file_path":"%s"},"session_id":"test","cwd":"%s"}' \
    "$file" "$(dirname "$file")")
  printf '%s' "$payload" | bash "$HOOK" 2>/dev/null
}

_assert_contains() {
  local label="$1" output="$2" needle="$3"
  if printf '%s' "$output" | grep -qF -- "$needle"; then
    echo "  ok: $label"
    PASS=$((PASS + 1))
  else
    echo "  FAIL: $label — expected to find: $needle" >&2
    echo "  output was: $output" >&2
    FAIL=$((FAIL + 1))
  fi
}

_assert_not_contains() {
  local label="$1" output="$2" needle="$3"
  if printf '%s' "$output" | grep -qF -- "$needle"; then
    echo "  FAIL: $label — unexpected match: $needle" >&2
    echo "  output was: $output" >&2
    FAIL=$((FAIL + 1))
  else
    echo "  ok: $label"
    PASS=$((PASS + 1))
  fi
}

# -------------------------------------------------------------------------
echo "Case 1: case-list hit — 12 consecutive case patterns flagged"
DIR=$(_setup_repo)
FILE="$DIR/router.sh"
cat > "$FILE" <<'EOF'
#!/bin/bash
echo "hello"
EOF
( cd "$DIR" && git add router.sh && git commit -q -m base ) >/dev/null 2>&1
cat > "$FILE" <<'EOF'
#!/bin/bash
case "$x" in
  *"alpha"*|*"beta"*) ;;
  *"gamma"*) ;;
  *"delta"*) ;;
  *"epsilon"*) ;;
  *"zeta"*) ;;
  *"eta"*) ;;
  *"theta"*) ;;
  *"iota"*) ;;
  *"kappa"*) ;;
  *"lambda"*) ;;
  *"mu"*) ;;
  *"nu"*) ;;
  *"xi"*) ;;
esac
EOF
OUT=$(_run_hook "$FILE")
_assert_contains "case-list flagged" "$OUT" "- case-list:"
_assert_contains "names file" "$OUT" "router.sh"
rm -rf "$DIR"

# -------------------------------------------------------------------------
echo "Case 2: case-list miss — 3 case patterns silent"
DIR=$(_setup_repo)
FILE="$DIR/small.sh"
cat > "$FILE" <<'EOF'
#!/bin/bash
echo "hello"
EOF
( cd "$DIR" && git add small.sh && git commit -q -m base ) >/dev/null 2>&1
cat > "$FILE" <<'EOF'
#!/bin/bash
case "$x" in
  *"a"*) ;;
  *"b"*) ;;
  *"c"*) ;;
esac
EOF
OUT=$(_run_hook "$FILE")
_assert_not_contains "case-list not flagged for small list" "$OUT" "- case-list:"
rm -rf "$DIR"

# -------------------------------------------------------------------------
echo "Case 3: no-consumer hit — exported symbol with no other reference"
DIR=$(_setup_repo)
FILE="$DIR/util.ts"
cat > "$FILE" <<'EOF'
// initial
export const KEEP = 1;
EOF
# Another file references KEEP so it's "consumed".
cat > "$DIR/consumer.ts" <<'EOF'
import { KEEP } from './util';
console.log(KEEP);
EOF
( cd "$DIR" && git add . && git commit -q -m base ) >/dev/null 2>&1
cat > "$FILE" <<'EOF'
// initial
export const KEEP = 1;
export function UnusedHelper() { return 42; }
EOF
OUT=$(_run_hook "$FILE")
_assert_contains "no-consumer flagged for orphan export" "$OUT" "- no-consumer:"
_assert_contains "names the orphan symbol" "$OUT" "UnusedHelper"
rm -rf "$DIR"

# -------------------------------------------------------------------------
echo "Case 4: no-consumer miss — exported symbol referenced elsewhere"
DIR=$(_setup_repo)
FILE="$DIR/util.ts"
cat > "$FILE" <<'EOF'
// initial
EOF
cat > "$DIR/consumer.ts" <<'EOF'
import { ReferencedHelper } from './util';
console.log(ReferencedHelper());
EOF
( cd "$DIR" && git add . && git commit -q -m base ) >/dev/null 2>&1
cat > "$FILE" <<'EOF'
// initial
export function ReferencedHelper() { return 99; }
EOF
OUT=$(_run_hook "$FILE")
_assert_not_contains "no-consumer silent for referenced symbol" "$OUT" "- no-consumer:"
rm -rf "$DIR"

# -------------------------------------------------------------------------
echo "Case 5: copy-paste hit — ≥5-line block duplicated in same directory"
DIR=$(_setup_repo)
mkdir -p "$DIR/src"
cat > "$DIR/src/original.ts" <<'EOF'
export function bigHelper(input: string): number {
  const parts = input.split(',');
  const trimmed = parts.map(p => p.trim());
  const filtered = trimmed.filter(p => p.length > 0);
  const numbers = filtered.map(p => parseInt(p, 10));
  return numbers.reduce((sum, n) => sum + n, 0);
}
EOF
cat > "$DIR/src/new.ts" <<'EOF'
// initial
EOF
( cd "$DIR" && git add . && git commit -q -m base ) >/dev/null 2>&1
cat > "$DIR/src/new.ts" <<'EOF'
// initial
export function alsoSum(input: string): number {
  const parts = input.split(',');
  const trimmed = parts.map(p => p.trim());
  const filtered = trimmed.filter(p => p.length > 0);
  const numbers = filtered.map(p => parseInt(p, 10));
  return numbers.reduce((sum, n) => sum + n, 0);
}
EOF
OUT=$(_run_hook "$DIR/src/new.ts")
_assert_contains "copy-paste flagged for duplicated block" "$OUT" "- copy-paste:"
_assert_contains "names the neighbour file" "$OUT" "original.ts"
rm -rf "$DIR"

# -------------------------------------------------------------------------
echo "Case 6: copy-paste miss — unique block silent"
DIR=$(_setup_repo)
mkdir -p "$DIR/src"
cat > "$DIR/src/neighbor.ts" <<'EOF'
export function foo() {
  return 1;
}
EOF
cat > "$DIR/src/uniq.ts" <<'EOF'
// initial
EOF
( cd "$DIR" && git add . && git commit -q -m base ) >/dev/null 2>&1
cat > "$DIR/src/uniq.ts" <<'EOF'
// initial
export function genuinelyNew(input: string): boolean {
  if (input === 'something-uncommon-quite-distinctive-1') return true;
  if (input === 'something-uncommon-quite-distinctive-2') return false;
  if (input === 'something-uncommon-quite-distinctive-3') return true;
  if (input === 'something-uncommon-quite-distinctive-4') return false;
  return null as unknown as boolean;
}
EOF
OUT=$(_run_hook "$DIR/src/uniq.ts")
_assert_not_contains "copy-paste silent for unique block" "$OUT" "- copy-paste:"
rm -rf "$DIR"

# -------------------------------------------------------------------------
echo "Case 6b: no-consumer detects export default class/function"
DIR=$(_setup_repo)
FILE="$DIR/orphan-default.ts"
cat > "$FILE" <<'EOF'
// initial
EOF
( cd "$DIR" && git add orphan-default.ts && git commit -q -m base ) >/dev/null 2>&1
cat > "$FILE" <<'EOF'
// initial
export default function OrphanDefault() { return 1; }
EOF
OUT=$(_run_hook "$FILE")
_assert_contains "no-consumer covers export default function" "$OUT" "- no-consumer:"
_assert_contains "names OrphanDefault" "$OUT" "OrphanDefault"
rm -rf "$DIR"

# -------------------------------------------------------------------------
echo "Case 6c: no-consumer detects export default async function"
DIR=$(_setup_repo)
FILE="$DIR/orphan-async.ts"
cat > "$FILE" <<'EOF'
// initial
EOF
( cd "$DIR" && git add orphan-async.ts && git commit -q -m base ) >/dev/null 2>&1
cat > "$FILE" <<'EOF'
// initial
export default async function MixedFn() { return 1; }
EOF
OUT=$(_run_hook "$FILE")
_assert_contains "no-consumer covers export default async function" "$OUT" "- no-consumer:"
_assert_contains "names MixedFn" "$OUT" "MixedFn"
rm -rf "$DIR"

# -------------------------------------------------------------------------
echo "Case 7: out-of-scope extension — skipped silently"
DIR=$(_setup_repo)
FILE="$DIR/notes.md"
cat > "$FILE" <<'EOF'
# notes
EOF
( cd "$DIR" && git add notes.md && git commit -q -m base ) >/dev/null 2>&1
cat > "$FILE" <<'EOF'
# notes
case "$x" in
  *"a"*|*"b"*|*"c"*|*"d"*|*"e"*|*"f"*|*"g"*|*"h"*|*"i"*|*"j"*|*"k"*|*"l"*) ;;
esac
EOF
OUT=$(_run_hook "$FILE")
_assert_not_contains "non-source extension skipped" "$OUT" "system-reminder"
rm -rf "$DIR"

# -------------------------------------------------------------------------
if [[ "$FAIL" -gt 0 ]]; then
  echo "FAIL: $FAIL test(s) failed out of $((PASS + FAIL))" >&2
  exit 1
fi
echo "ok: $PASS tests"
