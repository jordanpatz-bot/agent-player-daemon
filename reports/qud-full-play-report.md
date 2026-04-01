# Caves of Qud -- Full Play Session Report
## Date: 2026-03-31
## Characters: Numooshroraq -> Tigayumut, Level 1, Joppa
## Agent: Claude Opus 4.6 (1M context)
## Session Duration: ~20 minutes of active command time, ~15 minutes of game freezes

---

## Session Summary

Attempted full gameplay loop in Joppa: navigate to NPCs, talk, get quests, check character, explore. Started at (37, 22) as Numooshroraq, navigated north to Elder Irudad at (38, 3), attempted conversation, explored multiple game systems, accidentally exited to outskirts zone, returned to Joppa. Game froze twice during session due to the mod's ProcessCommands hook stopping. Character name changed from Numooshroraq to Tigayumut mid-session (cause unknown -- possibly game restart/reload during a freeze).

**Key Finding:** The IPC layer is good at movement and state tracking but fundamentally cannot handle Caves of Qud's modal UI systems (conversations, menus, character sheets). All UI commands (talk, character, inventory, skills, etc.) open in-game popups that the IPC cannot read or navigate.

---

## What Worked

### Movement System
- `move n/s/e/w/ne/nw/se/sw` -- all cardinal and diagonal directions work
- Blocked movement returns `{"status": "blocked", "message": "Cannot move X"}`
- Successful movement returns new position coordinates
- Zone transitions detected: walked from Joppa (zone .1.1.10) to outskirts (zone .2.1.10) via edge crossing
- **Pathfinding is manual** -- must check entity positions and navigate around walls tile-by-tile

### State Tracking (state.json)
- Reliably provides: position (x,y), HP, all 6 stats, level, XP, AV/DV, energy, speed
- Full entity list with names, positions, hostile flag, and HP
- Inventory list (item names with quantities/states)
- Zone name and zone ID
- Exit directions (which cardinal directions have exits)
- Turn counter

### Wait/Rest
- `wait` command works, advances the turn counter
- `wait20`, `wait100`, `rest`, `restmorning` available but untested

### Autoexplore
- `autoexplore` command fires but runs as a background behavior across multiple ticks
- Caused unpredictable position jumps -- character continued autoexploring between manual commands
- **Dangerous**: no way to reliably cancel autoexplore once started

---

## What Does NOT Work (Critical Limitations)

### Conversation System -- BROKEN
- `talk` command fires `CmdTalk` and returns `status: ok`
- The conversation dialog opens IN-GAME as a modal overlay
- **screen.txt does NOT capture UI overlays** -- only shows the tile/map layer
- **result.json does NOT include conversation text or dialog options**
- No way to select dialog choices, read NPC speech, or accept quests
- Tested with both Elder Irudad and Warden Yrame -- same result both times
- **This means no quests can be obtained, no trade can happen, no story can progress**

### Character Info Menus -- NO DATA RETURNED
All of these commands open in-game UI panels but return only `{"status": "ok"}`:
- `character` -- opens character sheet (stats already in state.json)
- `inventory` -- opens inventory screen (list already in state.json)
- `equipment` -- opens equipment screen (NOT in state.json -- equipment data is missing)
- `skills` -- opens skills panel (NOT in state.json)
- `abilities` -- opens abilities panel (NOT in state.json)
- `quests` -- opens quest journal (NOT in state.json)
- `journal` -- opens full journal (NOT in state.json)
- `factions` -- opens factions/reputation (NOT in state.json)
- `messages` -- opens message history (NOT in state.json)

### Screen Capture
- `screen.txt` shows ASCII representation of the MAP LAYER only
- Cannot capture: conversation dialogs, inventory screens, character sheets, skill trees, quest logs
- Characters appear garbled (encoded rendering artifacts like `ô`, `ú`, `×`, `Ø`)

---

## Game Freeze Issues

### Freeze #1 (03:38 - 03:41, ~3 minutes)
- Trigger: Zone transition from Joppa to outskirts and back (move w -> move e rapidly)
- Symptom: ProcessCommands hook stopped being called; tick.txt stopped updating
- Resolution: Game spontaneously resumed after ~3 minutes (possibly window refocus)
- Turn jump: 90515 -> 104732 (~14,000 turns elapsed, likely NPC turns during freeze)

### Freeze #2 (03:46 onwards, did not recover)
- Trigger: Unknown -- occurred after `move n` command while in Joppa
- Symptom: Same as Freeze #1 -- ProcessCommands hook stopped
- Resolution: Did not recover during remaining session time
- Possible cause: The autoexplore behavior might be conflicting with manual commands

### Root Cause Analysis
The autopilot sends semicolons via osascript to trigger game ticks. When the game is in a modal UI state (menu, popup) or not frontmost, the keypresses either:
1. Hit the wrong UI element
2. Don't reach the game at all
3. The mod's hook only fires on player turns, and UI overlays prevent turns from processing

---

## Entities Encountered

### Named NPCs (persistent positions)
| NPC | Position | HP | Notes |
|-----|----------|-----|-------|
| Elder Irudad | (38, 3) | 225/225 | Main quest giver. Reached adjacency. Talk fired but no dialog captured. |
| Nima Ruda | (45, 2) | 150/150 | Northern area, never approached |
| Warden Yrame | (40, 8-9) | 275/275 | Village guard. Got adjacent, attempted talk. |
| Ctesiphus | (41, 6) -> (32, 8) | 5/5 | Mobile NPC, very low HP, likely a cat |
| Argyve | (6, 19) | 150/150 | Tinker/quest giver. Never reached (too far west) |
| Mehmet | (42, 19) | 100/100 | NPC near village center |
| Tam, dromad merchant | (70, 19) | 150/150 | Merchant, never reached (far east) |

### Generic NPCs
- 6-8 watervine farmers scattered across map, some mobile
- 1 watervine farmer and Mechanimist convert
- 1 wet glowfish (swimming) -- ambient wildlife

### Outskirts Zone Entities
When I accidentally entered "outskirts, Joppa":
- 2 giant dragonflies (non-hostile)
- 2 wet glowfish (swimming)
- 2 watervine farmers

---

## Character State

### Stats (from state.json)
| Stat | Value |
|------|-------|
| Strength | 22 |
| Agility | 18 |
| Toughness | 18 |
| Intelligence | 14 |
| Willpower | 16 |
| Ego | 16 |
| HP | 18/18 |
| AV (Armor) | 2 |
| DV (Dodge) | -1 |
| Level | 1 |
| XP | 0 |
| Speed | 100 |
| MoveSpeed | 80 |

### Inventory (unchanged throughout session)
- waterskin [empty] x2
- torch x14 (unburnt) -- increased from x11 to x14 mid-session (unknown cause)
- waterskin [32 drams of fresh water]
- bear jerky [8 servings]
- witchwood bark x3

### Missing Data (not in state.json)
- Equipment worn (what's equipped vs just in inventory)
- Skills and powers
- Activated abilities
- Mutations (if any)
- Quest log
- Faction standings
- Message/combat log

---

## Movement Path

### Phase 1: Start to Irudad (successful)
```
(37,22) -> N x12 -> (37,10) -> N x3 -> (37,7) BLOCKED
(37,7) -> NE -> (38,6) -> N x2 -> (38,4) [adjacent to Irudad at (38,3)]
```

### Phase 2: Talk attempt + info commands (at 38,4)
- talk -> ok (no dialog captured)
- messages, look, quests, inventory, equipment, skills, abilities, factions, journal -> all "ok" with no data
- autoexplore -> ok (started background exploration)
- get -> ok (nothing to pick up)
- interact -> ok (CmdGetFrom, nothing nearby)
- open -> ok (nothing to open)
- wait -> ok (turn advanced)

### Phase 3: Navigation toward Argyve (erratic due to autoexplore)
```
(38,4) -> SW -> (37,5) -> BLOCKED SW,W,S
-> SE -> (38,6) -> S x2 -> (38,8) -> SW -> (38,10) -- jump!
-> W x2 -> (36,10) -> SW x2 -> (34,12) -> BLOCKED SW
-> ... position jumps due to autoexplore running in background
```

### Phase 4: Accidental zone exit
- Walked off Joppa's west edge into "outskirts, Joppa" (zone .2.1.10)
- Entities changed to wilderness creatures (giant dragonflies)
- Moved east to re-enter Joppa

### Phase 5: Back in Joppa + freeze
- Returned to Joppa, position settled around (40, 7-8)
- Approached Warden Yrame, attempted talk
- Navigated further, position jumping due to autoexplore
- Game froze at (28, 14), did not recover

---

## Commands Tested

| Command | Result | Useful? |
|---------|--------|---------|
| `move <dir>` | Works reliably | YES -- primary navigation |
| `talk` | Fires but no dialog data | NO -- modal UI not captured |
| `look` | Returns zone name only | MINIMAL |
| `wait` | Advances turn | YES |
| `autoexplore` | Runs in background, causes chaos | DANGEROUS |
| `get` | Fires, no pickup reported | UNCLEAR -- may work with items present |
| `interact` | Maps to CmdGetFrom | UNCLEAR |
| `open` | Fires | UNCLEAR -- no doors tested |
| `character` | Opens UI, no data | NO (data in state.json) |
| `inventory` | Opens UI, no data | NO (data in state.json) |
| `equipment` | Opens UI, no data | NO (data NOT in state.json) |
| `skills` | Opens UI, no data | NO |
| `abilities` | Opens UI, no data | NO |
| `quests` | Opens UI, no data | NO |
| `journal` | Opens UI, no data | NO |
| `factions` | Opens UI, no data | NO |
| `messages` | Opens UI, no data | NO |
| `save` | Not tested | -- |
| `attack <dir>` | Not tested (no hostiles) | -- |
| `autoattack` | Not tested | -- |
| `fire` | Not tested | -- |
| `rest` | Not tested | -- |

---

## Recommendations for IPC Mod Improvement

### Critical: Capture Conversation Data
The biggest gap is the conversation system. The mod needs to:
1. Hook into the conversation/dialog system to extract NPC speech text
2. Expose dialog options as numbered choices in result.json
3. Accept a "choose <number>" command to select dialog options
4. Return quest acceptance/completion events

### Critical: Extract UI Screen Data
The mod should serialize UI panel contents into result.json or a separate file:
- Equipment: what's in each body slot
- Skills: learned skills with levels
- Abilities: activated abilities with cooldowns
- Quests: active and completed quest names/descriptions
- Journal: key entries
- Factions: reputation levels

### Important: Cancel Autoexplore
Need a way to cancel autoexplore/autoactions. Currently once started, autoexplore runs in background and interferes with manual commands.

### Important: Result Synchronization
result.json sometimes shows stale data from previous commands. Need atomic write with command ID matching to ensure the result corresponds to the sent command.

### Nice to Have: Message Log
Capture the game's message buffer (combat messages, interaction results) in state.json or a separate file. This would provide feedback for many actions.

---

## Conclusions

### What an AI CAN Do via File IPC in Caves of Qud
- Navigate the map tile-by-tile with wall detection
- Track character stats, HP, position in real-time
- Map entity positions and identify NPCs vs hostiles
- Maintain inventory awareness
- Wait/rest to pass time
- Detect zone transitions

### What an AI CANNOT Do (yet)
- Have conversations with NPCs (no dialog capture/selection)
- Accept or complete quests
- Trade with merchants
- Read character skills, abilities, or equipment details
- Read quest log or journal
- Fight intelligently (no combat feedback captured)
- Use items or abilities (no feedback on usage)

### Bottom Line
The current IPC layer enables **spatial navigation and state awareness** but NOT **meaningful gameplay interaction**. The game's heavy reliance on modal UI popups (for conversations, menus, character management) creates a hard wall that the current screen.txt + result.json approach cannot cross. The fix requires the Qud mod to hook into UI systems directly and serialize their contents.

The experience is equivalent to controlling a character who can walk around a city, see who's there, and know their own stats, but cannot speak, shop, fight effectively, or read signs. Navigation itself works well -- the ~30 successful movement commands demonstrate reliable pathfinding through Joppa's layout including wall detection and zone transitions.
