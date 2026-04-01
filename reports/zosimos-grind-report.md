# Zosimos Grind Report - Session 2
**Date:** 2026-03-30 ~19:00-20:10 UTC
**Character:** Zosimos the Ninja, Level 7 Human Thief (408 TNL to Level 8)
**Role:** DPS
**Goal:** Reach Level 10

## Levels Gained
- Started: Level 3 (699 TNL)
- Ended: Level 7 (601 TNL)
- Levels gained: 4 (3 -> 4 -> 5 -> 6 -> 7)
- Total kills this session: 31 (blackboard tracked)

## XP Sources
- **Primary:** Academy Gardens mob grinding with double XP blessing
  - Toads: ~150 XP base + ~150 bonus = ~300 XP per kill (best garden mob)
  - Beetles: ~115 XP base + ~115 bonus = ~230 XP per kill
  - Lizards: ~126 XP base + ~151 bonus = ~277 XP per kill (rare kill bonus)
  - Bees/mice/worms: 40-80 XP base (lower value targets)
- **Quests:** Failed 2 quests (Sen'narre Lake navigation impossible, Infestation maze too complex)
- **Daily blessing:** Critical XP multiplier - doubles every kill's XP. 46 bonus kills remaining.

## Skills Unlocked
- Level 3: Misdirection (practiced to 85%)
- Level 5: Haggle (not yet practiced)
- Level 6: Nimble Cunning (not yet practiced)
- Level 7: Kick (not yet practiced)
- **Level 9 (upcoming):** Hide, Circle - THIEF IDENTITY SKILLS
- **Level 10 (upcoming):** Hand to Hand, Mace

## Skills Practiced
- Dodge: 85% (expert)
- Dagger: 92% (expert)
- Misdirection: 85% (expert)
- Others still at 1%

## Stats Trained
- Dexterity: Trained from base 17 to 20 (+ bonus point at level up = 21 base, 27 current)
- 34 trains remaining, 31 practices remaining

## Best Hunting Areas
- **Academy Gardens (west side):** Best for levels 3-7. Toads, beetles, lizards, bees, mice, worms. Easy one-shot kills. Problem: Low mob density, long respawn timers. Must loop between 4-5 rooms.
- **The Infestation (runto infestation):** Level 5-35 area. Has Forest of Illusions (maze), Wasp Nest (vertical). Harder to navigate but better XP per mob. Needs more exploration.
- **The Graveyard (runto graveyard):** Level 5-15 area. Found the gates but mobs were sparse in initial rooms. Needs deeper exploration.

## Navigation Issues (Architecture Bugs/Notes)
1. **Overworld navigation is hard via IPC:** The Mesolar overworld map uses graphical symbols (<, >, [?], etc.) for zone entrances. Navigating to specific tiles is trial-and-error. `runto` takes you to the overworld entrance but not INTO the zone.
2. **Sen'narre Lake unreachable:** `runto Sennarre` drops you on the overworld near Big Tree Lake. The actual zone entrance requires navigating the overworld map, but water tiles block paths and the `<` zone entrance markers are not directly steppable.
3. **Quest mob finding:** `where <mob>` shows the room name but navigating maze areas (Forest of Illusions) to find specific mobs is extremely difficult via IPC.
4. **Blackboard level bug:** The blackboard `level` field remained at 1 throughout the session even though the actual level is 7. The GMCP data may not be updating the level field correctly.

## Reflex Engine Observations
- **Auto-rest at 40% HP idle:** Did not trigger (HP stayed near max, garden mobs barely scratch)
- **Auto-heal with quaff heal at 50%:** Did not trigger (never dropped that low)
- **Auto-flee at 25%:** Did not trigger (never in danger)
- Toads occasionally hit for 2-3 damage. With 244 HP, never in any danger.
- Misdirection and Dodge both fired correctly during combat, deflecting attacks.

## Social Interactions
- **Artephius (tank/warrior):** Claims to be level 8 already! Coordinated via tells. Both grinding near Aylor.
- **Sendivog (healer/mage):** Level 4, grinding graveyard with daily blessing.
- **Newbie channel:** Observed MoonlitDusk asking about inventory, SirDunk and helpers responding.
- **Other players at Aylor recall:** SirDunk, Mycelico, Ectosheath, Tanto, Ordonis, Rhizome all seen.
- **Cyanojen** seen at questmaster location.

## Room Graph Size
- World model not fully accessible via IPC getWorldModel (permission denied on first attempt)
- Rooms explored: Academy (8+ rooms), Aylor city (10+ rooms), Mesolar overworld (15+ tiles), Infestation (10+ rooms), Graveyard (3 rooms)
- Approximate graph: 50+ unique rooms visited

## Coordination with Teammates
- Artephius: Shared hunting strategy (gardens + blessing), offered to meet at recall after quests
- Sendivog: Shared double XP blessing discovery, coordinated quest timing

## Stealth Skills (Not Yet Unlocked)
- Hide: Level 9 (2 levels away)
- Circle: Level 9 (2 levels away)
- Sneak: Level 13
- Will test thoroughly when they unlock. Key question: How does hide/sneak state propagate through IPC? Does the blackboard track stealth state?

## Next Steps
1. Practice Kick, Haggle, Nimble Cunning (31 practices available)
2. Continue grinding Academy Gardens or find better level 7+ areas
3. Complete quests in nearby areas (avoid Sen'narre Lake and deep mazes)
4. Reach level 9 for Hide/Circle - major thief milestone
5. Train more DEX (34 trains available)
6. Consider grouping with Artephius for harder content

## Key Architecture Issues for Future Sessions
1. **`runto` drops you on overworld, not in zone:** Every `runto <area>` puts you on the Mesolar overworld near the entrance, but you must then navigate the overworld tiles to find the actual zone entrance. This is extremely difficult to automate via IPC because overworld navigation uses map symbols that are hard to parse.
2. **Academy garden mob density too low:** At level 7, the gardens have ~3-5 mobs spread across 6 rooms with slow respawn. Need higher density areas.
3. **`follow` command unintentionally triggered:** When another player is in the room and you run `follow <name>`, the character automatically follows them. Combined with group join, this can pull you out of your grinding area.
4. **Blackboard level field stuck at 1:** The GMCP pipeline does not correctly update the level field. Score shows level 7 but blackboard shows level 1.
5. **Superhero bonus XP:** A global event (player reaching superhero) gives 15 minutes of double XP to everyone. This stacks with daily blessing for effectively triple XP. Should prioritize killing during these events.

## Session Statistics
- Session duration: ~70 minutes
- Levels gained: 4 (3 -> 7)
- Levels per hour: ~3.4
- Total kills tracked: 33 (blackboard), actual likely higher
- Gold earned: ~600 gold (7094 -> 7682)
- Daily blessing remaining: 46 double XP kills, 62 bonus gold kills
- Hitroll: 63 (doubled during session, possibly from equipment or buff)
- Time spent navigating vs killing: roughly 60% navigation, 40% killing. Major efficiency bottleneck.
