# Caves of Qud -- Autonomous Agent Session Report
## Date: 2026-03-31 (~02:49 - 02:58 AM)
## Character: Shwyjr, Level 1, World Map
## Agent: Claude Opus 4.6 (1M context)

---

## Session Summary

Performed autonomous exploration of the Caves of Qud world map via file-based IPC. Made **12 successful movement commands** plus `look` and `wait` commands. The character is on the **world map** (not inside Joppa village), navigating terrain tiles around what appears to be the Joppa settlement marker. All commands executed successfully through the file IPC pipeline.

Key finding: The character is **outside Joppa on the overworld**, not inside the village. The previous session (qud-first-session.md) analyzed a state where the character was inside Joppa with 16 NPCs visible. Something changed between sessions -- the character either left the village or the game was reloaded to a different state.

---

## Moves Made

| # | Command | From | To | Result |
|---|---------|------|----|--------|
| 1 | move s | (11, 21) | (11, 22) | OK - pre-session move visible in debug log |
| 2 | look | (11, 22) | (11, 22) | OK - zone: "Qud, surface" |
| 3 | move s | (11, 22) | (11, 23) | OK |
| 4 | move n | (11, 23) | (11, 22) | OK |
| 5 | move nw | (11, 22) | (10, 21) | OK |
| 6 | move se | (10, 21) | (11, 22) | OK |
| 7 | move s | (11, 22) | (11, 23) | OK |
| 8 | move ne | (11, 23) | (12, 22) | OK - adjacent to the O-slash marker |
| 9 | move w | (12, 22) | (11, 22) | OK - stepped onto the O-slash marker |
| 10 | move e | (11, 22) | (12, 22) | OK |
| 11 | move e | (12, 22) | (12, 22) | Position unchanged -- possibly hit a barrier or timing issue |
| 12 | move n | (12, 22) | (12, 21) | OK |
| 13 | move w | (12, 21) | (11, 21) | OK |
| 14 | move se | (11, 21) | (12, 22) | OK |
| 15 | wait | (12, 22) | (12, 22) | OK |
| 16 | look | (12, 22) | (12, 22) | OK - zone: "Qud, surface" |

**Total successful moves: 12 directional, 1 wait, 2 look = 15 commands total**

---

## Character Stats

- **Name**: Shwyjr (different from previous session's "Uuruuyuraq" -- appears to be the same build with a new name, or a different character)
- **Level 1**, 0 XP, HP 18/18
- **AV 0 / DV 0** -- Previous session showed AV 2, DV -1. The 0/0 might indicate the character is unequipped or the world map doesn't report armor stats
- **STR 22, AGI 18, TOU 18, INT 14, WIL 16, EGO 16** -- Identical stat block to previous session
- **MoveSpeed 80** (faster than base 100; lower is faster in Qud)
- **No resistances** (heat/cold/electric/acid all 0)

### Inventory
| Item | Notes |
|------|-------|
| waterskin [empty] x2 | Need to fill at a water source |
| torch x13 (unburnt) | Was 11 in previous session -- 2 more torches |
| waterskin [31 drams of fresh water] | Was 32 drams -- 1 dram consumed |
| bear jerky [10 servings] | Was 8 in previous session -- 2 more servings |
| witchwood bark x4 | Was 3 -- 1 more bark |
| furs (AV 2, DV -1) | Equipment item with armor values (encoded oddly in JSON) |

**Observation**: The "furs" entry in state.json reads as `furs \u00042 \t-1` which appears to be `furs AV2 DV-1`. This matches the previous session's AV 2 / DV -1, suggesting the character has furs equipped but the AV/DV stats aren't being reflected in the top-level stats while on the world map.

---

## World Map Layout and ASCII Screen Analysis

### What I See

The character is on the **Qud overworld/surface map**, not inside any zone. The screen shows a ~45-wide by ~16-tall window of world map tiles.

**Screen at final position (12, 22):**
```
  Line 12: ~o/o/o/o/o/~~~~oioooinniin...
  Line 13: o/o/o/~~~~~~ooO/@oinio/aacc...
  Line 14: o/~~o/~~~~~ooooinniin...
```
(Approximation -- actual characters are extended ASCII/UTF-8)

### Terrain Symbol Dictionary (World Map)

| Symbol | Likely Meaning |
|--------|---------------|
| `~` | Grassland/plains (most common, forms the open terrain) |
| `o/` (div sign) | Desert/salt pan/wasteland (forms large eastern region) |
| `o` (ocirc) | Trees/jungle/dense terrain (clusters together) |
| `i` (i-umlaut) | Forest/woodland |
| `n` | Hills/highlands |
| `u` (u accent) | Vegetation/shrubs |
| `.` | Open ground/sand |
| `'` | Sparse vegetation |
| `,` | Low scrub |
| `a` (ae) | Mountain/rocky terrain (eastern region) |
| `c` (c-cedilla) | Settled/developed terrain (large eastern bloc) |
| `O/` (O-slash) | **Settlement/village marker -- JOPPA** |
| `@` | **Player character** |
| `o^` (o-circumflex) | Oasis/palm terrain (cluster around Joppa) |

### Map Structure Observed

The world map has clear biome regions:
- **West side**: Dominated by `~` (grassland/plains) tiles
- **Center-west**: `o^` (oasis/palm) cluster -- this is where Joppa sits
- **Center**: Transition zone with `i`, `n`, `u` (forest, hills, vegetation)
- **East side**: Dense `c` and `ae` tiles (mountains/civilized regions with `A`, `U`, `3` special characters)

**Joppa's position**: The `O/` marker is at approximately world coordinates (11, 22). The `o^` tiles forming a roughly 3x5 cluster around it represent the oasis that Joppa sits in.

---

## NPCs Found

**None.** The entities array was empty throughout the entire session. On the world map, the state doesn't report individual NPCs -- they only appear when inside a zone. The previous session (inside Joppa) showed 16 entities including Elder Irudad, Argyve, Warden Yrame, Tam, watervine farmers, and a glowfish.

---

## IPC Behavior and Bugs

### What Worked
1. **Command execution is reliable.** Every command written to `command.txt` was eventually consumed and executed. The debug.log confirms all commands.
2. **state.json updates correctly.** Position, turn counter, and energy values updated after each move.
3. **result.json provides feedback.** Commands return status, moved direction, and position (an improvement over the previous session which noted result.json was missing).
4. **The autopilot shell script works.** The `qud-autopilot.sh` process was running (PID 96563), sending semicolon keypresses to trigger game ticks.

### Issues Found

1. **Stale result.json**: Sometimes result.json shows the previous command's result even after a new command was executed. The state.json was always current, but result.json lagged behind. This suggests result.json is written on command consumption but sometimes the file read happens before the write completes.

2. **Command processing delays**: Some commands took 8-15 seconds to be consumed (visible in debug.log gaps). The autopilot polls every 0.5s but only sends keypresses to the game when it sees a command file. If the game window isn't in focus or macOS accessibility permissions are finicky, the osascript keystroke may fail silently.

3. **Position stuck on duplicate move**: Sending `move e` twice in quick succession resulted in position not changing on the second move (stayed at 12, 22). Either the second command was consumed before the first completed, or there was a terrain barrier.

4. **No zone transition**: Walking onto the `O/` (Joppa) marker on the world map did NOT trigger entry into the Joppa zone. The zone stayed as "JoppaWorld" / "Qud, surface". In standard Caves of Qud gameplay, stepping onto a settlement marker enters it. This may be because:
   - The IPC move command only handles overworld movement, not zone transitions
   - Zone transitions require a confirmation keypress (like `>` or Enter) that the IPC doesn't send
   - The mod doesn't handle the zone loading event

5. **Entity array always empty on world map**: No entities reported at any position. The world map view doesn't enumerate creatures/NPCs -- that only works inside zones.

6. **AV/DV showing as 0**: Despite having furs (AV 2, DV -1) in inventory, the character's AV and DV are both reported as 0 on the world map. Either stats aren't calculated on the overworld or the furs aren't equipped.

---

## Comparison to MUD Gameplay

### What's Different About Tile-Based File IPC

**Spatial reasoning is fundamentally different.** In a MUD, you move between discrete rooms ("go north" takes you to a named room with a description). In Qud via IPC, you move on a coordinate grid. I had to:
- Track my `(x, y)` position across moves
- Observe how screen symbols shift relative to my position to deduce world features
- Triangulate the Joppa marker's position by moving around it and noting screen changes
- Mentally map biome boundaries from repeating character patterns

**The screen buffer is a puzzle, not a narrative.** In a MUD, you get prose: "You enter the village of Joppa. Watervine farmers tend their crops." Here, I get `ôôØ@ôïnï` and have to decode that the `Ø` is a settlement, the `ô` is oasis terrain, and the `ï` is forest. There's no legend or description -- just raw tile data.

**Navigation is more precise but less meaningful.** I can move in 8 directions with exact coordinate tracking. In a MUD, "north" leads to a curated room with description, NPCs, and objects. Here, "move n" just decrements Y and shifts the tile grid. Every tile on the world map feels identical from the state data alone.

**The feedback loop is tighter than expected.** The previous report described the IPC as "half-duplex" and "write-only from the game side." This session shows it has improved: result.json returns command acknowledgment with position, state.json updates reliably, and the debug.log provides full command history. The loop is functional, just slow (~3-5 seconds per command).

**No narrative layer at all.** This is the biggest gap. A MUD wraps every action in prose that builds a mental model of the world. The Qud IPC is pure data -- coordinates, stats, symbol grids. Playing this way feels like controlling a character through a spreadsheet. Effective, but soulless.

### What Qud IPC Does Better Than MUDs
- **Complete spatial awareness**: I see the entire visible map, not just the current room
- **Precise positioning**: Exact (x, y) for everything, enabling pathfinding calculations
- **No parsing ambiguity**: Structured JSON vs. regex-matching MUD telnet output
- **Deterministic state**: State.json is a complete snapshot; MUD state must be assembled from streamed fragments

### What MUDs Do Better
- **Rich feedback**: Every action has prose output that contextualizes what happened
- **Interaction depth**: Talk, examine, trade, attack, use -- full verb vocabulary
- **Autonomous operation**: Behavior trees, reflexes, heal triggers, flee conditions
- **Story and atmosphere**: Room descriptions, NPC dialogue, combat narration

---

## What Additional Commands I Wish I Had

### Critical (needed to actually play the game)

1. **`enter`** -- Enter a zone when standing on a settlement/dungeon marker on the world map. Without this, I'm trapped on the overworld and can't interact with anything meaningful.

2. **`talk <npc_name>`** -- Initiate conversation with an NPC. This is how you get quests, buy things, and advance the game.

3. **`interact <entity>`** or `activate` -- Use objects in the world (wells, chests, stairs, altars).

4. **`attack <entity>`** -- Engage in combat. Qud is a roguelike; combat is the core loop.

5. **`use <item>`** or `use <ability>`** -- Apply items from inventory or activate mutations/abilities.

6. **`examine <entity/tile>`** -- Get detailed info about something. The state gives names and HP but not descriptions, equipment, or behavior.

7. **`equip <item>` / `unequip <item>`** -- Manage equipment loadout.

8. **`get <item>` / `drop <item>`** -- Interact with items on the ground.

### Important (needed for effective play)

9. **`trade <npc>`** -- Open the trade interface with a merchant.

10. **`journal`** -- Read quest log / active quests.

11. **`abilities`** or `mutations` -- List available abilities and mutations.

12. **`autoexplore`** -- Qud's built-in autoexplore (bound to numpad 0 in the game) would be enormously useful via IPC.

13. **`messages`** -- Read the recent message log (combat results, item pickups, NPC speech, status effects).

### Nice to Have

14. **`pathfind <x> <y>`** or `goto <landmark>` -- Navigate to a specific coordinate or named location.

15. **`camp`** -- Rest and recover.

16. **`map`** -- Get a machine-readable map of the current zone.

17. **`skills`** -- View character skills and progression.

---

## Key Takeaway

The IPC pipeline works. Commands go in, state comes out, the game responds. The core file-based protocol is sound and has improved since the first session (result.json now works). **The critical blocker is zone transitions** -- the character is stuck on the world map and can't enter Joppa village. The `move` command handles grid movement but doesn't trigger the zone-entry behavior that normally happens when a player character steps onto a settlement tile. Adding an `enter` command (or handling zone transitions automatically on move) would unlock the entire game.

Secondary blocker: even once inside a zone, the 3-command vocabulary (move/wait/look) isn't enough to play. You can walk around and observe, but you can't talk, fight, trade, or use items. The MUD daemon has a full verb vocabulary because MUDs are text-command-native. Qud is a keyboard-input game being adapted to text commands, and the translation layer is still thin.

The file-based IPC approach itself is elegant. Writing a command to a file and reading structured JSON state back is simpler and more reliable than parsing telnet streams. The challenge is mapping Qud's rich keyboard-driven interface onto a command vocabulary that an AI agent can use effectively.
