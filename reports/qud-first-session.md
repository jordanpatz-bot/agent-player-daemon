# Caves of Qud -- First Session Report (File-Based IPC)
## Date: 2026-03-30
## Character: Uuruuyuraq, Level 1, Joppa

---

## Session Summary

Read and analyzed the Caves of Qud game state snapshot via file-based IPC. The game was not actively processing commands during this session (turn counter stayed at 83133, position did not change after sending `move n` and `look`), so this was a **read-only reconnaissance** of a frozen game state. Still extremely informative for evaluating the IPC approach.

---

## What I See in the State

### Character (state.json)
- **Name**: Uuruuyuraq (classic Qud mutant name)
- **Level 1**, 0 XP, HP 18/18
- **AV 2 / DV -1** -- heavy armor, slow. This is a strength-build character (STR 22 is very high for level 1, AGI 18 decent)
- **MoveSpeed 80** (faster than base 100 -- lower is faster in Qud)
- **Full stat block**: STR 22, AGI 18, TOU 18, INT 14, WIL 16, EGO 16
- **No resistances** -- heat, cold, electric, acid all at 0
- **Position**: (36, 18) in zone `JoppaWorld.11.22.1.1.10`
- **All 8 exits available** -- Joppa connects to the overworld in all compass directions

### Inventory
6 items, classic Qud starting kit:
1. waterskin [empty]
2. waterskin [empty]
3. torch x11 (unburnt)
4. waterskin [32 drams of fresh water]
5. bear jerky [8 servings]
6. witchwood bark x3

Two empty waterskins and one with 32 drams -- should fill those at the well or from watervine farmers. Witchwood bark is the emergency heal item. Bear jerky for food. 11 torches for underground exploration.

### Entities (16 NPCs/creatures)
| Entity | Position | HP | Notes |
|--------|----------|-----|-------|
| Nima Ruda | (45, 2) | 150/150 | Named NPC, north area |
| **Elder Irudad** | (38, 3) | 225/225 | **Quest giver**, north area |
| Warden Yrame | (40, 8) | 275/275 | Village guard, north-center |
| Ctesiphus | (41, 6) | 5/5 | Likely a cat or small creature |
| Argyve | (6, 19) | 150/150 | **Tinker NPC**, southwest -- gives artifact quests |
| Mehmet | (42, 19) | 100/100 | Merchant/NPC, center-south |
| Tam, dromad merchant [sitting] | (70, 19) | 150/150 | **Trader**, far east |
| watervine farmer (x7) | various | 16/16 | Village laborers scattered around |
| watervine farmer and Mechanimist convert | (44, 15) | 16/16 | Dual-role NPC |
| wet glowfish [swimming] | (17, 22) | 5/5 | Creature in water, south |

**Key NPCs for gameplay:**
- **Elder Irudad** (38, 3): The main quest giver. Gives "A Canticle for Barathrum" quest -- go to the Rust Wells, find the dromad caravan, and make your way to Grit Gate.
- **Argyve** (6, 19): The tinker. Gives quests to find artifacts (usually wants you to bring back specific relics).
- **Warden Yrame** (40, 8): Guards the village. Can train you.
- **Tam** (70, 19): Dromad merchant -- buy/sell/trade.

### The ASCII Screen

The screen is a ~80x19 character grid. Symbol analysis:

| Symbol | Likely Meaning |
|--------|---------------|
| `.` | Open ground / dirt |
| `ô` | Trees / dense vegetation |
| `~` | Water / marsh |
| `ú` | Watervines (the crop Joppa is known for) |
| `×` | Walls (building outlines) |
| `Ø` | Doors |
| `+` | Also doors or intersections |
| `±` | Building walls (different structure, southwest -- Argyve's workshop?) |
| `@` | **The player character** (line 13, col ~37 -- matches position x=36) |
| `*` | Unknown object (line 1, near top) |
| `=` | Stairs or special terrain |
| `z` | An NPC or creature (line 10, near center) |
| `h` | An NPC (line 14, in the ± building -- Argyve?) |
| `l` | An NPC (line 1, in the north buildings) |
| `f` | Watervine farmer or flora (line 14) |
| `è` | Special character/NPC |
| `â`, `÷`, `Ó`, `¾`, `ã` | Various NPCs, items, or terrain features |

The `@` on line 13 is clearly the player. Buildings are outlined with `×` walls and `Ø` doors. The southwest cluster of `±` symbols is a distinct building (likely Argyve's workshop, since he's at (6,19)). Watervines (`ú`) are everywhere -- this is a farming village.

The screen shows:
- **North area**: Several buildings (Elder Irudad's hut, Warden Yrame's area)
- **Center**: Open ground with watervine fields, streams (`~`)
- **Southwest**: Argyve's workshop (the `±` enclosed building with `è`, `h`, `â` symbols inside)
- **East**: More buildings and farmland
- **South**: Trees and water (the glowfish is swimming down there)

---

## How the IPC Feels

### What works well
1. **state.json is excellent.** Rich, structured, immediately parseable. I know my stats, position, every entity in the zone, my inventory, available exits. This is everything I need to make decisions.
2. **Entity data includes hostility flags and HP.** This is critical for a roguelike -- I can assess threats before engaging.
3. **Position system is clear.** (x, y) coordinates for everything. I can calculate distances and pathfind mentally.
4. **The screen.txt as supplementary visual context.** Even with UTF-8 encoding artifacts, I can make out the village layout, buildings, terrain types.

### What's missing / what I wish I had

1. **No `talk` or `interact` command.** The available commands are only `move`, `wait`, and `look`. In a game where talking to NPCs is the primary first activity, this is a critical gap. I need: `talk <npc>`, `trade <npc>`, `use <item>`, `examine <entity>`.
2. **No message log / narrative text.** MUDs stream prose -- room descriptions, NPC dialogue, combat narration. The Qud IPC gives me data but no story. The MUD daemon captures this in `output-buffer.txt`. There's no equivalent here.
3. **Inventory lacks detail.** I see item names but not stats, weight, equip status, or effects. In a roguelike, item stats are life-or-death decisions.
4. **No quest/journal state.** The MUD blackboard tracks `gameState`, `recentEvents`, `decisionNeeded`. The Qud state has none of this. I don't know what quests are active, what my mutations are, or what abilities I have.
5. **No tile/terrain legend.** The screen uses dozens of Unicode characters with no key. I'm guessing what `ô` and `ú` and `±` mean. A `terrain` field per tile or a legend would help enormously.
6. **No result.json feedback loop.** Commands go in via `command.txt` but there's no `result.json` being generated. The MUD daemon has a proper ack/result cycle (`ipc/commands/*.json` -> `ipc/ack/*.json` -> `ipc/results/*.json`). The Qud IPC is half-duplex.
7. **No combat state.** The MUD daemon tracks `inCombat`, `currentTarget`, combat patterns. The Qud state doesn't indicate if I'm in combat, what my weapon is, or what my attack options are.
8. **No mutation/ability info.** Qud characters have mutations (physical and mental). These are a core differentiator. The state doesn't expose them at all.

### The command set is too minimal
Only 3 commands (`move`, `wait`, `look`) for a game with this much depth is like having a car with a steering wheel but no gas pedal. To actually play Qud through IPC, I'd need at minimum:
- `talk <npc>` / `interact <entity>` -- conversation/quest system
- `attack <entity>` -- combat
- `use <item/ability>` -- item and mutation use
- `examine <entity/item>` -- detailed inspection
- `get <item>` / `drop <item>` -- inventory management
- `equip <item>` / `unequip <item>` -- equipment
- `trade <npc>` -- commerce
- `activate <mutation>` -- mutation abilities

---

## Comparison to the MUD Experience

### MUD daemon (Aardwolf) vs. Qud IPC

| Aspect | MUD Daemon | Qud IPC |
|--------|-----------|---------|
| **Connection** | Live telnet stream, real-time | Static file snapshots |
| **Command protocol** | JSON command files with IDs, ack, results | Single `command.txt`, overwritten each time |
| **State richness** | Blackboard + status + digest + world model + output buffer | Single `state.json` + `screen.txt` |
| **Feedback loop** | Full: command -> ack -> result with output text | Broken: command goes in, no confirmed result |
| **Narrative** | Raw telnet output captured, room descriptions, combat text | None -- pure data, no prose |
| **Social** | Tell/say/gossip channels, social obligation tracking | No social layer (Qud is single-player) |
| **Combat** | Pattern matching for hits/kills/fleeing, auto-heal triggers | Not represented |
| **Decision support** | `decisionNeeded` flag, behavior trees, reflex engine | None -- agent must derive decisions from raw state |

### What Qud does better
- **Spatial data is superior.** The (x, y) coordinate system for all entities is far more precise than the MUD's room-based model. I can calculate exact distances, plan paths, and understand the full zone layout at a glance.
- **Entity enumeration is complete.** I see every NPC in the zone with position, HP, and hostility. In the MUD, I only know about entities in my current room.
- **The visual screen is a bonus.** MUDs are pure text. Having the ASCII tilemap alongside structured data gives two complementary views.

### What the MUD does better
- **Feedback loop is closed.** Every command gets an ack and a result. I know what happened.
- **Narrative richness.** Room descriptions, NPC dialogue, combat prose -- the MUD gives me a story. Qud IPC gives me a spreadsheet.
- **State decomposition.** Blackboard, digest, status, world-model -- the MUD breaks state into purpose-built views for different consumers. Qud dumps everything into one file.
- **Autonomous operation.** The MUD daemon runs behavior trees and reflexes -- it can grind, heal, flee, and socialize autonomously. The Qud IPC has no autonomous layer.

---

## Observations and Recommendations

### For making this playable
1. **The game needs to be running and consuming commands.** Right now the IPC is write-only from the game side. Need the Qud mod to poll `command.txt` and execute on the game thread.
2. **Expand the command vocabulary.** At minimum: talk, attack, use, examine, get, drop, equip, trade, activate.
3. **Add result feedback.** Write `result.json` after each command with: what happened, any text output, updated state delta.
4. **Expose mutations and abilities.** Add a `mutations` array to state.json.
5. **Add a message/event log.** Even just the last 10 game messages would transform the experience.

### For the broader project
The Qud IPC is a promising proof-of-concept. The state.json format is well-structured and the spatial data model is actually superior to what the MUD daemon provides. The gap is in the **interaction loop** -- the MUD has a mature command->ack->result pipeline with rich text output, while Qud has a half-built command channel and no feedback. Closing that loop would make this genuinely playable.

The single-player nature of Qud actually simplifies some things (no social layer needed, no timing pressure from other players), but it also means the agent needs to do more -- in a MUD, other players create emergent situations. In Qud, the agent must drive all exploration and decision-making itself.

---

## What I Would Do Next (if the game were live)
1. Move north to Elder Irudad at (38, 3) -- about 15 tiles north
2. Talk to him to get the main quest (A Canticle for Barathrum)
3. Visit Argyve at (6, 19) for tinker quests
4. Check out Tam the merchant at (70, 19) for gear
5. Fill those empty waterskins
6. **Not** leave Joppa -- everything outside is level-inappropriate for a fresh character
