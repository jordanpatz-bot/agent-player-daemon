# Theodorus - Achaea MUD Discovery Report
## Human Magi, Level 5 (as of tutorial completion)

### Character Status
- **Name:** Theodorus
- **Class:** Magi
- **Race:** Human
- **Level:** 5 (need level 10 to fight Beku)
- **HP:** 550 / **Mana:** 500 / **End:** 1400 / **Will:** 1400
- **Gold:** 500 (in backpack)
- **Lessons remaining:** 135 (spent 15 on Elementalism)
- **Location:** Miba Village, Chief Beku's council room
- **Active quest:** Reach level 10, defeat Beku the pygmy chieftain

### Tutorial Progression
1. Started in dark cell, captured by pygmies. Old man NPC gave exposition.
2. Used a key to UNLOCK DOOR NW and escape.
3. Fought pygmy guards with PUNCH/KICK/HEADSLAM (basic melee).
4. Met Garesh (blademaster NPC) and Maire (jester NPC) - tutorial companions.
5. Followed Garesh through dungeon, fighting more pygmies.
6. Received a **boar tattoo** on right arm (health regen via TOUCH BOAR).
7. Got health and mana elixir vials (SIP HEALTH / SIP MANA).
8. Learned 15 lessons in Elementalism from Maire, gaining **Firelash** spell.
9. Traveled to Land of Minia via WALK TO MINIA (auto-walk).
10. Found Miba Village via WALK TO PYGMIES.
11. Confronted Beku - he knocked me out and tied me up. Need level 10 to beat him.

### Magic System - HOW IT WORKS (Very Different From Other MUDs)

**Magi Class Skills:**
- **Elementalism** - Core offensive magic. Opens channels to elemental planes.
- **Crystalism** - Crystal vibrations, utility, crowd control.
- **Artificing** - Gained later upon "embracing class."

**Channel System (Key Mechanic):**
- Must CHANNEL AIR/EARTH/FIRE/WATER before using corresponding spells.
- Each channel costs 200 mana and uses equilibrium (1.5s).
- Channels drain willpower over time to maintain.
- CHANNELS command shows active channels.
- SEVER ALL/element to close channels.

**Firelash (My First Combat Spell):**
- Syntax: CAST FIRELASH AT target
- Requires: Fire channel open
- Cost: 120 mana + equilibrium (4.0s)
- Damage: 60-180 fire damage (one-shots tutorial pygmies, enough for village hunters)
- Can hit from adjacent rooms! Can set adventurers ablaze.

**Balance vs Equilibrium (CRITICAL DIFFERENCE):**
- **Balance** = physical actions (punch, kick, move). 3.5s recovery for basic attacks.
- **Equilibrium** = mental/magical actions (spells, channels). 4.0s for Firelash.
- You track both independently - can use both resources at once.
- Prompt shows: `ex` = have both, `e-` = have balance no equilibrium, `x-` = vice versa.

### Combat System
- **KILL** command auto-uses best available attack. Essential shortcut.
- **SETTARGET** or **ST** to set default combat target.
- **SIP HEALTH** / **SIP MANA** to heal (cooldown between sips).
- **WRITHE** to escape bindings/entanglement.
- **STAND** to get up after being knocked prone.
- Damage types observed: physical cutting, physical blunt, fire.
- Enemies can sleep you, bind you, knock you prone.

### Tattoo System
- Tattoos provide persistent buffs/abilities.
- **Boar tattoo** = health regeneration (activated via TOUCH BOAR).
- 6 body slots: Head, Torso, Left arm, Right arm, Left leg, Right leg.
- Tattoos are magical - no needle, applied by tattooist NPCs/players.

### Navigation
- **WALK TO location** = auto-walk. Works for areas like MINIA, PYGMIES.
- **PORTALS** = teleport to common areas if lost.
- Standard compass directions: N, S, E, W, NE, NW, SE, SW, UP, DOWN.

### Economy
- Gold sovereigns (got 500 from tutorial pygmies).
- PUT GOLD IN PACK to store safely.
- Credits, Lessons, and other currencies exist.

### Skills & Lessons
- 150 starting lessons. Spent 15 on Elementalism.
- Next Elementalism ability (Fortification) costs 52 more lessons.
- Next Crystalism ability (Dissipate) costs only 7 lessons.
- LEARN X SKILLNAME FROM npc to spend lessons.

### Teammates Spotted
- **Avicennus** - Seen at Minia archway and following me to Miba Village.
- **Damianus** - Seen at Miba Village entrance. Wields an iron-tipped whip. Was fighting pygmies alongside me.
- Both seem to be doing the same tutorial quest chain.

### What Broke / Confused Me
1. **Tutorial timer locks** - The tutorial holds you in place ("You cannot move at the moment") while NPCs deliver scripted dialogue. This means you have to wait and keep trying SAY YES / NW repeatedly. Very slow for automated play.
2. **"talk" is not a command** - NPC interaction is via SAY, GREET, or just waiting for scripted dialogue.
3. **Beku sleep attack** - I tried to Firelash Beku and he put me to sleep instantly. Had to WAKE, WRITHE, STAND. Need level 10 first.
4. **Fire channel drains willpower** - Keeping channels open has an ongoing willpower cost. Need to watch this resource.
5. **Mana management** - Firelash costs 120 mana, Channel Fire costs 200 mana. Need to SIP MANA regularly.
6. **Blackboard maxHp/maxMana show "100"** - The daemon's blackboard tracking for max values seems broken/stale. Real maxHP is 550, but blackboard says 100.

### Key Elementalism Abilities (Not Yet Learned)
From the full ability list I read:
- **Fortification** - Protect channels from attack
- **Scry** - Locate another adventurer
- **Resonance** - Access to Elemental Planes spells
- **Deepfreeze** - Cold damage spell
- **Stormhammer** - Multi-target lightning
- **Holocaust** - Delayed massive explosion
- Higher order spells require "resonance" with Elemental Planes (risk involved)
- Resonant spells include: Gust, Firelash, Freeze, Geyser, Dehydrate, Fulminate, Bombard, etc.

### Key Crystalism Abilities (Partially Available)
- **Refine** - Create crystal from Master crystal
- **Embed** - Embed crystalline vibrations
- **Spin** - Set crystals spinning
- **Vibes** - See room vibrations
- Crystalism seems to be about placing vibrating crystals that affect rooms/areas.

### Next Steps
1. Grind pygmies in Miba Village to reach level 10.
2. Spend remaining 135 lessons (probably split between Elementalism and Crystalism).
3. Learn more spells - especially want Freeze, Fulminate, Stormhammer.
4. Return to defeat Beku and continue the main quest.
5. Check TASKS for other XP-granting activities.
6. Consider partying with Avicennus and Damianus for group XP.

### Commands Reference
| Command | Purpose |
|---------|---------|
| KILL | Auto-attack with best ability |
| ST target | Set combat target |
| CAST FIRELASH AT target | Fire damage spell |
| CHANNEL FIRE/AIR/EARTH/WATER | Open elemental channel |
| SIP HEALTH / SIP MANA | Heal HP or mana |
| TOUCH BOAR | Activate boar tattoo regen |
| WRITHE | Escape bindings |
| WALK TO location | Auto-walk to known area |
| TASKS | View task list |
| HINT | Get tutorial guidance |
| NEWBIE question | Ask on newbie help channel |
