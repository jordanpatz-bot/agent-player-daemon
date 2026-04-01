# Sendivog Discovery Session Report
**Level 7 -> 10 Human Mage (Elementalist) on Aardwolf MUD**
**Date: 2026-03-30**

## Summary
Started at level 7 with 35 unspent trains, 30 practices, starving/dehydrated, and 12+ empty equipment slots. Ended at level 10 with all stats trained, spells practiced, gear equipped, quest completed, and 51 total kills. Gained 3 levels in a single session.

## Audit Findings Addressed

### Food/Water (RESOLVED)
- **Problem**: Hunger 0 (Starving), Thirst 0 (Dehydrated)
- **Solution**: `runto bakery` -> buy 10 bread -> eat 4 (full). `runto groceries` -> buy carrion crawler water skin -> gulp 3x (bloated).
- **Discovery**: Bread costs 2 gold. Water skin costs 5 gold. "gulp" drinks until full. Being fed/hydrated is critical for regen rate.

### Spell Practice (RESOLVED)
- **Problem**: 6 spells at 1% (unpracticed), only Magic Missile at 85%
- **Solution**: `runto mage` to Black Cat Tower (Mage guild) -> practice all spells to 85%
- **Spells practiced**: Chill Touch, Shield, Sleep, Detect Invis, Detect Magic, Dodge, Continual Light, Scrolls, Wands, Staves, Underwater Breathing, Night Vision (lv8), Burning Hands (lv9), Blur (lv9)
- **Remaining**: Spook needs 1 more practice. Exotic/Spear/Whip weapon skills left at 1% (not mage-relevant).
- **Total practices spent**: 29 of 30 original + 10 gained from levels = 39. Have 2 remaining.

### Stat Training (RESOLVED)
- **Problem**: 35 unspent trains
- **Starting stats**: STR 15, INT 18, WIS 16, DEX 15, CON 15, LCK 15
- **Allocation strategy**: Max INT first (primary mage stat), then distribute to WIS/CON/DEX/LCK
- **Final stats at level 9**: INT 38 (MAXED), WIS 27, CON 23, DEX 18, LCK 18, STR 15
- **Note**: Help file says NOT to train HP/mana/moves until level 200 -- the cost is 2 trains per point vs 1 for stats.
- **Observation**: INT training did NOT change hitroll/damroll directly. INT's benefit appears to be in spell damage/success rate and practice efficiency. Hitroll 30, Damroll 22 unchanged.

### Equipment (PARTIALLY RESOLVED)
- **Problem**: 20 of 24 slots empty
- **Progress**: Now 13 of 24 empty (7 filled)
- **Equipped**: Tough leather cap (head), jerkin (torso), sleeves (arms), gloves (hands), pants (legs), boots (feet) from Gueldar's Armory. Viper Skin Belt (waist). Aylorian Shield + Dirk. Halfling messenger's cloaks x2 (neck slots). Torch (light).
- **Still empty**: Eyes, ears (2), back, body, wrists (2), fingers (2), held, floating
- **Discovery**: "wear all" is useful. Gueldar sells leather armor at levels 1 and 6. The "tough" (lv6) versions are better. Item names like "Gueldar's" with apostrophes require using `2.jerkin` syntax for disambiguation.
- **Looted items**: Halfling messenger's cloak (worn on neck), tattered green dress (lv12), silver dagger (lv10), wooden cross (lv13) -- too high level to use yet.

### Quest System (COMPLETED 1 QUEST)
- **Quest**: Kill a piranha in underwater cave near Tournament Camps
- **Path**: recall -> runto camps -> n -> n (central square) -> d (underground lake) -> n (piranha was here)
- **Reward**: 12+1 quest points + 2590 gold + 13 bonus QP from daily blessing
- **NPCs discovered**: Questor (questmaster in Aylor, "Among the Philosophes"), Radel (tournament signup in Camps), lonely old man, Grizrol (grocer), Lerp (baker), Gueldar (armorer), Master of Novices (mage trainer)

### Audit Suppression
- Suppressed `quest-available` finding (quest timer counting down after completion)

## Experiments Run

### Spell Damage Comparison
| Spell | Damage | Mana Cost | Dmg/Mana | Notes |
|-------|--------|-----------|----------|-------|
| Magic Missile | 24-29 avg | 6 | ~4.4 | More mana efficient |
| Chill Touch | 26-48 avg ~40 | 10 | ~4.0 | Higher burst, one-shots most mobs |
| Burning Hands | Not tested yet | ? | ? | Just learned at lv9 |

**Conclusion**: Chill Touch is the preferred spell for one-shotting trash mobs. Magic Missile is slightly more mana-efficient but lower burst.

### Shield Spell
- Cost: 8 mana
- Effect: +12 resistance to all magic for 9:27
- Observation: Did not prevent melee damage from wolf (still took 2-4 per hit). Purely magic resistance.

### Level-Up Rewards
| Level | HP | Mana | Moves | Prac | Train | Bonus |
|-------|-----|------|-------|------|-------|-------|
| 8 | +17 | +22 | +16 | +5 | +3 | +1 INT bonus |
| 9 | +18 | +22 | +15 | +5 | +5 | +1 lucky extra train |
| 10 | +14 | +22 | +16 | +5 | +6 | - |

### Mana Economy
- Full mana pool: 335 at level 9
- Chill Touch costs 10 mana = 33 casts per full pool
- Regen while standing is slow (~2-4 mana per tick)
- Food/water being full is critical for regen rate
- Academy potions in inventory (Healing, Refresh, Black Lotus) available for emergencies

## Areas Explored
- **Aylor (home city)**: Recall point, shops (bakery, groceries, armory), mage guild (Black Cat Tower), questmaster (Among the Philosophes)
- **Tournament Camps**: South entrance, village with tents, central square (Radel, messengers, old man), underground lake, forest edge. Good mob density for leveling.
  - Best XP mobs: Wolves (84+ XP), elves (80+ XP), messengers (42-45 XP)
  - Weak mobs: Bugs, rats, quicklings (~20-30 XP)

## NPCs Discovered
- **Radel** (Tournament Camps central square): Runs a tournament, says "sign me up"
- **Master of Novices** (Black Cat Tower, Mage guild): Train stats and practice spells
- **Questor** (Among the Philosophes, Aylor): Quest giver
- **Gueldar** (Armory, Aylor): Sells leather armor
- **Lerp** (Bakery, Aylor): Sells food
- **Grizrol** (Grocery, Aylor): Sells water skins, boxes, lanterns
- **Old man** (Tournament Camps): "Beckons you to listen" -- not yet interacted

## Communication with Teammates
- Told Artephius: "Practiced all spells, trained INT to max 37, bought tough leather gear. Got a quest to kill a piranha near Tournament Camps."
- Told Zosimos: "Nice work! I maxed INT at 37, practiced all combat spells. Got gear from Gueldar."
- Artephius reported: "Got myself maxed on STR 40, DEX 30, CON 34. All skills at 85%. Had to fail my quest to Fort Terramire - needed a boat."
- Zosimos reported: "Just got my skills practiced at the Tower of Whispers. Found a belt in my inv."

## Things I Couldn't Figure Out
1. **Equipment for remaining empty slots**: Eyes, ears, back, body, wrists, fingers, held, floating -- no shops found selling these. May need to find them as drops or in other areas.
2. **Wimpy setting**: Still at 0. Should probably set this to auto-flee at low HP.
3. **Party/group system**: Audit keeps suggesting grouping but haven't tested it yet.
4. **Burning Hands vs Chill Touch**: Need to test damage comparison.
5. **Blur spell effect**: Practiced but not yet cast to see what it does.
6. **Spook spell**: Still at 1% (need 1 more practice).
7. **Tournament sign-up**: Radel offered tournament but didn't investigate further.
8. **The old man at camps**: Haven't spoken to him yet.
9. **INT vs spell damage relationship**: Trained 19 points of INT but couldn't measure direct damage increase since no baseline before training was recorded.

## Current State (Level 10)
- **HP**: 296 max | **Mana**: 357 max | **Moves**: 637 max
- **Stats**: STR 15, INT 44(38), WIS 27, DEX 20(18), CON 25(23), LCK 19(18)
- **Gold**: ~13,090 | **Quest Points**: 82 | **TNL**: 953
- **Kill Count**: 51 total (29 this session)
- **Practices**: 7 remaining (2 + 5 from level 10) | **Trains**: 6 remaining (from level 10)
- **Key spells**: Chill Touch 85%, Magic Missile 85%, Shield 86%, Burning Hands 85%, Blur 85%
- **New spells at level 10**: Check with "spells" command next session
- **XP bonus**: Superhero event (double XP) + daily blessing = triple XP was active for most kills
- **Loot**: 4x halfling messenger's cloak (2 worn on neck), silver dagger (lv10 -- can equip now!), tattered green dress (lv12), wooden cross (lv13)
