#!/usr/bin/env bash
# do-it verification-gate (Stop hook).
# Blocks Claude from declaring "done/passed/完成/通过" without recent verification
# evidence (Bash, pnpm test, vitest, jest, etc.) in the recent transcript tail.

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
source "${SCRIPT_DIR}/lib/common.sh"

RAW_INPUT="$(do_it_read_stdin)"
SESSION_ID="$(do_it_json_get "$RAW_INPUT" session_id)"
TRANSCRIPT_PATH="$(do_it_json_get "$RAW_INPUT" transcript_path)"
STOP_HOOK_ACTIVE="$(do_it_json_get "$RAW_INPUT" stop_hook_active)"

# Recursion guard: do not re-block when a previous Stop hook already blocked.
if [[ "$STOP_HOOK_ACTIVE" == "true" ]]; then
  exit 0
fi

if do_it_check_skip "$SESSION_ID" gate; then
  exit 0
fi

if [[ -z "$TRANSCRIPT_PATH" || ! -f "$TRANSCRIPT_PATH" ]]; then
  exit 0
fi

TAIL_LINES=80
TAIL_BUF="$(tail -n "$TAIL_LINES" "$TRANSCRIPT_PATH" 2>/dev/null || true)"
if [[ -z "$TAIL_BUF" ]]; then
  exit 0
fi

# Detect completion claims in the recent transcript.
COMPLETION_PATTERN='(完成|done|passed|已修|通过|fixed|works|all set|success|完工)'
if ! printf '%s' "$TAIL_BUF" | grep -qiE "$COMPLETION_PATTERN"; then
  exit 0
fi

# Detect verification evidence: Bash tool use or test/build commands.
EVIDENCE_PATTERN='"name"[[:space:]]*:[[:space:]]*"Bash"|pnpm[[:space:]]+(test|build|exec)|vitest|jest|cargo[[:space:]]+test|go[[:space:]]+test|npm[[:space:]]+(test|run)'
if printf '%s' "$TAIL_BUF" | grep -qiE "$EVIDENCE_PATTERN"; then
  exit 0
fi

REASON="do-it verification-gate: completion language detected (e.g. 'done/passed/完成/通过') in the latest response, but no verification evidence (Bash command, pnpm test, vitest, etc.) appears in the recent transcript. Run the verification command and cite its output before claiming the task is complete. To bypass: include 'skip gate' / 'yolo' in the next message, or run /do-it-skip gate."

do_it_emit_block "$REASON"
exit 0
