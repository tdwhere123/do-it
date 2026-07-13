: << 'CMDBLOCK'
@echo off
REM Cross-platform polyglot wrapper for do-it Cursor hooks.
REM On Windows: cmd.exe runs this batch block and invokes Git Bash.
REM On Unix: the shell treats the block as a heredoc, then runs the bash
REM section below — so the same hooks.json command works on all platforms.
REM
REM Why .cmd: Cursor on Windows treats a bare .sh (or extensionless bash)
REM path as a file to open in the editor / "Open with" dialog instead of
REM executing it. Routing through .cmd makes CMD.exe the entrypoint.
REM
REM Usage: run-hook.cmd <script-basename> [args...]
REM   e.g. run-hook.cmd router
REM        run-hook.cmd session-start
REM Script may be given with or without a .sh suffix.

if "%~1"=="" (
    echo run-hook.cmd: missing script name >&2
    exit /b 1
)

set "HOOK_DIR=%~dp0"
set "SCRIPT_NAME=%~1"
if /i not "%SCRIPT_NAME:~-3%"==".sh" set "SCRIPT_NAME=%SCRIPT_NAME%.sh"
shift

REM Basename-only: reject path separators / traversal.
echo.%SCRIPT_NAME%| findstr /r /c:"[\\/]" /c:"\.\." >nul
if not errorlevel 1 (
    echo run-hook.cmd: refusing unsafe script name "%SCRIPT_NAME%" >&2
    exit /b 1
)

REM Allowlist of shipped hook scripts.
set "ALLOWED=0"
for %%A in (
    session-start.sh router.sh grill-prompt.sh subagent-stance.sh
    write-quality-lint.sh verification-gate.sh
    anti-patterns-lint.sh comments-lint.sh
) do if /i "%SCRIPT_NAME%"=="%%A" set "ALLOWED=1"
if "%ALLOWED%"=="0" (
    echo run-hook.cmd: unknown hook script "%SCRIPT_NAME%" >&2
    exit /b 1
)

REM Ensure Cursor plugin env vars exist when Hooks service invoked us via
REM user-level ~/.cursor/hooks.json (plugin hooks.json is not registered today).
if not defined CURSOR_PLUGIN_ROOT (
    for %%I in ("%HOOK_DIR%..") do set "CURSOR_PLUGIN_ROOT=%%~fI"
)
if not defined CURSOR_PLUGIN_DATA (
    set "CURSOR_PLUGIN_DATA=%CURSOR_PLUGIN_ROOT%\.do-it-data"
)

set "SCRIPT_PATH=%HOOK_DIR%%SCRIPT_NAME%"
if not exist "%SCRIPT_PATH%" (
    echo run-hook.cmd: missing hook script "%SCRIPT_PATH%" >&2
    exit /b 1
)

REM Prefer Git for Windows bash — never use System32\bash.exe (WSL launcher).
if exist "C:\Program Files\Git\bin\bash.exe" (
    "C:\Program Files\Git\bin\bash.exe" "%SCRIPT_PATH%" %1 %2 %3 %4 %5 %6 %7 %8 %9
    exit /b %ERRORLEVEL%
)
if exist "C:\Program Files (x86)\Git\bin\bash.exe" (
    "C:\Program Files (x86)\Git\bin\bash.exe" "%SCRIPT_PATH%" %1 %2 %3 %4 %5 %6 %7 %8 %9
    exit /b %ERRORLEVEL%
)

REM PATH lookup, skipping the WSL stub under System32 / SysWOW64 / Sysnative.
set "FOUND_BASH="
for /f "delims=" %%i in ('where bash 2^>nul') do (
    if not defined FOUND_BASH (
        echo %%i| findstr /i /c:"\System32\bash.exe" /c:"\SysWOW64\bash.exe" /c:"\Sysnative\bash.exe" >nul
        if errorlevel 1 set "FOUND_BASH=%%i"
    )
)
if defined FOUND_BASH (
    "%FOUND_BASH%" "%SCRIPT_PATH%" %1 %2 %3 %4 %5 %6 %7 %8 %9
    exit /b %ERRORLEVEL%
)

echo run-hook.cmd: Git Bash not found. Install Git for Windows, or ensure bash.exe is on PATH ^(not System32\bash.exe^). >&2
exit /b 1
CMDBLOCK

# Unix: re-exec under bash if we were started by /bin/sh (no bashisms yet).
# shellcheck disable=SC3028
if [ -z "${BASH_VERSION:-}" ]; then
  exec bash "$0" "$@"
fi

# shellcheck disable=SC2039,SC3046
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SCRIPT_NAME="${1:-}"
if [ -z "$SCRIPT_NAME" ]; then
  echo "run-hook.cmd: missing script name" >&2
  exit 1
fi
shift
case "$SCRIPT_NAME" in
  *.sh) ;;
  *) SCRIPT_NAME="${SCRIPT_NAME}.sh" ;;
esac

case "$SCRIPT_NAME" in
  */*|*"\\"*|*\.\.*)
    echo "run-hook.cmd: refusing unsafe script name ${SCRIPT_NAME}" >&2
    exit 1
    ;;
esac

case "$SCRIPT_NAME" in
  session-start.sh|router.sh|grill-prompt.sh|subagent-stance.sh|write-quality-lint.sh|verification-gate.sh|anti-patterns-lint.sh|comments-lint.sh)
    ;;
  *)
    echo "run-hook.cmd: unknown hook script ${SCRIPT_NAME}" >&2
    exit 1
    ;;
esac

if [ -z "${CURSOR_PLUGIN_ROOT:-}" ]; then
  CURSOR_PLUGIN_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
  export CURSOR_PLUGIN_ROOT
fi
if [ -z "${CURSOR_PLUGIN_DATA:-}" ]; then
  CURSOR_PLUGIN_DATA="${CURSOR_PLUGIN_ROOT}/.do-it-data"
  export CURSOR_PLUGIN_DATA
fi

SCRIPT_PATH="${SCRIPT_DIR}/${SCRIPT_NAME}"
if [ ! -f "$SCRIPT_PATH" ]; then
  echo "run-hook.cmd: missing hook script ${SCRIPT_PATH}" >&2
  exit 1
fi
exec bash "$SCRIPT_PATH" "$@"
