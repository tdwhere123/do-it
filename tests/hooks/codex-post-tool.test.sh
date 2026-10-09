#!/usr/bin/env bash
# Native Codex post-tool payloads must reach the canonical lint as file edits.
set -euo pipefail
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
python3 - "$REPO_ROOT" <<'PY'
import json
import os
import re
from pathlib import Path
import subprocess
import sys
import tempfile

hook = Path(sys.argv[1]) / 'hooks/codex-post-tool.sh'
with tempfile.TemporaryDirectory(prefix='do-it-codex-post-tool-') as temporary:
    root = Path(temporary)
    repo = root / 'repo'
    repo.mkdir()
    subprocess.run(['git', 'init', '-q', str(repo)], check=True)
    env = dict(os.environ, CLAUDE_PLUGIN_DATA=str(root / 'state'))
    for key in ('CURSOR_PLUGIN_DATA', 'KIMI_CODE_HOME', 'KIMI_PLUGIN_ROOT', 'DO_IT_CONTEXT_OUTPUT'):
        env.pop(key, None)
    names = ['added.ts', 'updated.ts', 'moved destination.ts', 'space name.ts', '$(touch INJECTED).ts', '`touch BACKTICK`.ts']
    for name in ['updated.ts', 'old.ts', 'deleted.ts']:
        (repo / name).write_text('const before = 1;\n')
    subprocess.run(['git', '-C', str(repo), 'add', '.'], check=True)
    subprocess.run(['git', '-C', str(repo), '-c', 'user.name=Test', '-c', 'user.email=test@example.com',
                    '-c', 'core.hooksPath=/dev/null', 'commit', '-qm', 'baseline'], check=True)
    (repo / 'old.ts').unlink()
    for name in names + ['deleted.ts']:
        (repo / name).write_text("export function load() { try { return 1; } catch (error) {} }\n")
    (repo / 'link.ts').symlink_to(repo / 'added.ts')
    outside = root / 'outside.ts'
    outside.write_text((repo / 'added.ts').read_text())
    patch = '\n'.join([
        '*** Begin Patch', '*** Add File: added.ts', '+anything',
        '*** Update File: updated.ts', '@@', '-before', '+after',
        '*** Update File: old.ts', '*** Move to: moved destination.ts', '@@', '-before', '+after',
        *sum(([f'*** Add File: {name}', '+anything'] for name in names[3:]), []),
        '*** Update File: ./added.ts', '@@', '-before', '+after',
        '*** Delete File: deleted.ts', '*** Add File: link.ts', '+anything',
        f'*** Add File: {outside}', '+anything', '*** End Patch',
    ])

    def run(payload, extra=None):
        result = subprocess.run(['bash', str(hook)], input=payload if isinstance(payload, str) else json.dumps(payload),
                                text=True, capture_output=True, cwd=root, env=env | (extra or {}))
        assert result.returncode == 0, (result.returncode, result.stderr)
        return result.stdout

    def event(session, tool='apply_patch', tool_input=None):
        return dict(session_id=session, cwd=str(repo), tool_name=tool,
                    tool_input=tool_input if tool_input is not None else dict(command=patch))

    def context(output):
        value = json.loads(output)  # Rejects concatenated JSON objects.
        assert value['hookSpecificOutput']['hookEventName'] == 'PostToolUse', value
        return value['hookSpecificOutput']['additionalContext']

    for session, extra in [('native', {}), ('no-jq', {'DO_IT_FORCE_NO_JQ': '1'}),
                           ('plain-env', {'DO_IT_CONTEXT_OUTPUT': 'plain'})]:
        text = context(run(event(session), extra))
        for name in names:
            matches = re.findall(r'edit on ' + re.escape(name) + r' matched ([^\n]+)', text)
            assert len(matches) == 1 and 'swallow-error' in matches[0], (name, text)
        for skipped in ['old.ts', 'deleted.ts', 'link.ts', 'outside.ts']:
            assert f'edit on {skipped}' not in text, text
    assert not (root / 'INJECTED').exists() and not (repo / 'INJECTED').exists()
    assert not (root / 'BACKTICK').exists() and not (repo / 'BACKTICK').exists()
    print('PASS: multi-file native patch, move, deletion, dedup, guards, metacharacters, no-jq, one JSON')

    for tool in ['Edit', 'Write', 'MultiEdit', 'NotebookEdit', 'StrReplace', 'EditNotebook']:
        text = context(run(event('legacy-' + tool, tool, {'path': 'updated.ts'})))
        assert 'edit on updated.ts matched ' in text and 'swallow-error' in text
    text = context(run(event('legacy-file', 'Edit', {'file_path': str(repo / 'added.ts')})))
    assert 'edit on added.ts matched ' in text and 'swallow-error' in text
    print('PASS: legacy direct file edits')

    for payload in ['{', 'null', '[]', event('read', 'Read'), event('bad', tool_input={'command': {}}),
                    event('incomplete', tool_input={'command': '*** Begin Patch\n*** Add File: added.ts'}),
                    event('delete', tool_input={'command': '*** Begin Patch\n*** Delete File: deleted.ts\n*** End Patch'})]:
        assert run(payload) == '', payload
    # Non-directory storage and temp roots simulate an unwritable environment even as root.
    blocked = root / 'blocked'
    blocked.write_text('not a directory')
    output = run(event('blocked'), {key: str(blocked) for key in
                 ['CLAUDE_PLUGIN_DATA', 'CURSOR_PLUGIN_DATA', 'PLUGIN_DATA', 'DO_IT_HOOK_DATA', 'CODEX_HOME', 'TMPDIR']})
    if output:
        context(output)
    minimal = root / 'minimal-bin'
    minimal.mkdir()
    import shutil
    for command in ['bash', 'dirname', 'cat']:
        (minimal / command).symlink_to(shutil.which(command))
    assert run(event('missing-deps'), {'PATH': str(minimal)}) == ''
    print('PASS: read-only, malformed, deletion-only, unwritable state, missing JSON dependencies fail open')
PY
