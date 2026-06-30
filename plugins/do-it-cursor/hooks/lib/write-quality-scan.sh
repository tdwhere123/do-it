#!/usr/bin/env bash
# do-it write-quality scan library (source only — never execute directly).
# Shared by hooks/write-quality-lint.sh. Populates global scan state:
#   WQ_ADDED_LINES, WQ_HIT_FAMILIES, WQ_HIT_DETAILS, WQ_COMMENT_HITS

# shellcheck disable=SC2034
WQ_ADDED_LINES=""
WQ_HIT_FAMILIES=""
WQ_HIT_DETAILS=""
WQ_COMMENT_HITS=0

_wq_timeout() {
  if command -v timeout >/dev/null 2>&1; then
    timeout "$@"
  else
    shift
    "$@"
  fi
}

wq_record_family() {
  local fam="$1"
  case ",${WQ_HIT_FAMILIES}," in
    *",$fam,"*) ;;
    *) WQ_HIT_FAMILIES="${WQ_HIT_FAMILIES:+$WQ_HIT_FAMILIES,}$fam" ;;
  esac
}

_wq_append_detail() {
  WQ_HIT_DETAILS="${WQ_HIT_DETAILS:+${WQ_HIT_DETAILS}$'\n'}${1}"
}

# Args: <repo_root> <file_path>. Sets global WQ_ADDED_LINES.
wq_collect_added_lines() {
  local repo_root="$1" file_path="$2"
  WQ_ADDED_LINES=""

  local diff_output
  diff_output="$(_wq_timeout 5s git -C "$repo_root" diff HEAD -- "$file_path" 2>/dev/null || true)"
  if [[ -n "$diff_output" ]]; then
    WQ_ADDED_LINES="$(printf '%s\n' "$diff_output" \
      | awk '/^\+\+\+/ {next} /^\+/ {sub(/^\+/, ""); print}')"
  fi

  if [[ -z "$WQ_ADDED_LINES" ]]; then
    local status_line
    status_line="$(_wq_timeout 5s git -C "$repo_root" status --porcelain -- "$file_path" 2>/dev/null | head -n1)"
    case "$status_line" in
      \?\?*|A*|*A\ *)
        WQ_ADDED_LINES="$(_wq_timeout 5s cat "$file_path" 2>/dev/null || true)"
        ;;
    esac
  fi
}

# Uses WQ_ADDED_LINES. Sets WQ_HIT_FAMILIES, WQ_HIT_DETAILS, WQ_COMMENT_HITS.
wq_scan_comment_families() {
  WQ_COMMENT_HITS=0

  local comment_lines filtered
  comment_lines="$(printf '%s\n' "$WQ_ADDED_LINES" \
    | awk '
      {
        original=$0
        stripped=$0
        sub(/^[[:space:]]+/, "", stripped)
        if (stripped ~ /^\/\//)         { print stripped; next }
        if (stripped ~ /^#( |$)/)       { print stripped; next }
        if (stripped ~ /^#!/)           { next }
        if (stripped ~ /^\/\*/)         { print stripped; next }
        if (stripped ~ /^\*( |$|\/)/)   { print stripped; next }
        if (stripped ~ /^"""/)          { print stripped; next }
        if (stripped ~ /^\x27\x27\x27/) { print stripped; next }
        if (match(original, /\/\/.*/)) {
          print substr(original, RSTART, RLENGTH)
          next
        }
        if (match(original, /[[:space:]]#[^!].*/)) {
          print substr(original, RSTART, RLENGTH)
          next
        }
      }
    ')"

  [[ -z "$comment_lines" ]] && return 0

  filtered="$(printf '%s\n' "$comment_lines" | grep -v 'comments-lint-allow' || true)"
  [[ -z "$filtered" ]] && return 0

  local hits=0
  local history_hits narr_tomb_hits fix_hits taskref_hits orphan_hits tomb_hits

  history_hits=$(printf '%s\n' "$filtered" \
    | grep -cE '修改了|添加了|新增了|删除了|去掉了|之前是|原来是|改成|曾经|\badded\b|\bpreviously\b|used to|changed to|\bmoved\b' \
    || true)
  if [[ "${history_hits:-0}" -gt 0 ]]; then
    hits=$((hits + history_hits))
    wq_record_family "history"
  fi

  narr_tomb_hits=$(printf '%s\n' "$filtered" \
    | grep -E '\b(removed|deleted)\b' \
    | grep -cvE '\b(removed|deleted):' \
    || true)
  if [[ "${narr_tomb_hits:-0}" -gt 0 ]]; then
    hits=$((hits + narr_tomb_hits))
    wq_record_family "history"
  fi

  fix_hits=$(printf '%s\n' "$filtered" \
    | grep -ciE '修复|修正|\bfixed\b|fix:|\bbugfix\b|\bhotfix\b|\bpatched\b' \
    || true)
  if [[ "${fix_hits:-0}" -gt 0 ]]; then
    hits=$((hits + fix_hits))
    wq_record_family "fix-narrative"
  fi

  taskref_hits=$(printf '%s\n' "$filtered" \
    | grep -ciE 'issue #|pr #|ticket #|jira-|\bBL-[0-9]|\bphase[ -][0-9]|\bwave[ -][0-9]' \
    || true)
  if [[ "${taskref_hits:-0}" -gt 0 ]]; then
    hits=$((hits + taskref_hits))
    wq_record_family "task-ref"
  fi

  orphan_hits=$(printf '%s\n' "$filtered" \
    | grep -E '\b(TODO|FIXME|XXX)\b' \
    | grep -cvE '\b(TODO|FIXME|XXX)(:|\(@)' \
    || true)
  if [[ "${orphan_hits:-0}" -gt 0 ]]; then
    hits=$((hits + orphan_hits))
    wq_record_family "orphan-todo"
  fi

  tomb_hits=$(printf '%s\n' "$filtered" \
    | grep -ciE 'removed:|deleted:|gone:' \
    || true)
  if [[ "${tomb_hits:-0}" -gt 0 ]]; then
    hits=$((hits + tomb_hits))
    wq_record_family "tombstone"
  fi

  WQ_COMMENT_HITS="$hits"
}

# Args: <repo_root> <file_path> <cwd>. Updates WQ_HIT_FAMILIES, WQ_HIT_DETAILS.
wq_scan_antipattern_families() {
  local repo_root="$1" file_path="$2" cwd="$3"
  local file_dir rel_dir rel_file

  file_dir="$(dirname "$file_path")"
  rel_dir="${file_dir#"${repo_root}/"}"
  [[ "$rel_dir" == "$file_dir" ]] && rel_dir="."
  rel_file="${file_path#"${repo_root}/"}"

  local case_run
  case_run=$(printf '%s\n' "$WQ_ADDED_LINES" | awk '
    BEGIN { run = 0; best = 0 }
    /\*"[^"]+"\*/ { run += 1; if (run > best) best = run; next }
    { run = 0 }
    END { print best }
  ')
  if [[ "${case_run:-0}" -ge 10 ]]; then
    wq_record_family "case-list"
    _wq_append_detail "case-list: ${case_run} consecutive case-branch patterns — consider externalising to hooks/data/*.tsv or equivalent data file"
  fi

  case "$file_path" in
    *.ts|*.tsx|*.js|*.jsx|*.mjs|*.cjs)
      local export_names no_consumer_names name refs refs_other
      export_names="$(printf '%s\n' "$WQ_ADDED_LINES" \
        | grep -E '^[[:space:]]*export[[:space:]]+(default[[:space:]]+(async[[:space:]]+)?(function|class)|async[[:space:]]+function|abstract[[:space:]]+class|const|let|var|function|class|interface|type)[[:space:]]+[A-Za-z_][A-Za-z0-9_]*' \
        | sed -E 's/^[[:space:]]*export[[:space:]]+(default[[:space:]]+)?(async[[:space:]]+function|abstract[[:space:]]+class|function|class|const|let|var|interface|type)[[:space:]]+([A-Za-z_][A-Za-z0-9_]*).*/\3/' \
        | sort -u)"
      if [[ -n "$export_names" ]]; then
        no_consumer_names=""
        while IFS= read -r name; do
          [[ -z "$name" ]] && continue
          refs="$(_wq_timeout 5s git -C "$repo_root" grep -lwF -e "$name" \
            -- '*.ts' '*.tsx' '*.js' '*.jsx' '*.mjs' '*.cjs' 2>/dev/null || true)"
          refs_other="$(printf '%s\n' "$refs" \
            | grep -vxF -- "$rel_file" \
            | grep -vE '^$' \
            | head -n1 || true)"
          if [[ -z "$refs_other" ]]; then
            no_consumer_names="${no_consumer_names:+${no_consumer_names}, }${name}"
          fi
        done <<<"$export_names"
        if [[ -n "$no_consumer_names" ]]; then
          wq_record_family "no-consumer"
          _wq_append_detail "no-consumer: ${no_consumer_names} (newly-exported, no other file references it — decision ladder rung 1: does it need to exist, or can it be inlined or dropped?)"
        fi
      fi
      ;;
  esac

  local chunks_file copypaste_hit=0 copypaste_neighbor=""
  chunks_file="$(mktemp 2>/dev/null || echo "/tmp/do-it-write-quality-$$-$RANDOM")"
  printf '%s\n' "$WQ_ADDED_LINES" | awk '
    function flush() {
      if (size >= 5) {
        print "===CHUNK==="
        for (i = 0; i < size; i++) print buf[i]
      }
      size = 0
      delete buf
    }
    {
      line = $0
      trimmed = line
      sub(/^[[:space:]]+/, "", trimmed)
      sub(/[[:space:]]+$/, "", trimmed)
      if (length(trimmed) < 20) { flush(); next }
      if (trimmed ~ /^(\/\/|#|\*|\/\*)/) { flush(); next }
      buf[size++] = line
    }
    END { flush() }
  ' > "$chunks_file"

  _wq_check_chunk() {
    local fa="$1" fb="$2"
    [[ -z "$fa" || -z "$fb" || "$fa" == "$fb" ]] && return 0
    local cand row
    cand="$(_wq_timeout 5s git -C "$repo_root" grep -lF -e "$fa" -- "$rel_dir" 2>/dev/null \
      | grep -vxF -- "$rel_file" \
      | head -n5 || true)"
    [[ -z "$cand" ]] && return 0
    while IFS= read -r row; do
      [[ -z "$row" ]] && continue
      if _wq_timeout 5s git -C "$repo_root" grep -q -F -e "$fb" -- "$row" 2>/dev/null; then
        copypaste_hit=1
        copypaste_neighbor="$row"
        return 0
      fi
    done <<<"$cand"
  }

  local chunk_lines=()
  _wq_evaluate_chunk() {
    local n=${#chunk_lines[@]}
    [[ "$n" -lt 5 ]] && { chunk_lines=(); return 0; }
    _wq_check_chunk "${chunk_lines[1]}" "${chunk_lines[$((n - 2))]}"
    chunk_lines=()
  }

  local line
  while IFS= read -r line || [[ -n "$line" ]]; do
    if [[ "$line" == "===CHUNK===" ]]; then
      [[ "$copypaste_hit" -eq 1 ]] && break
      _wq_evaluate_chunk
      continue
    fi
    chunk_lines+=("$line")
  done < "$chunks_file"

  if [[ "$copypaste_hit" -eq 0 ]]; then
    _wq_evaluate_chunk
  fi

  rm -f "$chunks_file" 2>/dev/null

  if [[ "$copypaste_hit" -eq 1 ]]; then
    wq_record_family "copy-paste"
    _wq_append_detail "copy-paste: a ≥5-line block looks duplicated against ${copypaste_neighbor} — consider reusing the existing helper instead of copying"
  fi

  # cwd is accepted for API symmetry with the hook caller; antipattern scans use
  # repo_root + file_path only today.
  :
}

# Args: <file_path>. Adds swallow-error, debug-leftover, test-weakened, edit-bloat.
wq_scan_extra_families() {
  local file_path="$1"
  local bloat_threshold added_count swallow_hits debug_hits test_hits

  bloat_threshold="${DO_IT_EDIT_BLOAT_LINES:-80}"
  case "$bloat_threshold" in
    ''|*[!0-9]*) bloat_threshold=80 ;;
  esac

  added_count="$(printf '%s\n' "$WQ_ADDED_LINES" | grep -c . || true)"
  if [[ "${added_count:-0}" -gt "$bloat_threshold" ]]; then
    wq_record_family "edit-bloat"
    _wq_append_detail "edit-bloat: ${added_count} lines added in one edit (threshold ${bloat_threshold}) — consider slicing into smaller vertical changes"
  fi

  swallow_hits=$(printf '%s\n' "$WQ_ADDED_LINES" \
    | grep -cE 'catch[[:space:]]*\([^)]*\)[[:space:]]*\{[[:space:]]*\}|catch[[:space:]]*\{[[:space:]]*\}|\.catch\([[:space:]]*\(\)[[:space:]]*=>[[:space:]]*\{[[:space:]]*\}|except[^:]*:[[:space:]]*pass[[:space:]]*(#|$)' \
    || true)
  if [[ "${swallow_hits:-0}" -gt 0 ]]; then
    wq_record_family "swallow-error"
    _wq_append_detail "swallow-error: empty catch or except:pass on newly-added lines — trace the failure instead of hiding it"
  fi

  case "$file_path" in
    *test*|*__tests__*|*Test*) ;;
    *)
      debug_hits=$(printf '%s\n' "$WQ_ADDED_LINES" \
        | grep -cE '\bconsole\.(log|debug|info|warn|error)\(|\bdebugger\b|\bprint\([^)]+\)' \
        || true)
      if [[ "${debug_hits:-0}" -gt 0 ]]; then
        wq_record_family "debug-leftover"
        _wq_append_detail "debug-leftover: console.log/debugger/print added outside test paths — remove before declaring done"
      fi
      ;;
  esac

  test_hits=$(printf '%s\n' "$WQ_ADDED_LINES" \
    | grep -ciE '\.(skip|only)\(|\.(skip|only)[[:space:]]*\(|^[[:space:]]*(xit|xtest|xdescribe|xcontext)\(|@pytest\.mark\.(skip|skipif)|it\.skip|describe\.skip|test\.skip' \
    || true)
  if [[ "${test_hits:-0}" -gt 0 ]]; then
    wq_record_family "test-weakened"
    _wq_append_detail "test-weakened: skip/xfail/only markers on newly-added lines — fix the test or the code instead of weakening coverage"
  fi
}
