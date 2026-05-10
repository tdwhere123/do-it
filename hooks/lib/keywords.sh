#!/usr/bin/env bash
# do-it hook keyword tables. Sourced by all hook scripts.
#
# As of 0.5.0 the keyword data lives in hooks/data/*.tsv. This file is a thin
# loader that reads the tsv files into the same DO_IT_* arrays that the rest of
# the hook code expects, preserving backwards compatibility for project-level
# overrides (`<cwd>/.do-it/keywords.local.sh`).
#
# These arrays are read indirectly by hooks/lib/common.sh (do_it_prompt_has_any),
# which shellcheck cannot resolve — so SC2034 is a false positive here.
# shellcheck disable=SC2034

# Resolve the data directory relative to this lib file. The two-step expansion
# is so this still works when sourced from any cwd.
_DO_IT_KEYWORDS_LIB_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
_DO_IT_KEYWORDS_DATA_DIR="$(cd "${_DO_IT_KEYWORDS_LIB_DIR}/../data" && pwd)"

_do_it_array_clear() {
  local __arr_name="$1"
  case "$__arr_name" in
    DO_IT_INTENT_VERBS) DO_IT_INTENT_VERBS=() ;;
    DO_IT_UNCERTAINTY_WORDS) DO_IT_UNCERTAINTY_WORDS=() ;;
    DO_IT_HEAVY_SIGNALS) DO_IT_HEAVY_SIGNALS=() ;;
    DO_IT_LIGHT_SIGNALS) DO_IT_LIGHT_SIGNALS=() ;;
    DO_IT_ESCAPE_WORDS) DO_IT_ESCAPE_WORDS=() ;;
    DO_IT_LONG_INPUT_HINTS) DO_IT_LONG_INPUT_HINTS=() ;;
    DO_IT_QUESTION_HINTS) DO_IT_QUESTION_HINTS=() ;;
    DO_IT_INTENT_OBJECTS) DO_IT_INTENT_OBJECTS=() ;;
    *) return 1 ;;
  esac
}

_do_it_array_append() {
  local __arr_name="$1" __value="$2"
  case "$__arr_name" in
    DO_IT_INTENT_VERBS) DO_IT_INTENT_VERBS+=("$__value") ;;
    DO_IT_UNCERTAINTY_WORDS) DO_IT_UNCERTAINTY_WORDS+=("$__value") ;;
    DO_IT_HEAVY_SIGNALS) DO_IT_HEAVY_SIGNALS+=("$__value") ;;
    DO_IT_LIGHT_SIGNALS) DO_IT_LIGHT_SIGNALS+=("$__value") ;;
    DO_IT_ESCAPE_WORDS) DO_IT_ESCAPE_WORDS+=("$__value") ;;
    DO_IT_LONG_INPUT_HINTS) DO_IT_LONG_INPUT_HINTS+=("$__value") ;;
    DO_IT_QUESTION_HINTS) DO_IT_QUESTION_HINTS+=("$__value") ;;
    DO_IT_INTENT_OBJECTS) DO_IT_INTENT_OBJECTS+=("$__value") ;;
    *) return 1 ;;
  esac
}

# Read a tsv file into an array passed by name. Comments (`#`) and blank lines
# are skipped. Each line is `<term><TAB><flags>`; flags may be empty. The flags
# `leading-ws` / `trailing-ws` adjust the term inline before storage, so the
# downstream substring matcher needs no flag awareness.
#
# Args: <array-name> <tsv-path>
_do_it_load_tsv() {
  local __arr_name="$1" __path="$2"
  _do_it_array_clear "$__arr_name" || return 0
  if [[ ! -f "$__path" ]]; then
    return 0
  fi
  local line term flags first=1
  while IFS= read -r line || [[ -n "$line" ]]; do
    # Strip UTF-8 BOM from the very first line if present, and trim CR for
    # CRLF-saved files; both come up when the file was edited on Windows or
    # pasted via a web tool.
    if [[ "$first" -eq 1 ]]; then
      line="${line#$'\xef\xbb\xbf'}"
      first=0
    fi
    line="${line%$'\r'}"
    case "$line" in
      ''|'#'*) continue ;;
    esac
    if [[ "$line" == *$'\t'* ]]; then
      term="${line%%$'\t'*}"
      flags="${line#*$'\t'}"
      flags="${flags%$'\r'}"
    else
      term="$line"
      flags=""
    fi
    case ",$flags," in
      *,leading-ws,*) term=" $term" ;;
    esac
    case ",$flags," in
      *,trailing-ws,*) term="$term " ;;
    esac
    _do_it_array_append "$__arr_name" "$term"
  done < "$__path"
}

_do_it_load_tsv DO_IT_INTENT_VERBS       "${_DO_IT_KEYWORDS_DATA_DIR}/intent-verbs.tsv"
_do_it_load_tsv DO_IT_UNCERTAINTY_WORDS  "${_DO_IT_KEYWORDS_DATA_DIR}/uncertainty-words.tsv"
_do_it_load_tsv DO_IT_HEAVY_SIGNALS      "${_DO_IT_KEYWORDS_DATA_DIR}/heavy-signals.tsv"
_do_it_load_tsv DO_IT_LIGHT_SIGNALS      "${_DO_IT_KEYWORDS_DATA_DIR}/light-signals.tsv"
_do_it_load_tsv DO_IT_ESCAPE_WORDS       "${_DO_IT_KEYWORDS_DATA_DIR}/escape-words.tsv"
_do_it_load_tsv DO_IT_LONG_INPUT_HINTS   "${_DO_IT_KEYWORDS_DATA_DIR}/long-input-hints.tsv"
_do_it_load_tsv DO_IT_QUESTION_HINTS     "${_DO_IT_KEYWORDS_DATA_DIR}/question-hints.tsv"
_do_it_load_tsv DO_IT_INTENT_OBJECTS     "${_DO_IT_KEYWORDS_DATA_DIR}/intent-objects.tsv"

# Long-input grill threshold (character count). Kept here because it's a tunable
# scalar, not a list — would feel forced as a tsv.
DO_IT_LONG_INPUT_THRESHOLD="${DO_IT_LONG_INPUT_THRESHOLD:-300}"
