#!/bin/bash
# qud-reload.sh — Kill Qud, relaunch, load most recent save.
# Falls back to exit 1 if no saves found or load fails.
# Usage: ./qud-reload.sh

IPC_DIR="$HOME/mud-daemon-gamestate/mud-daemon/data/qud/ipc"
QUD_APP="$HOME/Library/Application Support/Steam/steamapps/common/Caves of Qud/CoQ.app"
BUILD_LOG="$HOME/Library/Application Support/com.FreeholdGames.CavesOfQud/build_log.txt"
SAVES_DIR="$HOME/Library/Application Support/com.FreeholdGames.CavesOfQud/Saves"

# Check if saves exist
SAVE_COUNT=$(find "$SAVES_DIR" -name "*.sav" 2>/dev/null | wc -l | tr -d ' ')
if [ "$SAVE_COUNT" -eq 0 ]; then
  echo "[Reload] No save files found (permadeath or never saved). Cannot reload."
  exit 1
fi
echo "[Reload] Found $SAVE_COUNT save file(s)"

echo "[Reload] Killing existing Qud..."
pkill -f "CoQ" 2>/dev/null
sleep 3

echo "[Reload] Clearing IPC files..."
rm -f "$IPC_DIR/state.json" "$IPC_DIR/result.json" "$IPC_DIR/debug.log" "$IPC_DIR/tick.txt"

echo "[Reload] Launching Qud..."
open "$QUD_APP"

echo "[Reload] Waiting for build..."
for i in $(seq 1 30); do
  sleep 2
  if tail -1 "$BUILD_LOG" 2>/dev/null | grep -q "FINAL LOAD ORDER"; then
    if grep "$(tail -1 "$BUILD_LOG" | grep -oE '\d\d:\d\d:\d\d')" "$BUILD_LOG" | grep -q "error CS"; then
      echo "[Reload] BUILD FAILED — check errors"
      exit 1
    fi
    echo "[Reload] Build OK"
    break
  fi
done

echo "[Reload] Waiting for menu to load..."
sleep 8

echo "[Reload] Navigating to Load Game..."
osascript -e '
tell application "System Events"
    tell process "CoQ"
        set frontmost to true
        delay 1
        -- Main menu: "New Game" is selected by default.
        -- Press Down arrow to reach "Load Game" (second option).
        key code 125
        delay 0.5
        keystroke return
        delay 3
        -- Save list: most recent save is first. Press Enter to load it.
        keystroke return
        delay 2
    end tell
end tell
' 2>/dev/null

echo "[Reload] Waiting for game state..."
for i in $(seq 1 30); do
  sleep 2
  if [ -f "$IPC_DIR/state.json" ]; then
    echo "[Reload] GAME LOADED!"
    python3 -c "
import json
s = json.load(open('$IPC_DIR/state.json'))
print(f'  Character: {s[\"name\"]}')
print(f'  Position:  {s[\"position\"]}')
print(f'  HP:        {s[\"hp\"]}/{s[\"maxHp\"]}')
print(f'  Zone:      {s[\"zoneName\"]}')
"
    exit 0
  fi
done

echo "[Reload] Timed out waiting for game to load"
exit 1
