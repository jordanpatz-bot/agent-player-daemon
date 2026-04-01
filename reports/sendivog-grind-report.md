# Sendivog Grind Report - Session 1

## Character Status (UPDATED)
- **Name**: Sendivog, Level 5 Human Mage (Elementalist)
- **HP**: 215/215 | **Mana**: 246/246 | **Moves**: 560/560
- **TNL**: 766 (to level 6)
- **Gold**: ~10,600 | **Quest Points**: ~56
- **Kill Count**: ~12 mobs this session
- **Daily Blessing**: 63 double-XP kills remaining

## Levels Gained
- **Level 2 -> 3**: Killed quest target (tiny red imp) on Grandmarket Boulevard, Aylor. 152 XP + 152 blessing bonus = 304 XP.
- **Level 3 -> 4**: Killed 2 bats and 1 undead slayer in The Graveyard. Combined ~1100 XP with daily blessing doubles.
- **Level 4 -> 5**: Killed 1 maggot + 1 banshee in the Wooded Grove area of the Graveyard. ~680 XP with blessing.

## XP Sources (ranked by efficiency)
1. **Quests**: Best XP source. First quest gave quest completion reward (21 QP + 2585 gold) plus the kill XP. 30-minute cooldown between quests.
2. **Daily Blessing**: Double XP on next 70 kills (65 remaining). Massive multiplier.
3. **Mob kills**: ~100-200 base XP per kill at Graveyard (level 5-15 area). Doubled by blessing = 200-400 effective XP.
4. **Rare kill bonus**: Extra 20-50 XP on first kills of mob types.

## Spells Unlocked/Practiced
- **Magic Missile** (Level 1): Expert proficiency. 16 mana, primary damage spell. One-shots weak mobs, 2-3 casts for stronger ones.
- **Shield** (Level 3): 63% proficiency. Defensive buff, ~14 mana cost.
- **Chill Touch** (Level 4): Not yet practiced. Need to check mana cost.
- **Dodge** (Level 1): 63% proficiency. Passive avoidance.
- **Blink** (Level 1): 50% proficiency. Passive avoidance (saw it proc in combat).

Practices remaining: 14. Trains remaining: ~21.

## Mana Management
- Max mana: 221 at level 4
- Magic Missile costs 12-16 mana per cast
- Can cast ~12-13 magic missiles before needing to rest
- Mana regen while sleeping: ~11 per tick (roughly every 30 seconds)
- Full mana recovery from empty: ~5-6 minutes sleeping
- **Auto-rest reflex**: Did NOT trigger during this session. Mana never dropped below 60% during combat. The 15% threshold may be too low for a caster - could benefit from a 30-40% threshold.

## Areas Hunted
1. **Grandmarket Boulevard, Aylor**: Quest target only. No grindable mobs.
2. **The Graveyard (5-15)**: Decent area for level 3-4. Mob types: bats, ravens, undead slayers, ghosts, maggots, grave rats. Mob density is moderate - need to sweep multiple rooms. Crypt of Souls has additional rooms but sparse mobs. Mobs take 5-10 minutes to respawn.

## Room Graph Size
- **105 rooms** explored and mapped in world model
- Zones covered: academy, aylor, mesolar, graveyard
- Aylor is well-mapped (recall point, questmaster, mage guild, grandmarket)

## Coordination Log
- Artephius (Tank/Warrior): Level 4 from daily blessing. Recommended Graveyard. Grinding there too.
- Zosimos (DPS/Thief): Level 3, got quest to kill dandelion near Sen'narre Lake. Has double XP for 72 kills.
- Spotted Zosimos passing through Mesolar continent (Ocean of Grass room).
- Not yet grouped - solo questing is more efficient at these levels since quest kills must be solo.

## Architecture/Bug Notes
- **World model**: Working correctly. Tracks rooms, exits, zone names, terrain types. 105 rooms mapped.
- **Blackboard**: HP/mana/moves updating in real-time. Kill count tracking works.
- **IPC commands**: Responsive, commands execute within 2-3 seconds.
- **Shared state**: Quest point and gold tracking accurate in world model.
- **Reflex engine**: Auto-rest at 15% mana did NOT fire (never got that low). Auto-heal and auto-flee not tested (never took significant damage). The blink/dodge reflexes are character abilities, not daemon reflexes.
- **Potential bug**: The `where` command and `hunt` command work for finding quest targets, but `hunt` skill at 0% gives inaccurate directions ("You have no idea what you're doing"). Should practice hunt skill or use `where` instead.
- **Move points**: Travel between areas (recall + runto) costs ~200-300 moves. At 545 max, this limits how many areas you can visit per rest. Could benefit from the `fly` spell at higher levels.

## Next Steps
1. Wait for quest cooldown (~20 min remaining), then do another quest
2. Keep grinding Graveyard mobs between quests
3. Practice Chill Touch when at trainer
4. Consider grouping with Artephius for harder content at level 5+
5. Look into Sen'narre Lake area for potentially denser mob spawns
6. At level 5, new spells unlock - check `allspells mage` output for level 5 spells

## Session Timeline
- 15:02 - Logged in, Academy Treasury
- 15:06 - Claimed daily blessing (double XP 70 kills, double QP 2 quests, +14 QP, +1 Wis, +1 Int)
- 15:07 - Practiced magic missile to expert, ran to questmaster
- 15:08 - Quest received: kill tiny red imp on Grandmarket Boulevard
- 15:11 - Quest target killed, LEVEL 3
- 15:12 - Quest completed (21 QP + 2585 gold), practiced shield/dodge at Mage Guild
- 15:14 - Arrived at Graveyard, started mob grinding
- 15:15 - Killed 2 bats + 1 undead slayer, LEVEL 4
- 15:16 - Killed 1 raven, continued sweeping
- 15:18 - Explored Crypt of Souls
- 15:20 - Resting, writing report.
- 15:23 - Killed maggot, found Artephius in graveyard
- 15:24 - Killed banshee in Wooded Grove, LEVEL 5
- 15:25 - Continuing graveyard sweep, coordinating with Artephius for group play
- Quest cooldown: ~15 min remaining, then another quest for massive XP

## Rate of Progress
- Level 2 -> 5 in ~22 minutes of play
- At this rate, level 10 should be achievable in ~2-3 more sessions
- Key accelerators: daily blessing (double XP), quests, rare kill bonuses
- Bottleneck: quest cooldown (30 min) and graveyard mob respawn rate
