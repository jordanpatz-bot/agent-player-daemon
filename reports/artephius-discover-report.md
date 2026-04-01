# Artephius Discovery Report - Session 2026-03-30

## Character Status
- **Level**: 10 -> 11 (leveled up during this session)
- **Class**: Warrior (Barbarian)
- **Kill Count**: 52 -> 59+
- **Gold**: ~11,000 (spent ~500 on gear/healing)

## Audit Findings Addressed

### 1. Starving/Dehydrated (RESOLVED)
- **Investigation**: Used `help eat` to learn about food system
- **Discovery**: `runto bakery` goes to The Aylorian Eatery; `runto groceries` for drink containers
- **Action**: Bought 10 bread (2g each) from Lerp at bakery, ate 4 to fill up
- **Water**: Bought carrion crawler water skin (5g) from Grizrol's Grocery (came pre-filled). Also drank from Academy Courtyard Fountain (recall, then `run u3n`)
- **Key Learning**: Hunger/thirst greatly reduce healing rate. Fountain at Academy Courtyard is free water.

### 2. Unspent Trains - 46 trains (RESOLVED)
- **Investigation**: Used `help warrior`, `help stats`, `help train` at Warrior Guild
- **Key Discovery**: Warrior priorities are STR (damage), CON (armor), DEX (hits/dodge). Help explicitly says do NOT train HP/mana/moves until level 200/201.
- **Training Results** (all stats cost 1 train per point at this level):
  - STR: 23 -> 40 (maxed!) - 17 trains
  - DEX: 15 -> 30 - 15 trains
  - CON: 20 -> 34 - 14 trains
  - Total: 46 trains spent, 0 remaining
- **Combat Impact**:
  - Hitroll: 39 -> 52 (+13)
  - Damroll: 30 -> 38 (+8)
  - Weight capacity increased significantly

### 3. Unspent Practices - 32 practices (MOSTLY RESOLVED)
- **Action**: Practiced all available skills to 85% (expert level)
- **Priority skills**: Second Attack (critical for DPS), Dodge, Kick
- **All weapon skills**: Mace, Spear, Whip, Dagger, Exotic, Flail, Polearm, Hand-to-hand, Recall
- **Remaining**: 7 practices saved for future skills (Bash unlocked at level 11)
- **Key Learning**: `practice <skill> full` trains a skill to max in one command. INT affects how much you gain per practice.

### 4. Empty Equipment Slots (PARTIALLY RESOLVED)
- **Starting state**: 17 empty slots with basic Level 1 gear
- **Gueldar's Armory** (`runto armory`): Sells level 1 and level 6 leather gear
- **Bought and equipped**:
  - Gueldar's tough leather cap (head) - 25g
  - Gueldar's tough leather jerkin (torso) - 50g
  - Gueldar's tough leather sleeves (arms) - 20g
  - Gueldar's tough leather gloves (hands) - 10g
  - Gueldar's tough leather boots (feet) - 20g
- **Also equipped from inventory**:
  - Lizard scale armband (arms) - later replaced by tough sleeves
  - Toad skin leggings (legs)
  - Viper Skin Belt (waist) - good stats from Gauntlet drops
- **Still empty (12 slots)**: Eyes, ears x2, neck x2, back, around body, wrists x2, fingers x2, held, floating
- **Next steps**: Need to find gear for these slots from drops or other shops

## Game Systems Discovered

### Navigation
- `runto <keyword>` from Aylor recall navigates to areas/shops
- `find all` lists all points of interest in current area (Aylor)
- `areas <search> keywords` finds area keywords for navigation
- Some areas require boats/flight to reach (Fort Terramire across water)
- The overworld (Continent of Mesolar) connects areas via grassland

### Combat
- After training stats, damage went from moderate to "OBLITERATES/EXTIRPATES" (~43-47 per hit)
- Second Attack skill provides extra hits per round
- Kick provides additional damage in combat
- Bugbear Bandits in the Gauntlet give ~28-59 XP per kill (varies)
- Daily blessing doubles XP for first ~15 kills
- Leveled from 10 to 11 during Gauntlet grinding

### Healing
- Temple healer (`runto healer`): Heal spell 200g, Refresh 10g, various cures
- Resting recovers HP slowly (much slower while starving/dehydrated)

### Questing
- Questmaster at `runto questor` (Among the Philosophes in Aylor)
- `quest request` gets a target, `quest info` shows status
- Failed quest to Fort Terramire (needed boat to cross water)
- Quest failure = 15 min cooldown before next quest
- Quest targets marked with [QUEST] flag

## NPCs Talked To
- **Sendivog** (teammate): Shared training info, both geared up at armory
- **Zosimos** (teammate): Told him about Viper Skin Belt from Gauntlet
- **Lerp** (bakery): Food vendor
- **Grizrol** (grocery): Drink containers, bags, torches
- **Gueldar** (armory): Leather armor vendor (level 1 and 6)
- **Sir Sylass Hrythyn** (Warrior Guild): Trainer for stats/skills
- **Benevolent Priestess** (Temple): Healer NPC
- **Questor** (Philosophes): Quest dispenser

## Equipment Found
- Viper Skin Belt (Glow)(Hum) - from Gauntlet mob drops (gives good stats)
- Toad skin leggings (Glow)(Hum) - from inventory (unknown source)
- Lizard scale armband (Glow)(Hum) - from inventory
- Stone keys, light crossbows, hooded cloaks - from Gauntlet (cloaks require level 12)

## Things I Couldn't Figure Out
- How to get to Fort Terramire (need boat - `runto boats` in Aylor?)
- What the remaining empty gear slots can be filled with (eyes, ears, neck, wrists, fingers, etc.)
- Whether the `eqsearch all` command (mentioned at levelup) finds better level-appropriate gear
- The optimal area for grinding at level 11

## Daemon Issues
- Artephius daemon disconnected at 20:50:03 UTC during a PM2 restart cycle
- Had to manually restart via `npx pm2 start daemon.js --name mud-artephius -- --profile artephius`
- Also restarted Sendivog and Zosimos daemons which were also stopped

## Levels Gained
- Level 10 -> 11 (gained from Bugbear Bandit kills in the Gauntlet)
- Level 11 rewards: +22 HP, +15 mana, +16 moves, 4 practices, 6 trains
- New skill unlocked: Bash

## Post-Level 11 Updates
- Trained DEX to 35 (maxed for current level cap) and CON to 35 with the 6 new trains
- Practiced Bash skill to 85% (new skill at level 11)
- `eqsearch all` revealed best searchable gear for all slots - key areas: Bootcamp, Gaardian, Crusaders, Druid, Kerofk, Perdition

## Final Character State
- Level 11, STR 46/40, DEX 36/35, CON 37/35, INT 16/15, WIS 15/15, LCK 17/15
- Hitroll: 51, Damroll: 38
- HP: 322, Mana: 307, Moves: 683
- Gold: 11,012
- 8 practices remaining, 0 trains
- Resistances: 1.4% across all types (need much better gear)
- 60 total kills, 52 quest points

## Session Summary
Started the session at Level 10 with 46 unspent trains, 32 practices, mostly empty equipment, and starving/dehydrated. Systematically addressed each audit finding: fed and watered at bakery/fountain, trained STR to max (40) plus DEX (30) and CON (34), practiced all combat skills to 85%, bought level 6 armor from Gueldar's Armory. Failed a quest to unreachable Fort Terramire (need boat), then went to the Gauntlet and leveled up to 11 by killing Bugbear Bandits. Combat performance dramatically improved after training - dealing 43-47 damage per hit with "OBLITERATES/EXTIRPATES" messages. Invested level 11 trains into maxing DEX (35) and CON (35). Used `eqsearch all` to discover a roadmap for filling remaining 12 empty equipment slots. Still need to visit Bootcamp, Gaardian, Crusaders, and other areas for gear.

## Next Session Priorities
1. Fill remaining 12 empty equipment slots using `eqsearch` locations (Bootcamp, Gaardian, etc.)
2. Continue grinding in the Gauntlet or find a better area for level 11
3. Get a quest to an accessible area (avoid water-locked areas)
4. Explore the underground river system in the Gauntlet
5. Coordinate with Sendivog and Zosimos for group hunting
