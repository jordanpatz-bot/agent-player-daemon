# Avicennus - Achaea MUD First Session Report
**Character:** Avicennus, Level 5 Human Monk (Fledgling)
**Date:** 2026-03-30
**Session Duration:** ~20 minutes of active play

## Tutorial Flow ("Escape from Miba")

1. **Start:** Dark cell with an old man in dirty grey robes. Trapped, cannot leave.
2. **Dialogue system:** The old man speaks in timed dialogue. Use `SAY YES` or `SAY NO` to advance choices. The `HINT` command repeats the current objective.
3. **Key given:** Old man gives a rusted iron key after saying yes.
4. **Unlock and escape:** `UNLOCK DOOR NW` uses the key. Key breaks in lock.
5. **First combat:** A pygmy guard appears. Tutorial teaches PUNCH, KICK, HEADSLAM.
6. **More pygmies:** 3 pygmies rush in the next room. Tutorial-only combat uses these simplified commands.
7. **Rescue:** NPC companions Garesh (mhun blademaster) and Maire (jester) arrive to help.
8. **Healing taught:** Maire gives a health elixir. `DRINK HEALTH` heals HP.
9. **Gold pickup:** `GET GOLD` then `PUT GOLD IN PACK` to secure it (500 gold).
10. **Tattoo system:** Garesh tattoos a boar on my torso. `TOUCH BOAR` activates passive HP regen.
11. **Skill learning:** `LEARN 15 TEKURA FROM MAIRE` spends 15 lessons to gain abilities.
12. **Task system:** `TASKS` shows a checklist of things to do. `TASK <#>` for details.
13. **Released into world:** Sent to find Beku the pygmy chieftain in Miba Village.
14. **Auto-walk:** `WALK TO MINIA` and `WALK TO PYGMIES` auto-travel to destinations.
15. **Confronted Beku:** He's too strong at level 5. Guards knock you out with a dart. Need level 10.
16. **Writhe/Stand:** After being bound, `WRITHE` frees you, then `STAND` to get up.

## Commands That Work

| Command | What it does |
|---------|-------------|
| `LOOK` / `L` | View room description and exits |
| `SCORE` | Full character stats sheet |
| `INVENTORY` / `INV` | Shows held items, worn gear, containers |
| `SKILLS` | Lists all skill trees and proficiency |
| `AB <skill>` | Lists abilities in a skill |
| `AB <skill> <ability>` | Detailed info on one ability |
| `HINT` | Repeats current tutorial/task hint |
| `TASKS` | Shows task checklist |
| `TASK <#>` | Details for a specific task |
| `WALK TO <place>` | Auto-travel to a named destination |
| `FOLLOW <NPC>` | Follow an NPC as they move |
| `GREET <NPC>` | Social greeting, can trigger quests |
| `SAY <text>` | Speak in the room |
| `SAY TO <target> <text>` | Speak directly to someone |
| `TELL <player> <text>` | Private message to another player |
| `DRINK HEALTH` | Drink from health elixir vial |
| `TOUCH BOAR` | Activate boar tattoo (passive HP regen) |
| `GET <item>` | Pick up an item |
| `PUT <item> IN <container>` | Store items |
| `GIVE <item> TO <NPC>` | Give items to NPCs |
| `UNLOCK <door> <direction>` | Use a key on a door |
| `WRITHE` | Escape from entanglement/bindings |
| `STAND` | Stand up after being knocked down |
| `SETTARGET <target>` | Set default combat target |
| `QW` | Quick Who - see who's online |
| `LEARN <#> <skill> FROM <NPC>` | Spend lessons to learn abilities |

## Commands That Do NOT Work

| Command | Result |
|---------|--------|
| `EQUIPMENT` | "Not a valid command" - use `INVENTORY` instead |
| `KILL <target>` | In tutorial: "Prepare yourself, it's not quite time for that yet!" |
| `ASK <NPC> ABOUT <topic>` | No response from NPCs |

## Combat System - Key Discoveries

### Balance System
- Every attack uses "balance" (3.1-4.3 seconds depending on ability)
- Cannot act again until balance recovers ("You must regain balance first.")
- Prompt shows `ex-` when balanced, `e-` when off-balance

### Monk-Specific Combat (Tekura)
- **Snapkick (SNK):** `SNK <target> left/right` - targets specific limbs, 3.1s balance, ~60-245 damage
- **Hook:** Curving punch
- **Jab:** Straight punch
- **Combo:** Can chain attacks together (not yet tested in real combat)
- **Stances:** Horse stance is the basic one

### Tutorial Combat (simplified)
- `PUNCH <target>` - basic punch attack
- `KICK <target>` - basic kick attack
- `HEADSLAM <target>` - 100 unblockable damage

### Damage Types Observed
- Physical blunt, physical cutting, asphyxiation, raw, unblockable

### XP Values
- Pygmy hunter: 140 XP (one-shot kill, ~60 HP)
- Pygmy guard (tutorial): 186 XP
- Pygmy guard (Miba village): 3370 XP (tanky, takes 3-4 hits, hits for 75-94)

### Healing Options
1. `DRINK HEALTH` - instant heal from oaken vial (limited uses, needs refilling)
2. `TOUCH BOAR` - activates boar tattoo, gradual HP regen over time (4.0s balance cost)
3. Boar tattoo passive regen also ticks while idle

## Skills Discovered

### Tekura (Monk class - martial arts)
- Currently known: Horse, Combo, Hook, Snapkick, Jab
- Next ability costs 12 more lessons
- Full tree includes: Eagle stance, Sidekick, Uppercut, Bodyblock, Block, Palmstrike, Hammerfist, Cat stance, Roundhouse, Evade, and many more

### Kaido (Monk class - self-healing/defense)
- Currently known: Weathering (increases damage resistance)
- Next ability costs 7 lessons
- Full tree includes: Vitality, Sturdiness, Toughness, Deaf, Clotting, Regeneration, Fitness, Restoration, Projectiles, and more

### General Skills
- Vision, Tattoos, Survival (Apprentice), Weaponry (Apprentice), Riding

## NPCs Met

1. **Old man in dirty grey robes** - Tutorial cell companion, gives key
2. **Garesh** - Mhun blademaster, NPC companion, tattoo artist, refills health vials
3. **Maire** - Jester, NPC companion, teaches Tekura lessons
4. **Beku** - Pygmy chieftain, boss enemy (need level 10 to defeat)
5. **Pepu** - Pygmy cook at Miba's fire pit (has a quest - needs greeting)
6. **Vellis** - Butterfly collector near Minia entrance

## Teammates

- **Damianus** (Serpent class) - Spotted at Miba Village entrance. Wields an iron-tipped whip.
- **Theodorus** (Magi class) - Level 4, has Elementalism and Crystalism. Spotted traveling to Minia.

## How the Audit System Helped

- **low-hp-idle warning:** Caught me at 47% HP idle, reminded me to heal before engaging combat
- **equipment-slots info:** Pointed out "equipment" is not a valid command (different from other MUDs)
- **no-party info:** Consistently reminded about forming a group for shared XP
- **unmapped-exits:** Tracked unexplored exits, encouraging exploration
- **reflex_heal events:** The daemon automatically detected low HP and logged heal events
- **reflex_flee event:** At 18% HP the system detected critical danger

## What Was Different From Other MUDs

1. **No "kill" command** - You use specific attack abilities (SNK, PUNCH, KICK, etc.)
2. **Balance/Equilibrium system** - Not a standard round-based timer, but ability-specific cooldowns
3. **Tattoo system** - Magical tattoos as a core mechanic (boar for healing, others available)
4. **Lessons currency** - Skills are learned by spending "lessons" from NPCs/trainers
5. **WALK TO system** - Auto-pathing to named locations
6. **SAY-based dialogue** - Tutorial choices made by literally SAYing responses
7. **WRITHE mechanic** - Specific command to escape bindings (not just "escape" or "flee")
8. **Body-part targeting** - Attacks can specify left/right limbs
9. **No "equipment" command** - Use INVENTORY to see gear
10. **Stances** - Monk combat involves stance switching (Horse, Eagle, Cat, etc.)

## Current State

- **Level:** 5 (1% to next)
- **Location:** Path north of the fire pit, Miba Village
- **HP:** 550/550, Mana: 500/550
- **Gold:** 500 (in backpack)
- **Lessons:** 170 remaining (spent 15 on Tekura)
- **Next goal:** Grind to level 10 to defeat Beku
- **Active tasks:** Many tasks incomplete (Newbie Channel, Help System, Mentor, Glancing, etc.)

## What Confused Me

1. The tutorial has **timed dialogue** - NPCs speak on a timer and you just have to wait. Spamming HINT helped track state.
2. "equipment" being invalid was surprising - INVENTORY is the only way to see gear.
3. The balance system was non-obvious at first - attacks just fail silently with "You must regain balance first."
4. Pygmy guards in the open world are MUCH tougher than tutorial pygmies (3370 XP vs 186 XP, multi-hit).
5. The daemon's blackboard showed "maxHp: 100" for a long time (stale data) while actual max was 350+.

## Daemon/Tool Issues

1. **Stale blackboard values:** maxHp, maxMana, maxEndurance, maxWillpower all showed "100" (stale: true) for most of the session. The daemon wasn't parsing max values from the prompt correctly initially.
2. **currentRoom stayed "unknown"** for the first part of the tutorial until it eventually updated.
3. **"equipment" audit suggestion** kept repeating even though the command doesn't exist in Achaea.
4. **Brief connection drop** occurred mid-session but reconnected automatically.
5. **Level displayed as "1" in blackboard** even after reaching level 5 in-game (stale level tracking).
