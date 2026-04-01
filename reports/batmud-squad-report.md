# BatMUD Three-Character Squad Report

**Date:** 2026-03-31
**Characters:** Basilides (Nomad/Human Lv4), Albedicus (Magical/Elf Lv5), Rubedicus (Evil Religious/Dwarf Lv5)
**Server:** bat.org:23 (pure telnet, NO GMCP)

## Tutorial Completion

All three characters completed the first tutorial arc successfully. The tutorial is well-structured and instanced per-character -- each gets their own path through woods, bandit fight, goblin cave, and wolf boss, even when they start in the same shared room.

### Tutorial Flow
1. **The Beginning** - Shared starting room (characters can see each other here)
2. **Loot Ring** - Pick up electrum ring, learn `get`, `i`, `eq`
3. **Wear Ring** - Learn `wear`, `wield`, `remove`
4. **Bandit Fight** - First combat, teaches `kill`, `scan`/`x`, `wimpy`, fleeing
5. **Three-Way Fork** - SW to bandits, SE to paladins, S to mountains
6. **Password Quest** - Get "echo" from either faction by giving them a map
7. **Wizard Gate** - Say the password to pass
8. **Cave Entrance** - Pull lever to open secret door, learn `search` and `crystal light`
9. **Goblin Cave** - Two goblins (teaches targeting and assist mechanics), then aggressive goblin
10. **Campsite** - Sleep to rest, `advance level` to level up
11. **Scarecrow** - Practice skills/spells: `use punch at`, `cast shocking grasp at`
12. **Wolf Boss** - Final fight, then enter Dortlewall village
13. **Dawnmist NPC** - Give ring, receive quest to find Tayrien's tower

### Character Stats After Tutorial

| Stat | Basilides (Nomad) | Albedicus (Magical) | Rubedicus (Evil Rel.) |
|------|-------------------|--------------------|-----------------------|
| Level | 4 | 5 | 5 |
| HP | 359 max | 215 max | 384 max |
| SP | 25 max | 220 max | 133 max |
| EP | 192 max | 183 max | 195 max |
| XP | 1351 | 568 | 946 |
| Kills | 5 | 5 | 5 |

## ASCII Map System

BatMUD renders an ASCII map when you enter the village (Dortlewall):
```
.-------------------.  Loc:    Dortlewall (At crossroads of heroes)  Dest: NEE
| HHHHHHHHHHHHHHHHH |  Exits:  e, s, w, n
| HHHHHHHHHHHHHHHH^ |
| HHHH####-####HHH^ |
| HHHH#  # #..####^ |
| H#####-#-#p..| #^ |
< H#......@..pp###^ >
| H#d#####.#-#-#^^^ |
| H#.#   #.# # #^^^ |
| H#.| #-#.# # #^^^ |
| H#-###...#####^^^ |
| H| |..eg.#   #^^^ |
`---------v---------'
```

Key observations:
- `@` = player position
- `#` = walls/structures
- `.` = walkable paths inside buildings
- `H` = hills/terrain (outdoor wilderness tiles)
- `^` = mountains/elevated terrain
- `p` = special markers (possibly NPCs or points of interest)
- `-` and `|` = doors
- `< >` and `v` indicate map edges you can scroll to
- The map appears to be a hybrid: outdoor wilderness tiles (H, ^) surround indoor building layouts (#, .)
- "Loc:" shows area name, "Dest:" shows direction context, "Exits:" lists available directions

This is fundamentally different from Aardwolf/Achaea:
- **Aardwolf:** Uses GMCP for map data, no inline ASCII map
- **Achaea:** GMCP room tracking, text-only room descriptions
- **BatMUD:** Inline ASCII rendered directly in the telnet stream, combining wilderness terrain and indoor maps

## Guild System Discovery

BatMUD has an extensive guild system tied to character **backgrounds**:
- Guilds have max levels (20-35 levels)
- Each guild requires a specific background
- Visible guilds from `help guilds`:

| Guild | Max Levels | Background | Maintainers |
|-------|-----------|------------|-------------|
| Alchemists | 30 | Civilized | Shinarae |
| Animists | 20 | Good Religious | Heidel |
| Archers | 30 | Nomad | Shinarae & Grizzt |
| Barbarians | 35 | Nomad | Ulath & Tarken |

(More guilds available -- output was paginated at 33%)

**Background -> Guild mapping for our characters:**
- **Basilides (Nomad):** Archers, Barbarians, possibly more
- **Albedicus (Magical):** Likely Mages, Psionicists, or similar magical guilds
- **Rubedicus (Evil Religious):** Likely Disciples of Chaos, Reavers, or similar evil guilds

## Class-Specific Skills

### Basilides (Nomad, Lv4)
Attack 29%, Axes 10%, Bludgeons 19%, Camping 5%, Hunting 5%, Long blades 6%, Punch 60%, Push 10%, Short blades 6%

### Albedicus (Magical, Lv5)
Cast generic 9%, Essence eye 9%, Mana control 19%, Punch 60%, Zapping 9%

### Rubedicus (Evil Religious, Lv5)
Attack 14%, Baptize 4%, Bless 5%, Cast generic 14%, Cast harm 6%, Ceremony 5%, Essence eye 9%, Mana control 6%, Overbear 15%, Punch 60%

## Combat System

BatMUD uses **round-based combat** with detailed hit messages:
- Rounds are numbered and clearly marked: `**** Round 5 ****`
- Hit descriptions: "hits X once making small marks", "causing a small scratch", "causing a small wound"
- Monster health shown as percentage text: "excellent shape (95%)", "near death (5%)"
- Auto-targeting: Ring grants temporary spells (shocking grasp) and skills (punch) mid-combat
- Multi-opponent: Goblins assist each other, round notation shows `Round 3 (2)` for the assist chain
- Aggressive mobs: Some attack on entry ("You've been ambushed!")
- Race-specific: Rubedicus (dwarf) got "Your small size avoids a nasty ambush" -- racial size bonus!

### Prompt Format
```
Hp:294/294 Sp:25/25 Ep:187/187 Exp:326 >
```
- Hp = Hit Points
- Sp = Spell Points (mana)
- Ep = Endurance Points
- Exp = Experience points

The `hp:` change tracker also fires: `hp: 279 (294) [-15] sp: 10 (25) [] ep: 187 (187) [] cash: 1 [] exp: 1089 []`

## Social Interactions

### Tells (Cross-Character)
All tells worked correctly:
- `tell basilides Which path are you taking?` -- delivered instantly
- Characters can see each other in shared rooms

### Newbie Channel
- `newbie Hey everyone, just started playing` -- worked, echoed as `Basilides [newbie]: ...`
- `newbie What guilds should a magical elf look into?` -- sent successfully
- No responses received from other players during the session (low pop time)

### Alignment-Based Speech
- Rubedicus (evil alignment) uses **"grumbles"** instead of "says" when using `say` -- the game modifies speech verbs based on alignment! Albedicus' score showed "irreproachably kind" while Rubedicus was neutral-to-evil.

## Daemon/Tool Issues Found

### 1. Kill Event Parsing Bug (CRITICAL) -- FIXED
Rubedicus consistently showed `"undefined slain"` in recentEvents while Basilides and Albedicus correctly parsed mob names. **Root cause found and fixed:** The `mobDied` regex pattern in `batmud.json` has two capture groups (`(.+?) is DEAD, R\.I\.P|(.+?) dies`) but `game-state.js` line 198 only checked `deathMatch[1]`. When the "dies" variant matched, group 2 had the name but group 1 was undefined. **Fix applied** in `game-state.js`: `const mobName = deathMatch[1] || deathMatch[2] || 'Unknown';`

### 2. Room Name Never Updates
`currentRoom` stays as `{"name": "unknown", "zone": "unknown", "exits": []}` throughout the entire session for all three characters. The daemon never successfully parses room names or exits from the BatMUD output. This is because BatMUD room descriptions don't follow a single consistent pattern -- they mix narrative text with room names, and the ASCII map format adds another layer of complexity.

### 3. Level Never Updates in Blackboard
Despite all characters advancing to level 4-5, `blackboard.level` stays at `1`. The `advance level` output format (`You are now level 4. Advanced your nomad background level to 4.`) isn't being parsed.

### 4. Kill Count Inconsistency
Kill count sometimes doesn't increment properly. For example, after killing both goblins and the angry goblin, Basilides showed killCount: 4, not 3. The count seems unreliable.

### 5. wait:pattern:command Timing Issues
The `wait:is DEAD:command` pattern frequently fails because:
- Combat round output can arrive in chunks
- The "is DEAD" pattern fires but the follow-up command arrives before the combat state fully resolves
- Example: "get all from corpse" returns "There is no corpse here" because the body hasn't spawned yet

### 6. "More" Pagination Not Handled
The `help guilds` output was paginated (`More (33%) [qpbns?]`) and the daemon didn't automatically continue. This truncates important output.

### 7. inCombat Always Stale
`inCombat` shows `"stale": true` throughout the session even during active combat. The combat detection from prompt parsing isn't working for BatMUD's format.

## Differences from Aardwolf/Achaea

| Feature | Aardwolf | Achaea | BatMUD |
|---------|----------|--------|--------|
| Data Protocol | GMCP (structured) | GMCP (structured) | Pure text (no GMCP) |
| Map | GMCP-sent map data | Text descriptions | ASCII art inline |
| Combat | Round-based, fast | Balance/equilibrium | Round-based, moderate |
| Leveling | `train` command | Lessons from class | `advance level` |
| Guilds | Classes at creation | Houses + classes | Background-gated guilds |
| Movement | Cardinal directions | Cardinal + custom exits | Cardinal + diagonal (ne/sw/se/nw) |
| Alignment | Not significant | Not prominent | Affects speech verbs, skills |
| Race Effects | Minimal | Minimal | Significant (dwarf ambush dodge) |
| Tutorial | Simple guided path | Extensive multi-stage | Branching narrative with choices |
| Spell Fizzle | N/A | N/A | Spell can hit yourself on fumble |
| Instancing | No | No | Tutorial is instanced per-player |
| Endurance | N/A | N/A | Third resource alongside HP/SP |

## Key Findings for Daemon Adaptation

1. **No GMCP means 100% text parsing** - Every piece of game state must be extracted from raw telnet output. The daemon's GMCP pipeline is entirely unused.

2. **ASCII map parsing is a major challenge** - The inline map uses a complex format that mixes terrain symbols, building layouts, and metadata. Parsing player position from `@` and extracting room context would require dedicated map parsing logic.

3. **Prompt parsing works well** - The `Hp:X/Y Sp:X/Y Ep:X/Y Exp:X` format is consistent and the daemon correctly extracts HP/SP/EP/XP from it.

4. **Combat parsing partially works** - Round detection and hit messages parse, but the kill detection is unreliable (the "undefined slain" bug).

5. **BatMUD's complexity exceeds Aardwolf significantly** - 7 stats (Str/Dex/Con/Int/Wis/Cha/Siz), 3 resource pools (HP/SP/EP), alignment-affected speech, racial abilities, background-gated guilds, diagonal movement, instanced content, spell fizzle mechanics.

6. **The "More" prompt** needs handling -- paginated output is common for help files and guild lists.

## Next Steps

- Fix the kill event parsing ("undefined slain" bug)
- Add room name parsing for BatMUD's format
- Add level-up detection from "You are now level X" messages
- Handle pagination ("More" prompts) automatically
- Explore Tayrien's tower quest (south, 4 east, 1 north, then east)
- Join guilds for each character
- Explore wilderness between cities (the ASCII map navigation)
- Test party formation between the three characters
