#!/usr/bin/env bash
# Compat entrypoint: 0.16 hosts keep invoking behavior-feedback.sh.
# Implementation lives in learning-recorder.sh.
exec "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/learning-recorder.sh"
