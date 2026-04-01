# Discworld MUD - Olympiodorus First Session Report
**Character:** Olympiodorus, Level 0 Human (Adventurers' Guild)
**Date:** 2026-03-30
**Server:** discworld.starturtle.net:4242
**Session Duration:** ~10 minutes active (frequent disconnections)

## Key Finding: Discworld DOES Have GMCP

The task briefing stated "NO GMCP -- pure text." This is **wrong**. Discworld sends two GMCP packages:

1. **`room.info`** -- Room identifier (SHA1 hash), name, visibility, and kind (e.g. "outside")
2. **`char.vitals`** -- alignment, maxhp, hp, xp, maxgp, burden, gp

The daemon successfully negotiates GMCP on every connection:
```
[GMCP] Server supports GMCP -- registering packages
[GMCP] room.info: {"identifier":"9491cc4ebb0c8eedd077385dd6ed4b010158ab45","name":"north end of Cheapside","visibility":1,"kind":"outside"}
[GMCP] char.vitals: {"alignment":"neutral","maxhp":500,"hp":500,"xp":1660,"maxgp":50,"burden":2,"gp":50}
```

However, the server config at `/Users/jordanpatz/mud-daemon-gamestate/mud-daemon/servers/discworld.json` has `"hasGMCP": false` which is incorrect and should be updated.

### What GMCP Provides on Discworld
| GMCP Package | Fields | Notes |
|---|---|---|
| `char.vitals` | alignment, maxhp, hp, xp, maxgp, burden, gp | Updates every ~2s during combat, on every action otherwise |
| `room.info` | identifier, name, visibility, kind | Sent on room entry and `look` |

### What GMCP Does NOT Provide (vs. Aardwolf/Achaea)
- **No `room.info.exits`** -- exits must be parsed from text ("There are three obvious exits: north, south and west.")
- **No `char.status`** -- no level, class, guild, state (idle/combat/sleep) via GMCP
- **No `comm.channel`** -- channel messages must be parsed from text
- **No `group.members`** -- no party/group support via GMCP
- **No `char.maxstats`** -- maxhp/maxgp come through char.vitals instead
- **No item/inventory data** -- must parse from text

## The ASCII Map System

Discworld embeds a real-time ASCII map directly in every room description. The map is displayed to the left of the room text:

```
     *
     |      This is the end of Cheapside...
    -*-
     |
    -@
     |
     $-
  \ /
   $
  /|
```

### Map Legend (from `map` command)
| Symbol | Meaning |
|---|---|
| `@` | Your current position |
| `*` | Empty room |
| `$` | Room with living things (NPCs/players) |
| `&` | Room with living things AND non-cardinal exits |
| `-` | East-west connection |
| `\|` | North-south connection |
| `/` | Northeast-southwest connection |
| `\` | Northwest-southeast connection |

### Map Implications for the Daemon
The ASCII map is the **primary navigation tool** on Discworld. It shows:
- Nearby room topology at a glance
- Where NPCs are (`$` vs `*`)
- Non-cardinal routes (`/`, `\`)
- The player's exact position (`@`)

Without GMCP exits, the daemon must:
1. Parse exits from the text line "There are N obvious exits: ..."
2. Optionally parse the ASCII map for additional spatial awareness
3. Handle non-cardinal directions: northeast, northwest, southeast, southwest

**Current daemon gap:** The blackboard shows `"exits": []` for every room because exit parsing from text isn't implemented for the Discworld format.

## Score / Stat System -- Radically Different from Diku MUDs

Discworld is LP-based, not Diku. The `score` output reveals a completely different stat model:

```
You have 500 (500) hit points, 50 (50) guild points, 0 (776) quest points,
0 (1527) achievement points and 50 (50) social points.
Your current experience is 1666 and you are level 0 in the Adventurers' Guild;
your overall rating is 0.
You have died 0 times and can die 7 times before you are completely dead.
Your wimpy is set to 20%.
You are unburdened (2%) and quite comfortable.
You are neutral, worshipping no god.
```

### Stat Differences from Standard MUDs
| Discworld | Typical Diku MUD | Notes |
|---|---|---|
| Hit Points (HP) | HP | Same concept, 500 starting |
| Guild Points (GP) | Mana/MP | Used for guild abilities; mapped to `mana` in daemon |
| Quest Points | -- | 0/776 possible; persistent achievement |
| Achievement Points | -- | 0/1527 possible; separate tracking |
| Social Points | -- | 50 (50); Discworld tracks social interaction as a resource |
| Experience (XP) | XP | Continuous accumulation, not level-based thresholds |
| "Can die 7 times" | -- | Permadeath after N deaths; no respawn-at-temple |
| Wimpy (20%) | Wimpy | Auto-flee threshold |
| Burden (2%) | Encumbrance | Weight/carry capacity |
| Alignment (neutral) | Alignment | Deity-worship system |
| Overall Rating | Level | Level 0 in Adventurers' Guild; rating is composite |

### Skills System
Skills are organized as top-level categories, not individual abilities:
```
covert..............    0    0
fighting............    0    0
crafts..............    0    -
magic...............    0    0
faith...............    0    0
```
All skills start at 0/0 (level/bonus) when in the Adventurers' Guild. These presumably expand into sub-skills upon joining a real guild.

## Guild System

From the in-game brochure (humorously misspelled in Pratchett fashion):

| Guild | Location | Notes |
|---|---|---|
| Wizards (Unseen University) | Sator Square | Magic users |
| Thieves | 2 Alchemists Street | "Stamping owt unothorized Cryme" |
| Warriors (Weapons Master) | Number 4, Vagabond Street | "The type of person that goes Ugh" |
| Palace Guard | Palace Gates | Protect the Patrician |
| Priests | (continued on next page) | Religious orders |
| Assassins | (inferred from world) | Seen as "student assassin stumbling on rooftops" |
| Witches | (Lancre/Ramtops) | Not in Ankh-Morpork proper |

The character starts in the **Adventurers' Guild** at level 0. Must physically travel to a guild building and apply to join. No auto-assignment, no tutorial pushing you toward one.

## Combat System

### Initiating Combat
- `kill <target>` initiates combat
- `consider <target>` evaluates difficulty ("The rat would be an easy target.")
- Combat rounds happen automatically every ~2 seconds

### Combat Observations
- Unarmed combat is EXTREMELY slow -- punching a rat for 30+ rounds with almost no damage
- The combat prompt appears after each round: `Hp: 500 (500) Gp: 50 (50) Xp: 1912`
- XP ticks up by 3 per round even against a trivial mob
- The daemon's combat pattern matching (`mobHitYou`, `youHitMob`) partially works but did NOT trigger `inCombat: true` on the blackboard
- The `run away` flee command is configured but untested

### Combat Text Patterns Observed
```
You prepare to attack the rat.
The rat attempts to bite you but you just dodge out of the way.
The rat rakes at you with its claws.
You punch at the rat.
You punch at the rat but it just dodges out of the way.
You kick out at the rat but it dodges out of the way.
The rat squeals in pain.
```

### Daemon Combat Detection Gap
The daemon config has combat patterns but the blackboard `inCombat` never switched to `true` despite active combat. The patterns need tuning:
- Current `mobHitYou`: `(.+?) (?:hits|attacks|scratches|claws|bites) you`
- Actual text: "The rat attempts to bite you" -- "attempts to bite" doesn't match
- Current `youHitMob`: `You (?:hit|attack|scratch|claw|bite)`
- Actual text: "You punch at the rat" -- "punch" is not in the pattern

**Fix needed:** Add "punch|kick|attempts to" and other Discworld combat verbs to the regex patterns.

## NPCs and World Flavor

Discworld NPCs are richly Pratchett-flavored:

- **Rotting white zombie** -- "One of Ankh-Morpork's burgeoning undead population... falling to pieces. Despite some haphazard stitching it won't be long before she loses a limb."
- **Jovial priest** -- Periodically sighs (ambient NPC action)
- **Smart crow** -- "pecks at the ground"
- **Happy child** -- Standing around the streets
- **Street lamps** -- "emitting a grimy light"
- **Student assassin** -- "stumble precariously along the rooftops" (ambient event)
- **Warrior womble** -- "happily out from the smithy with his sword now fixed"

NPC interaction via `talk to <npc>` returned "What?" -- Discworld likely uses `say` in the room or specific interaction verbs.

## Weather and Time

Discworld has a rich environmental system:
- "It is night and the waxing gibbous moon is hidden by the clouds."
- "It is a cold secundus spring's night with almost no wind and medium cloud cover."
- Temperature changes over time ("cold" -> "very cold")
- Season system: "secundus spring" (Disc-specific calendar)
- Moon phases tracked

## Navigation and Streets Explored

Rooms visited during the session:
1. **North end of Cheapside** (starting room) -- ID `9491cc4e...`
2. **Junction of Cheapside with Filigree Street** -- ID `b0dd0c3c...`
3. **West end of Filigree Street** -- ID `dc9afb55...`
4. **Filigree Street, outside a smithy** -- ID `1806463588...`
5. **Junction of Cheapside, Welcome Soap, Heroes Street and Blood Alley** -- ID `24376b1d...`

Each room has a unique SHA1 identifier via GMCP, which could be used for mapping even without exit data.

## Inventory System

Starting inventory:
```
Wearing : a colourful sash
Carrying: an open colourful brochure, a voucher, a lightable torch and an ice bucket
Purse: 9 Ankh-Morpork dollars
```

Currency is "Ankh-Morpork dollars (AM$)" -- not gold/silver.

## Connection Stability Issues

**Critical problem:** The connection dropped 4 times in ~10 minutes of play:
1. Drop during `help` menu interaction (interactive prompt confusion)
2. Drop during combat (after ~30s of combat)
3. Drop during continued combat
4. Drop during combat again

The daemon successfully auto-reconnects each time, and the game preserves state across reconnections. However:
- Pending IPC commands are lost on disconnect
- The daemon doesn't detect it was mid-combat on reconnect
- The keepalive interval is 10 minutes (`600000ms`) which may be too long
- The `debounceMs: 1500` might be contributing -- Discworld sends frequent combat updates (every 2s) that could conflict

## What the Daemon CAN Track (via GMCP + text)
- Room name and unique identifier (GMCP room.info)
- HP, GP (guild points), XP, burden (GMCP char.vitals)
- Alignment (GMCP char.vitals)
- Room descriptions and nearby topology (ASCII map in text)
- NPCs present (text parsing: "A rat is standing here")
- Player arrivals/departures ("Whizbang arrives from the south")
- Combat round output (text patterns)
- Weather/time state (text)

## What the Daemon CANNOT Track Without More Work
- **Exits** -- not in GMCP; need text parsing of "There are N obvious exits: ..."
- **Combat state** -- GMCP doesn't flag combat; text patterns need updating
- **Inventory** -- no GMCP; must parse `inventory` text output
- **Skills/abilities** -- no GMCP; must parse `skills` text output
- **Guild membership** -- no GMCP; must parse `score` output
- **Channel messages** -- no GMCP comm; must regex-match tell/say/newbie/talker patterns
- **Quest/achievement progress** -- no GMCP; must parse `score`
- **Other players in room** -- no GMCP; must parse room description text
- **Equipment details** -- no GMCP; must parse `inventory` or equipment text
- **Map topology** -- the ASCII map is rich but requires non-trivial visual parsing

## Recommendations

1. **Fix `hasGMCP: false`** in `servers/discworld.json` -- it's working fine
2. **Add exit parsing** -- regex for "There (?:is|are) (\w+) obvious exits?: (.+)\."
3. **Update combat patterns** -- add Discworld verbs (punch, kick, attempt, rake, etc.)
4. **Add Discworld-specific vitals mapping** -- the daemon maps GP to "mana" which works but could be more explicit
5. **Parse the combat prompt** -- `Hp: (\d+) \((\d+)\) Gp: (\d+) \((\d+)\) Xp: (\d+)` provides real-time stats without GMCP
6. **Reduce debounce** -- 1500ms may be too aggressive for a game that sends 2-second combat ticks
7. **Add reflex rules** -- Create `reflexes/discworld-warrior.json` for basic combat and survival
8. **Investigate disconnect pattern** -- May need to handle Discworld's pager/interactive prompts ("Read From X to Y of Z - return to continue") to avoid protocol-level issues
9. **Implement Discworld-specific prompt parsing** -- The combat prompt `Hp: X (Y) Gp: X (Y) Xp: Z` should be detected and used as a secondary vitals source

## Comparison: Discworld vs. Other Tested MUDs

| Feature | Aardwolf | Achaea | Discworld |
|---|---|---|---|
| GMCP | Full (vitals, room, exits, channels, group) | Full (Char, Room, Comm, IRE-specific) | Partial (vitals + room name only) |
| Room exits | GMCP | GMCP | Text parsing required |
| Combat detection | GMCP char.status state=8 | GMCP | Text pattern matching only |
| Map system | None (text-based) | Auto-walk/WALK TO | Embedded ASCII map in every room |
| Progression | Level-based XP thresholds | Level + lessons + tasks | Skill-based + guild levels |
| Currency | Gold | Gold sovereigns | Ankh-Morpork dollars |
| Death penalty | Respawn at temple | Respawn with XP loss | Limited lives (7), then permadeath |
| Tutorial | Academy auto-path | Guided escape sequence | Brochure + exploration |
| NPC flavor | Minimal | Moderate | Rich Pratchett-style prose |
| Weather | Basic | Moderate | Detailed (moon phase, wind, temperature, Disc seasons) |
