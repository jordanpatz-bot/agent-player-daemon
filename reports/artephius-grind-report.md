# Artephius Grind Report - Level 2 to 8

**Session Date:** 2026-03-30 (15:02 - 15:25 game time)
**Character:** Artephius, Level 8 Human Warrior (Barbarian)
**Role:** Tank
**Goal:** Reach Level 10

## Summary

Started at Level 2 in The Academy Treasury. Reached Level 8 in approximately 23 minutes of active play. 41+ kills, 1 quest completed, 98 rooms mapped. Currently 536 TNL from Level 9 with 26 daily blessing bonus kills remaining.

## Levels Gained and XP Sources

| Level | Source | Notes |
|-------|--------|-------|
| 2 -> 3 | Daily Blessing instant level | Free level from `daily blessing` |
| 3 -> 4 | Daily Blessing instant level | Free level from `daily blessing` |
| 4 -> 5 | Mob kills + quest completion | Toad rare kill + quest XP pushed over |
| 5 -> 6 | Mob kills (academy gardens) | Field mouse + rabbit kills |
| 6 -> 7 | Mob kills (academy gardens) | Toad + large hare kills |
| 7 -> 8 | Mob kills (academy gardens) | Large hare kill pushed over |

**Daily Blessing was massive:** 2 free instant levels, 65 double XP kills (used ~39), double quest points on 2 quests, free Strength point, trivia point, 10 bonus QP, 1 bonus train.

**Quest completed:** "Kill a field mouse" near Small Pond in The Aylorian Academy. Reward: 20 (+1 human bonus) quest points + 21 bonus from daily blessing + 2580 gold.

## Areas Hunted and Effectiveness

### The Aylorian Academy Gardens (Level 1-201)
- **Mob types:** Rabbits, large hares, small brown toads, field mice, slugs, beetles, golden honeybees, lizards, small fish
- **XP per kill (with 2x blessing):** 20-180 XP depending on mob and rare kill bonus
- **Density:** Good - 3-5 mobs per room in the eastern garden loop
- **Verdict:** Excellent for levels 2-6, decent for 7, diminishing returns at 8+. Respawn rate was slower than kill rate by level 7.

### The Graveyard (Level 5-15)
- **Mob types:** Graverobbers, bats, grave rats, ravens
- **XP per kill (with 2x blessing):** 78-326 XP
- **Density:** Poor - mobs are spread across many rooms, lots of empty tombstone rooms
- **Verdict:** Higher XP per mob but very low density. Graverobbers gave 326 XP at level 5 (best single mob). Not efficient for speed leveling due to travel time between mobs.

### Sen'narre Lake / Mesolar Continent
- **Mob types:** None found (overworld, very sparse)
- **Verdict:** Runto dropped me on the overworld, not in the actual dungeon area. Not efficient.

## Combat Observations

- **Zero deaths.** Artephius barely took any damage throughout the session. At level 8 with 269 HP, academy garden mobs deal 0-3 damage per hit.
- **Parry is excellent.** Practiced to expert level early, parried most attacks.
- **Enhanced Damage** skill unlocked at level 6, practiced to expert. Noticeable damage boost (slice went from DECIMATES ~30 to DEVASTATES ~33).
- **One-shot kills** became common by level 5-6 on academy mobs.
- **Reflexes:** Did not observe auto-heal or auto-flee triggers firing - HP never dropped below 90%. The reflex engine wasn't tested in a meaningful way since nothing was dangerous.

## Stats Trained

- **Strength:** 17 -> 23 (6 trains + 1 daily blessing + 1 level bonus)
- **Constitution:** 15 -> 19 (4 trains)
- **Skills practiced:** Parry (expert), Dodge (79%), Kick (79%), Hand to Hand (79%), Axe (expert), Enhanced Damage (expert), Dagger (30%), Exotic (30%), Flail (30%), Polearm (30%), Mace (not practiced yet)

## Room Graph Growth

- **98 rooms mapped** across zones: academy, aylor, mesolar, graveyard
- Most rooms from Aylor city navigation (runto paths) and academy garden exploration
- Graveyard added significant rooms but low mob density made exploration costly

## Coordination Log

- **Sendivog:** Told them about the Graveyard and to come grind there. They reached Level 4, were in the Graveyard by end of session. Saw them pass through my room.
- **Zosimos:** They were at Sen'narre Lake on a quest to kill a dandelion. Reached Level 5. Encountered them at Land Bordering Big Tree Lake early in session.
- **No formal group created.** Attempted `group create` but never got teammates to follow/join. Each agent grinded independently.

## Architecture Observations

### What Worked Great
- **IPC command system** is reliable and fast. Commands execute in order, results come back cleanly.
- **World model** accurately tracks level, HP, room data, quest status. The `savedAt` timestamps show it updates frequently.
- **Blackboard** state is useful for quick checks without parsing output.
- **`runto` command** works well for navigating to known areas from Aylor.
- **Output buffer** provides full game output for parsing.

### What Was Clunky
- **`kill all` doesn't work on Aardwolf.** Had to target each mob by name individually, leading to many "They aren't here" spam messages when mobs were already dead.
- **No mob detection in room data.** The world model tracks room exits but not which mobs are present. Had to parse output text to find mob names. Would be valuable to have `mobs_in_room` in the world model.
- **Blackboard `level` field stayed at 1** even after reaching level 8. Appears to be a parsing bug - the world model correctly shows level 8 but the blackboard's level value never updated.
- **Kill count discrepancy:** Blackboard shows 41+ kills but world model shows 36. The counts diverged, possibly because the blackboard increments on combat events while the world model tracks differently.
- **No quest tracking in world model.** Quest status (target, location, timer) would be very useful for automation.

### What Broke
- **Nothing critical broke.** The system was stable throughout the session.
- **Move management** was a constant concern - running between areas burns moves quickly. Would benefit from a "rest until full" command or automatic move regen tracking.

## Next Steps to Level 10

- **536 TNL to Level 9.** Need roughly 5-8 more kills at current mob levels, or 1 quest completion.
- **~1000 TNL from Level 9 to 10.** Quest timer should be up soon for another quest.
- **26 daily blessing double XP kills remaining.** Should use these efficiently on higher-level mobs.
- **Strategy:** Request quest when timer expires, complete it for quest XP + kill XP. Alternate between Graveyard (higher XP per kill) and Academy Gardens (higher density) based on respawn timers.
- **Consider Fantasy Fields or Fire Swamp** for level 8-10 mobs that give better XP.

## Reflex Engine Test

**The reflex engine WORKS.** During a dangerous encounter with a level 25-35 cat in Sheila's Cat Sanctuary (accidentally entered via `runto fantasy`), HP dropped to 124/269 (46%) and the reflex engine triggered:
- `reflex_heal` event at 46% HP - auto-healed
- Successfully fled combat
- `recovered` event - HP restored to 93%

This was the only time in the session that reflexes were needed, as all other mobs were trivially easy.

## Session Stats

| Metric | Value |
|--------|-------|
| Starting Level | 2 |
| Ending Level | 8 |
| Levels Gained | 6 |
| Total Kills | 42+ |
| Quests Completed | 1 |
| Gold Earned | ~3,362+ (7,954 -> 11,316+) |
| Quest Points | 52 |
| Rooms Mapped | 100+ |
| Deaths | 0 |
| Fled Combat | 1 (Cat Sanctuary, level 25-35) |
| Session Duration | ~30 minutes |
| Daily Blessing Kills Remaining | 26 |
