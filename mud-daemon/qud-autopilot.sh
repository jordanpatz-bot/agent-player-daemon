#!/bin/bash
# qud-autopilot.sh — Polls for command.txt and sends a keypress to Qud to trigger turns.
# Requires accessibility permissions for osascript.
# Usage: ./qud-autopilot.sh

IPC_DIR="$HOME/mud-daemon-gamestate/mud-daemon/data/qud/ipc"
COMMAND_FILE="$IPC_DIR/command.txt"
POLL_INTERVAL=0.5

echo "[Autopilot] Watching $COMMAND_FILE"
echo "[Autopilot] Press Ctrl+C to stop"

while true; do
    if [ -f "$COMMAND_FILE" ]; then
        echo "[Autopilot] Command detected — sending keypress to Qud"
        osascript -e '
        tell application "System Events"
            set qudProcs to every process whose name contains "CoQ"
            if (count of qudProcs) > 0 then
                set frontmost of item 1 of qudProcs to true
                delay 0.3
                keystroke ";"
                delay 0.3
                keystroke ";"
            end if
        end tell
        ' 2>/dev/null
        sleep 1.5
    fi
    sleep $POLL_INTERVAL
done
