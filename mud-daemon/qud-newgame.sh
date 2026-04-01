#!/bin/bash
# qud-newgame.sh — Fully automated: kill Qud, relaunch, create random character, get in-game.
# Usage: ./qud-newgame.sh

IPC_DIR="$HOME/mud-daemon-gamestate/mud-daemon/data/qud/ipc"
QUD_APP="$HOME/Library/Application Support/Steam/steamapps/common/Caves of Qud/CoQ.app"
BUILD_LOG="$HOME/Library/Application Support/com.FreeholdGames.CavesOfQud/build_log.txt"

echo "[NewGame] Killing existing Qud..."
pkill -f "CoQ" 2>/dev/null
sleep 3

echo "[NewGame] Clearing IPC files..."
rm -f "$IPC_DIR/state.json" "$IPC_DIR/result.json" "$IPC_DIR/debug.log" "$IPC_DIR/tick.txt"

echo "[NewGame] Launching Qud..."
open "$QUD_APP"

echo "[NewGame] Waiting for build..."
for i in $(seq 1 30); do
  sleep 2
  if tail -1 "$BUILD_LOG" 2>/dev/null | grep -q "FINAL LOAD ORDER"; then
    if grep "$(tail -1 "$BUILD_LOG" | grep -oE '\d\d:\d\d:\d\d')" "$BUILD_LOG" | grep -q "error CS"; then
      echo "[NewGame] BUILD FAILED — check errors"
      exit 1
    fi
    echo "[NewGame] Build OK"
    break
  fi
done

echo "[NewGame] Waiting for menu to load..."
sleep 8

echo "[NewGame] Clicking New Game..."
osascript -e '
tell application "System Events"
    tell process "CoQ"
        set frontmost to true
        delay 1
        -- Click center-ish of screen where New Game button is
        -- (Qud main menu has New Game as first option)
        keystroke return
        delay 2
    end tell
end tell
' 2>/dev/null

echo "[NewGame] Randomizing character + navigating creation..."
# Generate a random name (6-8 chars, starts uppercase)
CHARNAME=$(python3 -c "
import random, string
length = random.randint(6,8)
name = random.choice(string.ascii_uppercase) + ''.join(random.choices(string.ascii_lowercase, k=length-1))
print(name)
")
echo "[NewGame] Character name: $CHARNAME"

osascript -e "
tell application \"System Events\"
    tell process \"CoQ\"
        set frontmost to true
        delay 1
        -- R to randomize build
        keystroke \"r\"
        delay 1
        -- Spacebar through screens until we hit the name field
        repeat 10 times
            keystroke \" \"
            delay 0.8
        end repeat
        -- Type the character name then Enter
        keystroke \"$CHARNAME\"
        delay 0.5
        keystroke return
        delay 1
        -- Press 9 to confirm name/advance past name screen
        keystroke \"9\"
        delay 1
        -- Continue spacebar through remaining screens
        repeat 15 times
            keystroke \" \"
            delay 0.8
        end repeat
    end tell
end tell
" 2>/dev/null &

echo "[NewGame] Waiting for game state..."
for i in $(seq 1 30); do
  sleep 2
  if [ -f "$IPC_DIR/state.json" ]; then
    echo "[NewGame] IN GAME!"
    python3 -c "
import json
s = json.load(open('$IPC_DIR/state.json'))
print(f'  Character: {s[\"name\"]}')
print(f'  Position:  {s[\"position\"]}')
print(f'  HP:        {s[\"hp\"]}/{s[\"maxHp\"]}')
print(f'  Zone:      {s[\"zoneName\"]}')
print(f'  Entities:  {len(s.get(\"entities\",[]))}')
"
    exit 0
  fi
done

echo "[NewGame] Timed out waiting for game"
exit 1
