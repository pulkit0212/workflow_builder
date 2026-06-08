#!/bin/sh
set -e

# Best-effort PulseAudio for Linux ffmpeg pulse capture in containers
if command -v pulseaudio >/dev/null 2>&1; then
  pulseaudio --daemonize --exit-idle-time=-1 --log-level=error 2>/dev/null || true
fi

exec node index.js
