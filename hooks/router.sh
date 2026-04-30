#!/usr/bin/env bash
# do-it router (UserPromptSubmit hook).
# Classifies the prompt as Light / Standard / Heavy and injects the
# recommended skill set as additionalContext. Never blocks on its own.

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
source "${SCRIPT_DIR}/lib/common.sh"
# shellcheck source=lib/keywords.sh
source "${SCRIPT_DIR}/lib/keywords.sh"

RAW_INPUT="$(do_it_read_stdin)"
PROMPT="$(do_it_json_get "$RAW_INPUT" prompt)"
SESSION_ID="$(do_it_json_get "$RAW_INPUT" session_id)"
CWD="$(do_it_json_get "$RAW_INPUT" cwd)"

do_it_source_local_keywords "$CWD"

# Escape keywords: write skip flags for ALL hooks and pass through.
if do_it_prompt_has_escape "$PROMPT"; then
  do_it_write_skip "$SESSION_ID" router grill gate
  exit 0
fi

# Honor pre-existing skip flag.
if do_it_check_skip "$SESSION_ID" router; then
  exit 0
fi

PROMPT_LEN=${#PROMPT}
TIER=""

if do_it_prompt_has_any "$PROMPT" DO_IT_HEAVY_SIGNALS; then
  TIER="Heavy"
elif [[ "$PROMPT_LEN" -lt 60 ]] && do_it_prompt_has_any "$PROMPT" DO_IT_LIGHT_SIGNALS; then
  TIER="Light"
elif do_it_prompt_has_any "$PROMPT" DO_IT_INTENT_VERBS; then
  TIER="Standard"
else
  TIER="Light"
fi

case "$TIER" in
  Heavy)
    MSG="<system-reminder>
do-it tier classification: Heavy.

Recommended path:
1. do-it-grill (mandatory): list 5 most-likely-wrong premises before any plan or code.
2. do-it-planning: produce a plan card under .do-it/plans/<task>.md, including a ## Grill section.
3. If touching multiple packages or public interfaces, also run do-it-architecture-scan and do-it-interface-drill.
4. do-it-slicing: cut tracer-bullet vertical slices.
5. do-it-tdd / do-it-debugging during implementation; do-it-review-loop after diff.
6. do-it-verification-gate before claiming done; do-it-branch-closeout if a branch is open.

To bypass this turn: include 'yolo', '直接做', or '/do-it-skip' in the prompt.
</system-reminder>"
    ;;
  Standard)
    MSG="<system-reminder>
do-it tier classification: Standard.

Recommended path:
1. do-it-grill: list 5 most-likely-wrong premises about the task before acting.
2. do-it-planning (light): note change scope and acceptance criteria, optionally to .do-it/plans/<task>.md.
3. Implement with do-it-tdd discipline if behavior is changing.
4. do-it-review-loop after the diff is meaningful.
5. do-it-verification-gate before claiming done.

To bypass this turn: include 'yolo' or '/do-it-skip' in the prompt.
</system-reminder>"
    ;;
  Light)
    MSG="<system-reminder>
do-it tier classification: Light. Tightly-bounded mechanical change. Skip planning artifacts. Verification gate still applies — do not claim done without running the verification command.
</system-reminder>"
    ;;
esac

do_it_emit_context UserPromptSubmit "$MSG"
exit 0
