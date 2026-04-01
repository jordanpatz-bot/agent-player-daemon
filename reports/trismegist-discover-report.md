# Trismegist Discovery Report - Level 1 Human Mage (Elementalist)

## Session Summary
- Started: Level 1, 160hp/150mana, 12 practices, 9 trains, 400 gold
- Current: Level 2, 173hp/171mana, 7 practices, 15 trains, ~7000 gold (after shopping)
- Academy Progress: 6/7+ tasks completed (Enlist, Basic, Skills, Combat, Health, Equipment done; Economy quiz done, shopping quest in progress)
- Kills: 5 vipers killed by me (magic missile), plus assists from Basilius
- Location: Aylor recall point, with 6/8 Vladia shopping items purchased
- Teammates: Basilius (Barbarian, also doing academy), Geber (Ninja, already Level 3)
- Key gear: Academy Training Cloak gives +5 Magic Missile skill!

## Audit Investigations

### equipment-slots (SUPPRESSED)
- 18 of 24 slots empty at start. Filled waist slot with Viper Skin Belt from combat training quest.
- Suppressed because: addressing after academy completion when I know where shops are.
- Starting gear: torch (light), leather jerkin (torso), leather pants (legs), Aylorian Shield, Aylorian Dirk (weapon).

### unspent-trains
- Started with 9 trains, now have 15 (gained 6 on level up).
- Help mage says: "primary stat is INTELLIGENCE. Almost all of the mage's spells are based on INTELLIGENCE and to a lesser degree, LUCK and WIS."
- Train costs at level 1: all stats cost 1 train each. INT maxes at 31.
- **NOT YET TRAINED** - saving for after stat experiment. Need to test INT vs damage on magic missile.
- Help train says: do NOT train hp/mana/moves until level 200/201 stat caps.

### unspent-practices
- Started with 12, used 9 total:
  - Magic Missile: 50% -> 85% (2 practices) - CRITICAL, this is nofail so % directly affects damage
  - Dodge: 1% -> 85% (3 practices) - defensive skill
  - Blink: 50% -> 85% (2 practices) - avoidance/movement spell
  - Recall: 50% -> 85% (2 practices) - safety/travel spell
- Remaining unpracticed: Exotic 1%, Spear 1% (weapon skills, low priority for a mage)
- Level 2 gained Scrolls skill (not yet practiced)
- 7 practices remaining

### no-party (SUPPRESSED)
- Basilius (Barbarian) and Geber (Thief/Ninja) are also online, doing their own academy runs.
- Suppressed because: solo academy progression, will group for hunting later.

### quest-available (SUPPRESSED)
- Quest system available but focusing on academy completion first.

## Spell Experiments - Magic Missile

### Damage Data (all at 85% practiced, INT 22-23)
| Kill # | Damage | Mana Cost | XP Earned | Target |
|--------|--------|-----------|-----------|--------|
| 1 | 14 | 25 | 120 | small dark viper |
| 2 | 12 | 25 | 127 | small dark viper |
| 3 | 14 | 25 | 113 | small dark viper |
| 4 | 13 | 25 | 120 | small dark viper |
| 5 | 14 | 25 | 111 | small dark viper |

### Analysis
- Magic Missile damage range: 12-14 at 85% with INT 22-23
- All vipers died in 1 hit (they have ~12-14 HP)
- Mana cost: 25 per cast, consistent
- Mana economy at level 1 (150 max): 6 casts before empty
- Mana economy at level 2 (171 max): 6-7 casts before empty
- Mana regeneration observed: ~10 mana per tick while standing/moving
- XP per viper: 111-127 (diminishing slightly with kills?)
- **Magic Missile is nofail** - practiced % directly determines damage, never misses

### Key Insight
- At 85%, magic missile one-shots level-appropriate mobs
- Mana is the limiting factor, not damage
- Getting to 100%+ through combat use will further increase damage
- INT increases should boost spell damage (not yet tested - planned experiment)

## Stat Training Evidence
- NOT YET TESTED - planned experiment:
  1. Record magic missile damage at current INT (23)
  2. Train INT by 1
  3. Cast again, compare
  4. This would provide evidence for INT-to-damage scaling

## Equipment Found
| Slot | Item | Source |
|------|------|--------|
| Light | (Glow) a torch | Starting gear |
| Torso | Gueldar's crafted leather jerkin | Starting gear |
| Legs | Gueldar's crafted leather pants | Starting gear |
| Shield | an Aylorian Shield | Starting gear |
| Weapon | an Aylorian Dirk | Starting gear |
| Waist | Viper Skin Belt | Combat training quest reward |
| Empty | 17 slots | Head, eyes, ears, necks, back, body, arms, wrists, hands, fingers, feet, held, floating |

### Potions Received
- 2x Academy Healing Potion (from Health training)
- 2x Academy Refresh Potion (from Health training)
- 2x Academy Black Lotus Potion (from Health training)

## NPCs Discovered

### Academy NPCs
| NPC | Location | Role |
|-----|----------|------|
| Academy Recruiter | Before Academy Courtyard | Enlists students |
| Academy Receptionist | Inside Academy Foyer | Gives find directions |
| Claire | Basic Training | Teaches basics, quiz |
| Vorth | Skills Training | Teaches skills/spells, quiz |
| Commander Dahr | Combat Training Room | Combat training, viper quest |
| Nurse Orcron | Academy Clinic | Health/healing lessons, gives potions |
| Filt | The Armory | Equipment training, quiz |
| Vladia | Academy Treasury | Economics training, quiz |

### Other Players Encountered
- Basilius the Barbarian (teammate)
- Geber the Ninja (teammate)
- Rhizome the Shaman
- NottheBrave the Venomist (Linkdead)
- BalthazaarK the Venomist (Flying)
- Sendivog the Elementalist (at Aylor recall point)

## Custom Audit Rules Added
- None yet. Three suppressions placed:
  1. equipment-slots: addressing after academy
  2. no-party: solo academy first
  3. quest-available: academy first

## Academy Quiz Answers
| Lesson | Q1 | Q2 | Q3 |
|--------|----|----|-----|
| Basic | D (Charisma not a stat) | C (train shows costs) | exits (contains 'visible exits') |
| Skills | C (spells resist) | 45 (fireball spell number) | affects (current effects) |
| Combat | (kill quest, no quiz) | | |
| Health | (no quiz, skip) | | |
| Equipment | E (keep prevents dropping) | A (identify shows stats) | E (hum flag for blind) |
| Economics | D (appraise in store) | withdraw | (got 'auction' wrong - correct answer was 'bid') |

## Discoveries and Key Learnings

1. **Nofail spells** scale damage with practiced %. This is the most important mechanic for a mage - practice combat spells to max ASAP.
2. **help search [phrase]** searches help files - incredibly useful for quiz answers.
3. **showskill [spell]** reveals if a spell is nofail and shows spell numbers.
4. **speedwalks [area]** from Aylor recall gives navigation directions.
5. **find all** in Academy/Aylor shows locations with pathfinding.
6. **runto [keyword]** auto-walks to speedwalk destinations.
7. **areas [min] [max]** lists areas by level range.
8. Mana regen is ~10 per tick standing, observed through multiple ticks.
9. Level 2 granted: 13hp, 21 mana, 15 moves, 4 practices, 6 trains, bonus CON point.

## What Confused Me
1. The `where` command showed vipers in rooms I couldn't easily find - "Deeper in the Forest" is a generic room name used for multiple rooms in Li'Dnesh.
2. Viper skin is a random drop, not guaranteed - took 5 kills to get one.
3. The auction quiz question: "What command to see items and place a bid?" - I answered "auction" but correct was "bid". The distinction is: `auction` submits items, `bid` views and bids on them.
4. Glow vs Hum flags: Glow = visible in dark rooms. Hum = usable when blind. I mixed these up.

## Aylor City Shops Discovered (via find all / runto)
- Gueldar's Armory (boots, armor)
- Aylorian Eatery (Sara's cookies, food)
- Grizrol's Grocery (water skins, supplies, lights)
- Aeleron's Alchemy Supplies (potions - Griffon's Blood etc.)
- Mayvor's Mystic Mastery (scrolls, wands)
- Xena's Weapon Parlor (dirks, weapons)
- Aylorian Bank of Ivar (banking)
- Bookworm's Haven (guides)
- Academy Treasury/Vladia (canoe, cloak, lantern, lunch)
- Also available: Mage Guild, Healer, Questor, Pets, Lottery, Casino, etc.

## Vladia's Shopping Quest Progress (6/8 items)
- [x] Sara's Cookies from Aylor Eatery (4 gold)
- [x] Carrion Crawler Water Skin from Grizrol's Grocery (5 gold)
- [x] Griffon's Blood Potion from Aeleron's (150 gold)
- [x] Acuity Scroll from Mayvor's (32 gold)
- [x] Crafted Leather Boots from Gueldar's (5 gold)
- [x] Aylorian Dirk from Xena's (20 gold)
- [ ] Red Apple from Kimr's Farm (need to find the orchard/tree)
- [ ] Reed Flute from Sen'narre Lake (need to explore that area)
- [ ] Optional: Brewington Special from Beer Goblins

## Next Steps
1. Find red apple at Kimr's Farm (explored fields but no apple tree found yet - try farmhouse or orchard areas)
2. Travel to Sen'narre Lake for Reed Flute
3. Return items to Vladia to complete Economics training
4. Finish remaining academy lessons (Communications, Customization, Social, Geography, Career)
5. Train INT with spare trains and measure damage change (stat experiment)
6. Fill empty equipment slots (already have boots from shopping, need to wear them)
7. Practice new spells as they unlock at higher levels (Chill Touch at 4, Continual Light at 5)
8. Request a quest once academy is done
9. Visit Mage Guild to practice/train
