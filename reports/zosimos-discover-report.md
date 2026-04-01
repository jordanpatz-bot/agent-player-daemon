# Zosimos Discovery Report - Level 7 to 9

## Session Summary
Started as a Level 7 Ninja with 31 practices, 34 trains, starving, dehydrated, barely equipped. Ended as Level 9 with Circle and Hide unlocked, fully fed/hydrated, geared up, skills practiced.

## Audit Findings Investigated

### 1. Starvation & Dehydration (FIXED)
- **Bakery** (`runto bakery`): The Aylorian Eatery sells bread (2g), donuts, pot pie, cookies. Bread is cheapest. Easter Eggs from the grocery are containers, NOT food -- "You would probably choke" when trying to eat them.
- **Grocery** (`runto groceries`): Grizrol's Grocery sells water skins (5g pre-filled), small bags, lanterns, torches.
- **Fountain**: Academy Courtyard Fountain at `recall; run u3n`. Drinking directly from fountain works. Each drink fills thirst significantly. `gulp` command drinks until full.
- Fed/hydrated to 100%/100%.

### 2. Empty Equipment Slots (PARTIALLY FIXED)
- **Viper Skin Belt**: Was already in inventory from previous kills in the Gauntlet area (confirmed by Artephius via tell). Equipped it -- gives good stats.
- **Dark Beetle Shell**: Was in inventory. Score 55, shield slot. Gives +25 HP, +3 CON, +1 WIS, +1 DEX. Replaced the Aylorian Shield.
- **Toad Skin Leggings**: +1 LUCK, +1 DEX, +12 Moves. Replaced Gueldar's crafted leather pants.
- **Lizard Scale Armband**: +stats, wearable on arms.
- **Gueldar's Armory** (`runto armory`): Sells Level 1 (crafted) and Level 6 (tough) leather armor for all slots. Bought and equipped:
  - Tough leather cap (head, 25g)
  - Tough leather boots (feet, 20g)
  - Tough leather gloves (hands, 10g)
  - Tough leather sleeves (arms, 20g)
  - Tough leather jerkin (torso, 50g)
- Still empty: eyes, ears (2), neck (2), back, around body, wrists (2), fingers (2), floating. These likely need drops or quest rewards.

### 3. Unspent Practices (FIXED)
- **Thief Guild** (`runto thief`): "In the Tower of Whispers" with trainer Nandi Eight-Fingers.
- All skills practiced to 85% (costs 3 practices each, except Recall at 2):
  - Level 1: Dagger (92%), Dodge, Exotic, Kobold Stench, Recall
  - Level 3: Misdirection, Whip
  - Level 4: Underwater Breathing
  - Level 5: Haggle
  - Level 6: Nimble Cunning
  - Level 7: Kick
  - Level 9: Circle, Hide (NEW!)
- 10 practices remaining for future skills.

### 4. Unspent Trains (PARTIALLY SPENT)
- Trained at the Thief Guild:
  - DEX: 21 -> 26 base (35 with gear, was 27)
  - LUCK: 15 -> 20 base (22 with gear)
  - STR: 16 -> 21 base
- Each stat point costs 1 train at these levels.
- Help says do NOT train HP/mana/moves until level 200+.
- 32 trains remaining.

### 5. Belt Mystery (SOLVED)
- Artephius confirmed via tell: "The Viper Skin Belt was in my inventory from kills in the Gauntlet area."
- It was already in Zosimos's inventory too -- just needed to `wear all`.

### 6. Quest System (ATTEMPTED)
- **Questmaster** (`runto questor`): "Among the Philosophes" in Aylor. Master Questor gives kill quests.
- Got quest: Kill a unicorn in The First Ascent area.
- Explored The First Ascent extensively (prison-themed dungeon, levels 5-15). Need a dragonscale key (500g from Bagger at entrance) to enter.
- Could not find the unicorn despite thorough exploration of lower passageways, cell blocks, power rooms, and upper prison. Quest target mobs can apparently wander or be in rooms I didn't check.
- Failed the quest (lost quest points but wait time only 15 min).
- Lesson: Quest target rooms are hints, not exact locations. Need to search the full area more systematically.

## Combat Observations
- **Kick**: 9-14 damage, works as a bonus attack skill.
- **Misdirection**: "You misdirect X's attack" -- avoids damage entirely, similar to dodge.
- **Dodge**: Working well -- "You dodge X's attack."
- **Stab damage**: 25-26 per hit with Aylorian Dirk.
- **Circle**: Level 9 skill, now practiced. Need to test in combat.
- **Hide**: Level 9 skill, now practiced. Need to test stealth mechanics.
- Vermin in The First Ascent give ~230 XP each (with double XP + daily blessing + rare kill bonus).
- Sphinx and harpy also good XP sources.

## Key NPCs & Locations Found
| Location | NPC | Purpose | How to Get There |
|----------|-----|---------|-----------------|
| Grizrol's Grocery | Grizrol | Water skins, bags, torches | `runto groceries` |
| Aylorian Eatery | Lerp | Food (bread, donuts, etc.) | `runto bakery` |
| Gueldar's Armory | Gueldar | Leather armor (L1 & L6) | `runto armory` |
| Xena's Weapon Parlor | Xena | Weapons (L1 & L9) | `runto weapons` |
| Tower of Whispers | Nandi Eight-Fingers | Thief trainer (practice/train) | `runto thief` |
| Among the Philosophes | Master Questor | Quests | `runto questor` |
| Academy Courtyard | Fountain | Drinking water | `recall; run u3n` |
| The First Ascent | Bagger (entrance) | Dungeon (L5-15), key required | `runto ascent` |

## Shops Not Yet Explored
From `find all` in Aylor: Bank, Blacksmith, Boats, Catering, Chapel, Enchanter, Forge, Healer, Identify, Library, Lottery, Pets, Potions, Scrolls, Arena, and more.

## Social Interactions
- Told Artephius about belt, gear, and leveling. He confirmed belt origin.
- Told Sendivog about skills practiced and exploring.
- Saw Sendivog at grocery (buying water) and questor.
- Saw Trismegist at recall (new player?).
- Saw Cyanojen at the questor.

## Things That Confused Me
1. Easter Eggs are containers, not food. "You would probably choke on a HUGE Easter Egg."
2. `wear jerkin` picked the wrong jerkin when I had two -- needed `wear tough` to get the level 6 version.
3. The First Ascent navigation is confusing -- upper level (cells, bull pen, elevator) vs lower level (passageway, power rooms, catwalk). Quest targets can be hard to find.
4. `runto trainer` doesn't work -- need to use `runto thief` or `runto mage` etc. for guild-specific trainers.
5. The armband is "arms" wear location but tough leather sleeves replaced it. Can't wear both on arms.

## Current Status (Level 9)
- **HP**: 294 | **Mana**: 273 | **Moves**: 688
- **STR**: 21 | **INT**: 16 | **WIS**: 16 | **DEX**: 35 | **CON**: 20 | **LUCK**: 22
- **Gold**: 5,522 | **Trains**: 32 | **Practices**: 10
- **Kill Count**: 39 | **TNL**: 690
- **Skills**: Dagger 92%, all others 85% (Dodge, Exotic, Kobold Stench, Recall, Misdirection, Whip, Underwater Breathing, Haggle, Nimble Cunning, Kick, Circle, Hide)

## Next Steps
1. Test Circle and Hide in combat -- how do they work?
2. Level 10 gives Hand to Hand and Mace.
3. Explore more Aylor shops (Potions, Healer, Blacksmith).
4. Fill remaining empty equipment slots from drops.
5. Try another quest with better area knowledge.
6. Save trains for later -- consider training more DEX or LUCK.
