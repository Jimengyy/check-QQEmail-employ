#!/bin/bash
set -euo pipefail

RESOURCE_DIR="$(cd "$(dirname "$0")" && pwd)"
EXECUTABLE="$RESOURCE_DIR/../Helpers/OfferPilotRuntime.app/Contents/MacOS/OfferPilotRuntime"
# Resolve '..' so ps comparisons also work after Finder copies the app.
EXECUTABLE="$(cd "$(dirname "$EXECUTABLE")" && pwd)/OfferPilotRuntime"
LOG_DIR="$HOME/Library/Logs/OfferPilot"
mkdir -p "$LOG_DIR"

# Match this exact bundled executable, never unrelated main.py/server.py processes.
PIDS=$(/bin/ps -ww -axo pid=,comm= | /usr/bin/awk -v executable="$EXECUTABLE" '
    { pid=$1; sub(/^[[:space:]]*[0-9]+[[:space:]]+/, ""); if ($0 == executable) print pid }
')
if [ -n "$PIDS" ]; then
    while IFS= read -r pid; do
        kill "$pid" 2>/dev/null || true
    done <<< "$PIDS"
    /usr/bin/osascript -e 'display notification "🔴 OfferPilot：已关闭" with title "OfferPilot"' 2>/dev/null || true
else
    cd "$HOME"
    /usr/bin/nohup "$EXECUTABLE" > "$LOG_DIR/runtime.log" 2>&1 < /dev/null &
    pid=$!
    sleep 1
    if ! kill -0 "$pid" 2>/dev/null; then
        echo "OfferPilot 启动失败，请查看 $LOG_DIR/runtime.log" >&2
        exit 1
    fi
    /usr/bin/osascript -e 'display notification "🟢 OfferPilot：正在启动" with title "OfferPilot"' 2>/dev/null || true
fi
