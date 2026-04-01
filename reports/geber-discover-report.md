# Geber Discovery Report - Level 1 Human Thief (Ninja)

## Session Summary
- **Start**: Level 1, 160 HP, 0 XP, Outside Aylorian Academy
- **End**: Level 3, 186 HP, in Forest of Li'Dnesh hunting viper skins
- **Duration**: ~20 minutes of active play
- **Kills**: 13 creatures (3 vipers, 2 porcupines, 2 grasshoppers, 1 dormouse, 1 mole, 1 bobcat, 1 rattlesnake, 2 others)
- **Gold earned**: ~2000 (started 400, now 1943 after training)

## Audit Finding Investigation

### [warning] equipment-slots: 18 of 24 empty
- **Investigated**: Checked equipment command. Wearing only: torch (light), leather jerkin (torso), leather pants (legs), Aylorian Shield, Aylorian Dirk (weapon).
- **Action**: Suppressed audit since no shops found yet in academy. Need to find Aylor shops or academy equipment training room.
- **Status**: SUPPRESSED. Equipment training is at `run 4nw` from academy foyer.

### [info] unspent-trains: 9 -> 13 (gained 8 from leveling)
- **Investigated**: Checked `train` output. DEX has max 31 and cheapest cost.
- **Action**: Trained DEX x4 (17->21), CON x1 (15->16), LUCK x1 (15->16). Saved 3 trains.
- **Reasoning**: DEX is primary stat for Ninja (highest max at 31, dodge/hit/damage scaling). CON for HP. LUCK for rare drops and various bonuses.
- **Current**: 13 trains available (gained 8 more from levels 2-3).

### [info] unspent-practices: 12 -> 15 (gained 8 from leveling, spent 5)
- **Investigated**: Practiced at Vorth the skills trainer in the academy.
- **Action**: Practiced Dodge x2 (50%->expert/85%), Recall x1 (50%->78%), Exotic x1 (1%->29%), Kobold Stench x1 (1%->29%).
- **Key discovery**: Can only practice at trainer NPCs. Claire in Basic Training and Vorth in Skills Training are both trainers.
- **Remaining**: 15 practices for future skills (Misdirection at level 3, Whip at 3).

### [info] no-party: Not in a group
- **Investigated**: Teammates Basilius, Trismegist, and Rhizome were at academy entrance.
- **Action**: Communicated via tells. Did not form party as we were doing solo academy tasks.
- **Status**: Ongoing. Should group up for harder content.

### [info] quest-available
- **Investigated**: Quest system exists but didn't request one yet - focused on academy goals first.
- **Status**: Still available. Will try after completing combat training.

### [info] unmapped-exits
- **Investigated**: Explored academy courtyard thoroughly (east/west benches, north entrance path).
- **Action**: Followed exits to map academy layout. Found all training rooms.

## Academy Progress

### Completed
1. **Enlist** - Talked to recruiter, enlisted
2. **Basic Training (Claire)** - Quiz: D=Charisma not a stat, C=Train shows costs, exits=helpfile with 'visible exits'. Reward: 150 XP + 500 gold
3. **Skills/Spells Training (Vorth)** - Quiz: C=spells resist, 45=fireball spell number, affects=shows current effects. Reward: 150 XP + 1000 gold

### In Progress
4. **Combat/Hunting Training (Commander Dahr)** - Assignment: Kill vipers in Forest of Li'Dnesh, bring back viper skin. Killed 4 vipers so far but skin hasn't dropped (random rare drop).

### Not Yet Started
- Equipment Training (`run 4nw` from foyer)
- Communications Training
- Health Training
- Economics Training
- Geography Training
- Social Studies Training
- Career Training
- Customization Training

## NPCs and Shops Found
| NPC | Location | Role |
|-----|----------|------|
| Academy Recruiter | Before Academy Courtyard | Enlistment |
| Academy Receptionist | Academy Foyer | Directory (find all) |
| Claire | Basic Training (foyer west) | Basic training + trainer |
| Vorth | Skills Training (foyer east) | Skills training + trainer |
| Commander Dahr | Combat Training (foyer 2n-w) | Combat training |
| Ayla | Global | Corpse buyer (auto-sacrifice) |

## Key Discoveries

### Ninja Subclass
- Special skills: Nimble Cunning, Scorpion Strike, Blindfighting, Stealth, Stalk, Quickstab, Veil of Shadows, Veil of Stone
- Bonuses: Hand to Hand bonus damage, Extra hits when not dual wielding, Can Backstab in combat, Cannot be strangled
- DEX max is 31 (highest of any stat for Human Thief)

### Combat Performance
- One-shotting most level 1-5 creatures (23-36 damage per stab)
- Bobcats take 4-5 rounds (tougher, they cast spells)
- Dodge working well at expert level
- Poison from rattlesnakes is a minor concern

### Thief Full Skill List (key upcoming skills)
- Level 3: Misdirection, Whip
- Level 6: Nimble Cunning (ninja-specific)
- Level 9: Circle, Hide
- Level 10: Hand to Hand
- Level 11: Scorpion Strike (ninja)
- Level 13: Sneak
- Level 14: Enhanced Damage
- Level 18: Second Attack, Steal, Veil
- Level 23: Backstab (CRITICAL - ninja can backstab in combat)
- Level 29: Dual Wield
- Level 35: Stalk (ninja)
- Level 56: Quickstab (ninja)
- Level 79: Stealth (ninja)

### Navigation
- Speedwalks from Aylor recall: `speedwalks <area name>`
- Academy find system: `find all` at receptionist, `find <keyword>` for directions
- Run command: `run 2s8e5ne5n3e` for Forest of Li'Dnesh

## Custom Audit Rules Added
None yet - will add tracking for:
- Academy completion percentage
- Viper skin quest item tracking

## Social Interactions
- Told Basilius and Trismegist quiz answers and intel
- Received from Trismegist: Level 2, INT primary for mages, Magic Missile one-shots vipers at 85%
- Received from Basilius: Level 3, completed 6/11 academy tasks, tip to use `runto thief` from Aylor for guild
- Said hello on newbie channel as part of Claire's lesson

## Things I Couldn't Figure Out
1. **Viper skin drop**: Killed 4 vipers, no skin dropped. May be very rare or need specific viper type/room.
2. **Config syntax**: `config autoloot` etc. didn't work. Syntax seems to be `config [option] on|off` per GMCP. Need to investigate proper config commands.
3. **How to find "Deeper in the Forest" room**: `where viper` says this but I kept ending up in adjacent rooms. May be a different area section.
4. **Questing system**: Haven't tried `quest request` yet.

## Levels Gained
- Level 1 -> 2: Killed grasshopper (with rare kill bonus). Gained 12 HP, 16 mana, 23 moves, 4 practices, 4 trains.
- Level 2 -> 3: Killed bobcat during double XP event. Gained ~14 HP, ~15 mana, ~22 moves, 4 practices, 4 trains.

## Equipment Acquired
- **Viper Skin Belt** (Glow)(Hum) - waist slot, reward from combat training quest. Crafted from viper skin by Commander Dahr.
- **Dragonfly wings** - in inventory (from dragonfly kill)
- **Snake fangs** - in inventory (from rattlesnake kill)
- **2x Porcupine quills** - in inventory (from porcupine kills)

## Stats at End of Session
- Level 4 Human Thief (Ninja)
- STR 16/15, INT 15/15, WIS 15/15, DEX 27/21, CON 15/16, LUCK 16/16
- HP 199, Mana 197, Moves 567
- Hitroll 31, Damroll 23
- Gold ~7000 (started 400, earned 1500 from academy + loot, 5000 from combat quest)
- 13 trains, 15 practices available (gained 8 each from levels 2-4, spent 6 trains and 5 practices)
- TNL: 787
- Kill count: 15
- Alignment: 12 (slightly good)
- Academy: 4/11 tasks completed (Basic, Skills, Combat done; Health next)
- New spell: Underwater Breathing (level 4)
