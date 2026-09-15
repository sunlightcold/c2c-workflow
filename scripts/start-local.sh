#!/usr/bin/env bash

set -Eeuo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"

if ! command -v cygpath >/dev/null 2>&1; then
  printf 'start-local.sh must be run from Git Bash on Windows.\n' >&2
  exit 1
fi

if command -v pwsh.exe >/dev/null 2>&1; then
  powershell_command='pwsh.exe'
elif command -v powershell.exe >/dev/null 2>&1; then
  powershell_command='powershell.exe'
else
  printf 'PowerShell is not available in Git Bash PATH.\n' >&2
  exit 1
fi

powershell_script="$(cygpath -w "$script_dir/Start-Local.ps1")"
MSYS2_ARG_CONV_EXCL='*' exec "$powershell_command" \
  -NoLogo \
  -NoProfile \
  -ExecutionPolicy Bypass \
  -File "$powershell_script" \
  "$@"
