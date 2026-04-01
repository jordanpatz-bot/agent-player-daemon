# Basilius Discovery Report - Session 1
**Character:** Basilius, Level 3 Human Warrior (Barbarian)
**Date:** 2026-03-30
**Session Duration:** ~15 minutes of active play

## Current Status
- **Level:** 3 (leveled up from 1)
- **HP:** 187/187 | **Mana:** 182/182 | **Moves:** 530
- **Gold:** ~6,865 (started with 400)
- **TNL:** 639
- **Trains:** 10 | **Practices:** 2 remaining
- **Kills:** 12 total

## Audit Findings and Investigations

### 1. Equipment Slots Empty (WARNING)
- **Finding:** 18 of ~24 equipment slots empty at start
- **Investigation:** Wearing: torch (light), leather jerkin (torso), leather pants (legs), Aylorian Shield (shield), Aylorian Sword (primary weapon)
- **Action taken:** Acquired and equipped Viper Skin Belt (waist) from combat training quest, Academy training cloak (neck)
- **Still empty:** head, eyes, ears, neck (2nd slot), back, body, arms, wrists, hands, fingers, feet, held, floating
- **Next step:** Need to find shops in Aylor or drop from mobs. Economy quest shopping list will help fill some.

### 2. Unspent Trains (INFO)
- **Finding:** 9 trains available at start
- **Investigation:** Visited `train` command at Warrior Guild. Stats cost 1 train each. HP/Mana/Moves cost 2 trains each.
- **Action taken:** Trained Str 17->20 (3 trains), Con 15->17 (2 trains), Dex 15->16 (1 train). Total 6 trains used.
- **Current stats:** Str 27/20, Int 17/16, Wis 16/16, Dex 17/16, Con 19/17, Luck 16/15
- **Observation:** The first number includes equipment bonuses. Training changes the base (second number).
- **Combat impact:** Hitroll went 35->37, Damroll 27->28 after training Str from 17 to 20

### 3. Unspent Practices (INFO)
- **Finding:** 12 practices at start
- **Investigation:** Must be at guild room to practice. `runto warrior` from Aylor goes to Tower of Strength.
- **Action taken:** Practiced: Parry 1%->85% (expert), Kick 50%->85% (expert), Dodge 50%->85% (expert), Hand to hand 50%->85% (expert), Exotic 1%->29%
- **Discovery:** Skills have an "expert" cap from practice. Further improvement likely comes from using them in combat. Each practice costs 1 practice session and improves by ~28%.

### 4. No Party (INFO)
- **Finding:** Not grouped with teammates
- **Investigation:** Teammates Geber (thief/ninja) and Trismegist (mage/elementalist) are online
- **Action:** Communicated via `tell` but haven't grouped yet
- **Next step:** Try `group` command

### 5. Quest Available (INFO)
- **Finding:** Quest ready from login
- **Investigation:** Tried `quest request` - requires being at a questmaster NPC. Need to find one in Aylor.
- **Next step:** Use `find questmaster` or explore Aylor for one

### 6. Unmapped Exits (INFO)
- **Finding:** Varies by room, tracking exploration progress
- **Action:** Explored academy rooms, Aylor recall point, Forest of Li'Dnesh

## Game Systems Discovered

### Combat Mechanics
- **Damage output:** Consistently hitting 29-30 damage per "slice" with Aylorian Sword (at Str 27, Damroll 28)
- **One-shot capability:** Most level 1-3 mobs die in 1-2 hits
- **Defensive skills:** Parry and dodge both proc regularly in combat
- **Kick:** Can be used in combat with `kick` but must target correctly
- **XP per kill:** 100-135 XP for level-appropriate mobs in Li'Dnesh
- **Death messages:** "DECIMATES" = 29 damage, "OBLITERATES" = 44 damage (higher level)

### Leveling
- **Level 1->2:** Required 1000 XP. Gained: +15 HP, +16 Mana, +15 Moves, +4 practices, +5 trains, bonus Int, new skill (Axe)
- **Level 2->3:** Required ~1000 XP. Gained: +12 HP, +16 Mana, +15 Moves, +4 practices, +2 trains, bonus Wis

### Academy System
- **Structure:** Series of lessons with quizzes and assignments
- **Rewards:** 50 XP per quiz answer, 500-5000 gold per completed lesson, equipment rewards
- **Speed:** Can use `faster` to speed up NPC text, `quiz` to skip lessons
- **Navigation:** `runto <keyword>` works within academy, `find all` shows all keywords

### Training/Practice System
- **Location:** Must be at class guild (Warrior Guild = Tower of Strength via `runto warrior`)
- **Stats:** Cost 1 train each. Human has max 31 Str, 26 for others.
- **Skills:** Practice at guild, ~28% per practice session, caps at 85% (expert)
- **Skill list at level 1:** Dodge, Exotic, Hand to hand, Kick, Parry, Recall, Sword
- **Level 2 skill:** Axe

### Navigation
- **Recall:** Returns to Grand City of Aylor
- **Speedwalks:** `speedwalks <area>` shows directions from recall
- **Runto:** `runto <keyword>` auto-walks to locations within an area
- **Areas:** `areas 1 10` shows areas for level range 1-10

### Economy
- **Autoloot/Autogold/Autosac:** Toggle commands for automatic corpse handling
- **Shops:** Use `list` to see items, `buy <item>`, `appraise <item>` for stats
- **Banking:** `deposit`, `withdraw`, `balance` at a bank
- **Auction:** `bid` command

## Equipment Found
| Slot | Item | Source |
|------|------|--------|
| Light | (Glow) a torch | Starting gear |
| Torso | Gueldar's crafted leather jerkin | Starting gear |
| Legs | Gueldar's crafted leather pants | Starting gear |
| Shield | an Aylorian Shield | Starting gear |
| Primary Weapon | an Aylorian Sword | Starting gear |
| Waist | Viper Skin Belt | Combat training quest reward |
| Neck | Academy training cloak | Bought from Vladia (50g) |

## NPCs Talked To
1. **Academy Recruiter** - Entrance to academy, says hello, enlists you
2. **Claire** - Basic Training teacher, quiz on game basics
3. **Vorth** - Skills/Spells trainer, quiz on spells/skills commands
4. **Commander Dahr** - Combat trainer, viper-hunting assignment
5. **Nurse Orcron** - Health trainer, no quiz, gives potions
6. **Filt** - Equipment/Armory trainer, quiz on items
7. **Vladia** - Economy trainer, quiz + shopping list assignment
8. **Sir Sylass Hrythyn** - Warrior Guild trainer (practices/trains)
9. **Receptionist** - Academy foyer, `find all` for directory

## Academy Progress
- [x] Task 1: Enlist in Academy
- [x] Task 2: Basic Training (quiz: D-Charisma, C-Train, exits)
- [x] Task 3: Skills/Spells Training (quiz: C-spells resist, 45-fireball, affects)
- [x] Task 4: Hunting/Combat Training (kill vipers, return skin)
- [x] Task 5: Health Training (no quiz, skip)
- [x] Task 6: Equipment Training (quiz: E-keep, A-identify, E-hum)
- [ ] Task 7: Economy Training (shopping list assignment in progress)
- [ ] Tasks 8-11?: Communications, Geography, Social, Custom, Career (remaining)

## Vladia's Shopping List (Current Quest)
1. Sara's Cookies - Aylor Eatery
2. Carrion crawler water skin - Aylor Grocery Store
3. Griffon's blood potion - Aeleron's Alchemy Supplies (Aylor)
4. Acuity Scroll - Mayvor's Mystic Mastery (Aylor)
5. Crafted Leather Boots - Gueldar's Armory (Aylor)
6. Aylorian Dirk - Xena's weapon parlor
7. Red Apple - Kimr's Farm (picked fresh, not from store)
8. Reed Flute - Sen'narre Lake
Optional: Brewington special - Land of the Beer Goblins

## Team Communication
- Geber (Ninja): Shared quiz answers for basic and skills training
- Trismegist (Elementalist): Shared warrior guild location, viper hunting tips

## Custom Audit Rules Added
None yet. Planning to add:
- Gold threshold tracker
- Level-up notification
- Equipment count tracker

## Things I Could Not Figure Out
- How to find a questmaster in Aylor (need to explore more)
- Whether forming a group with teammates affects XP rates
- Exact impact of each stat point on combat (need controlled experiments)

## Next Steps
1. Complete Vladia's shopping list (economy quest)
2. Finish remaining academy lessons (Comm, Geography, Social, Custom, Career)
3. Find a questmaster and do a quest for quest points
4. Group with teammates (Geber, Trismegist)
5. Explore shops in Aylor to fill more equipment slots
6. Train more stats when trains accumulate
