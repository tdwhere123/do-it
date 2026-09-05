#!/usr/bin/env bash
# Stable compatibility entrypoint for prompt context delivery.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec bash "${SCRIPT_DIR}/kernel-context.sh"
