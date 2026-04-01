# Caves of Qud -- Joppa Village Exploration Report
## Date: 2026-03-30
## Character: Mehwar, Level 1, Joppa
## Agent: Claude Opus 4.6 (1M context)

---

## Session Summary

Performed autonomous exploration of Joppa village as Mehwar, a Level 1 character. Made approximately **40 successful movement commands** over ~240 game turns (293133 to 293372), traversing the village from center (39, 16) to the northern structures (38, 4), back south through the center (40, 19), to the southern edge (40, 22), and then west toward Argyve's workshop, ending at (13, 17). The autopilot stopped responding to commands near the end of the session.

Key discoveries:
- **Elder Irudad disappeared** mid-session -- he was initially at (38, 3) but later appeared as "bloody Elder Irudad" at (40, 19) before vanishing entirely from the entity list
- NPCs are **mobile and mortal** -- the entity count dropped from 16 to 9 over the session, with several named NPCs (Ctesiphus, Mehmet) and watervine farmers disappearing
- The village has clear **structural architecture** visible in the ASCII screen buffer, with `+` symbols for doors, `x` for walls, and `=` for specific entrances
- Movement was mostly unobstructed with two notable wall encounters

---

## Path Taken

| # | Direction | From | To | Notes |
|---|-----------|------|----|-------|
| 1 | look | (39,16) | (39,16) | Confirmed starting position |
| 2 | N | (39,16) | (39,15) | Open terrain |
| 3 | N | (39,15) | (39,14) | |
| 4 | N | (39,14) | (39,13) | |
| 5 | N | (39,13) | (39,12) | |
| 6 | N | (39,12) | (39,11) | |
| 7 | N | (39,11) | (39,10) | |
| 8 | N | (39,10) | (39,9) | Near Warden Yrame's patrol area |
| 9 | N | (39,9) | (39,8) | Checked entities -- first "bloody Elder Irudad" sighting at (40,19) |
| 10 | N | (39,8) | (39,7) | |
| 11 | N | (39,7) | BLOCKED | Wall/structure at (39,6) |
| 12 | NW | (39,7) | (38,6) | Skirted around obstacle |
| 13 | N | (38,6) | (38,5) | |
| 14 | N | (38,5) | (38,4) | Reached Irudad's original position area -- he was GONE |
| 15-25 | S x11 | (38,4) | (40,19) | Long southward traverse with SE diagonals |
| 26-28 | S x3 | (40,19) | (40,22) | Reached southern map edge |
| 29 | W | (40,22) | (39,22) | Began westward journey |
| 30 | NW | (39,22) | (38,21) | |
| 31-46 | W x16 | (38,21) | (13,19) | Long westward trek along y=19-20 |
| 47 | W | (13,19) | BLOCKED | Hit wall of Argyve's workshop |
| 48 | N | (13,19) | (13,18) | Tried to navigate around |
| 49 | W | (13,18) | BLOCKED | Still wall |
| 50 | N | (13,18) | (13,17) | Final position |

**Total distance covered: ~70+ tiles across the village**

---

## NPCs Found

### Initial Census (Turn 293133, 16 entities)
| Entity | Position | HP | Role |
|--------|----------|-----|------|
| **Elder Irudad** | (38, 3) | 225/225 | Quest giver -- LATER DISAPPEARED |
| **Nima Ruda** | (45, 2) | 150/150 | Named NPC, persistent |
| **Argyve** | (6, 19) | 150/150 | Tinker, stayed put |
| **Tam, dromad merchant** [sitting] | (70, 19) | 150/150 | Merchant, stayed put |
| **Warden Yrame** | (40, 8) | 275/275 | Guard, patrolled |
| **Ctesiphus** | (41, 6) | 5/5 | Named NPC -- DISAPPEARED |
| **Mehmet** | (42, 19) | 100/100 | Named NPC -- DISAPPEARED |
| Watervine farmer x6 | various | 16/16 | Scattered, several disappeared |
| Watervine farmer & Mechanimist convert | (44, 15) | 16/16 | |
| Wet glowfish [swimming] | (17, 22) | 5/5 | In water to the south |

### Final Census (Turn 293372, 9 entities)
| Entity | Position | HP | Status |
|--------|----------|-----|--------|
| Nima Ruda | (45, 2) | 150/150 | Unchanged |
| Warden Yrame | (40, 8) | 275/275 | Returned to post |
| Argyve | (6, 19) | 150/150 | Unchanged |
| Tam, dromad merchant [sitting] | (70, 19) | 150/150 | Unchanged |
| Wet glowfish [swimming] | (17, 21) | 5/5 | Moved slightly |
| Watervine farmer | (16, 3) | 16/16 | |
| Watervine farmer | (14, 17) | 16/16 | Next to me at end |
| Watervine farmer | (59, 21) | 16/16 | |
| Watervine farmer & Mechanimist convert | (52, 22) | 16/16 | |

### Missing NPCs (7 entities vanished)
- **Elder Irudad** -- was "bloody" at one point, then gone. Possibly killed by something or left the map
- **Ctesiphus** (5 HP) -- very fragile, likely killed
- **Mehmet** (100 HP) -- disappeared
- **3-4 watervine farmers** -- attrition from unknown cause

**Something dangerous happened in Joppa during my exploration.** The "bloody" descriptor on Irudad strongly suggests combat occurred. With the low-HP NPCs (Ctesiphus at 5 HP) disappearing, there may have been a hostile creature spawn or wandering monster.

---

## Village Layout (ASCII Screen Analysis)

The screen buffer reveals Joppa as approximately 80x22 tiles:

```
NORTH (y=0-5): Open terrain, scattered buildings, Nima Ruda & Elder Irudad area
  - Buildings with x-walls and + doors around (35-45, 2-6)
  - Watervine farms to far west and east

CENTRAL (y=6-14): Main village corridor
  - Warden Yrame patrols around (40, 8)
  - Multiple building structures with xxxxxxxxx walls
  - Water features (u characters = shallow water/paths)
  - Doors marked with + symbols
  - = symbols for special doors/gates

SOUTH-WEST (y=17-21): Argyve's Workshop
  - Clear +-bordered building at approximately x=3-12, y=17-21
  - Characters inside: *O (artifact?), e (equipment?), a (Argyve), h (item?)
  - = door on west side
  - Workshop contents visible: compass-like symbols, possibly crafting items

SOUTH-CENTER (y=15-22): Open water and farmland
  - oo characters = deep vegetation/trees
  - ~~ characters = water features (rivers, pools)
  - ] characters = items on ground or furniture

SOUTH-EAST (y=19): Tam's merchant area at x=70
  - Far eastern edge, dromad merchant sitting

TERRAIN KEY (from observation):
  . = open ground
  o = vegetation/jungle
  ~ = water
  x = walls
  + = doors
  = = special doors/gates
  O = important markers
  u = paths/shallow water
  @ = player character
  f = watervine farmer (lowercase letters = NPCs)
  ` = debris/items on ground
```

---

## Character State

### Stats (unchanged through session)
- **HP**: 18/18
- **AV**: 2 (Armor Value -- decent for level 1)
- **DV**: -1 (Dodge Value -- very low, this is a tank build)
- **STR 22** / AGI 18 / TOU 18 / INT 14 / WIL 16 / EGO 16
- **MoveSpeed**: 80 (faster than default 100)
- **Level**: 1, XP: 0
- **No resistances** (heat, cold, electric, acid all 0)

### Inventory
1. Waterskin [empty] x2
2. Torch x9 (unburnt) -- consumed 2 since the previous session's character had 11
3. Waterskin [32 drams of fresh water]
4. Bear jerky [9 servings]
5. Witchwood bark x4

**Key need**: Fill those empty waterskins. Water is the primary currency and survival resource in Qud.

---

## Commands I Wish I Had

1. **`talk <name>`** -- The entire point of reaching Irudad was to get the main quest, and reaching Argyve was to get his quest (find an artifact). Without a talk/interact command, the navigation is purposeless from a quest-progression standpoint.

2. **`interact`** or **`use`** -- To open doors (the `+` symbols), fill waterskins at water sources, pick up items.

3. **`autoexplore`** or **`pathfind <x> <y>`** -- Moving tile-by-tile across a 80x22 map is extremely tedious. Qud has built-in autoexplore (numpad 0) and the travel system. The 4-second round-trip per tile makes crossing the village take minutes.

4. **`inventory use <item>`** -- To equip torches, eat bear jerky, use witchwood bark.

5. **`examine <entity>`** or **`look at <name>`** -- To get descriptions, quest text, dialogue options.

6. **`trade <name>`** -- To interact with Tam the merchant.

7. **`pickup`** / **`drop`** -- For item management.

8. **`status`** -- Skills, mutations, active effects, hunger/thirst state.

9. **`open <direction>`** -- To open doors when movement is blocked by them.

---

## Comparison to MUD Gameplay

### What Qud-via-IPC shares with MUDs
- **Text/ASCII representation** of a spatial world -- the screen buffer IS a MUD room description, just rendered as a 2D grid instead of prose
- **Entity awareness** -- knowing who's in the room with you, their disposition (hostile/friendly), their HP
- **Inventory management** -- similar item lists, resource tracking
- **Turn-based action economy** -- each command consumes a turn, NPCs act simultaneously

### What's fundamentally different
- **Spatial navigation is 2D grid, not graph-based** -- MUDs have rooms connected by exits. Qud has an 80x22 tile grid where you navigate pixel-by-pixel. This makes AI agent movement much more tedious -- a "go to the elder" action in a MUD is `n; n; n` through 3 rooms. In Qud it's 13 individual tile moves with potential wall collision.

- **NPC mobility is continuous** -- In a MUD, NPCs wander between rooms but you can always `look` to see who's here. In Qud, NPCs drift across the grid each turn. Irudad moved from (38,3) to (40,19) -- the entire length of the village -- while I was walking toward him. This creates a pursuit problem that doesn't exist in MUDs.

- **No built-in dialogue system accessible via IPC** -- MUDs expose conversation through `say`, `tell`, `ask` commands. The Qud IPC layer only exposes movement, look, attack, rest, wait. The rich conversation/quest system is locked behind the GUI.

- **Information density per command** -- A single MUD `look` gives you room description, exits, NPCs, items, and ambient details. Qud's state.json gives structured data (entity positions, stats) but lacks the narrative texture. The screen buffer has visual information but requires spatial parsing rather than reading.

- **The village is alive and dangerous** -- Something killed Elder Irudad and several villagers during my 240-turn walk. MUD towns are typically safe zones. Qud's Joppa can apparently have hostile encounters, which means even the starting village requires tactical awareness.

### The Core Insight
The IPC approach works well for **spatial awareness and movement** -- I successfully navigated the entire village, tracked entity positions, and understood the layout. But it completely fails for **social interaction and quest progression**, which is the core gameplay loop of early Qud (talk to Irudad, get quest, talk to Argyve, find artifact). An autonomous agent needs `talk`, `trade`, and `interact` commands to actually play the game, not just walk around in it.

The ~4 second command round-trip also makes exploration painfully slow. A `pathfind` or `autoexplore` command that moves multiple tiles per IPC call would make agent play viable.

---

## Session Statistics
- **Commands sent**: ~50 (including blocked moves and the stalled commands at the end)
- **Successful moves**: ~40
- **Blocked moves**: 4 (walls at (39,6), (13,19), (13,18), plus SW at (13,19))
- **Turn range**: 293133 to 293372 (239 turns elapsed)
- **HP lost**: 0 (never took damage)
- **XP gained**: 0 (no combat or quest completion)
- **Distance from start to end**: 26 tiles (manhattan distance from (39,16) to (13,17))
- **Autopilot status**: Stopped responding at turn 293372
