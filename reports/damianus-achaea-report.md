# Damianus - Achaea Tutorial Report (Serpent Class)

## Character Summary
- **Name**: Damianus
- **Class**: Serpent (Human)
- **Level**: 6 (Novice rank)
- **Stats at end**: HP 600, Mana 500, Endurance 1600, Willpower 1538
- **Gold**: 500 (in backpack)
- **Lessons remaining**: 135 (spent 15 on Subterfuge)

## Tutorial Flow

### Phase 1: Cell Escape
- Start in a dark dank cell, captured by pygmies
- Old man gives you a key (SAY YES to advance dialogue)
- UNLOCK DOOR NW, then move NW to escape
- Old man betrays you, screams for guards

### Phase 2: Combat Introduction (Punch/Kick/Headslam)
- Pygmy guards attack, tutorial teaches basic melee: PUNCH, KICK, HEADSLAM
- All use 3.5s balance cooldown
- Punch does ~100-144 damage, scales with situation
- Balance system: you attack, wait for balance recovery, attack again
- Jester NPC (Maire) throws a health elixir during the fight
- Armoured mhun NPC (Garesh) helps clear remaining pygmies

### Phase 3: Healing & Tattoos
- DRINK HEALTH / SIP HEALTH uses oaken vial (health elixir)
- Elixir has a cooldown ("sip balance") -- can't spam it
- **Boar Tattoo**: Applied to a body part, auto-heals HP when damaged
  - Activate with TOUCH BOAR (4s balance cost, then runs automatically)
  - Can fade with use, needs re-inking periodically
  - Tattoo body parts: Head, Torso, Left/Right arm, Left/Right leg
  - Check with TATTOOS command

### Phase 4: Serpent Class Abilities
- Taught GARROTE by Maire (used LEARN 15 SUBTERFUGE FROM MAIRE)
- Learned: Rattle, Hide, Scales, Garrote

## Serpent Combat Mechanics

### Primary Attack: GARROTE <target>
- **Damage**: 483 (asphyxiation) -- MASSIVE compared to 100 from punch
- **Balance cost**: 4.6 seconds
- **Requires**: Wielded whip (WIELD WHIP)
- **Special**: Bypasses armor entirely. Auto-hits helpless targets (paralyzed, sleeping, fallen, frozen, etc.)
- **Scaling**: Higher subterfuge skill = more damage
- **KILL command auto-selects garrote** when whip is wielded

### Secondary Attack: BITE <target> [venom]
- Balance: 1.9 seconds
- Requires venom secreted first (SECRETE <venom>)
- Venom only affects adventurers (players), not denizens (NPCs)
- Dozens of venoms available: paralysis (curare), blindness (oleander), damage (sumac), etc.

### Defensive Abilities
- **SCALES**: Covers body in protective serpentine scales (3s balance)
- **HIDE**: Conceals from view (4s balance), EMERGE to reappear
- **Boar Tattoo**: Auto-heals when hurt

### Utility
- **RATTLE**: Encrypted Serpent communication channel
- **DOUBLESTAB**: Two venom strikes with dirk (not yet learned)
- **SLIT**: Throat cut on helpless victim (not yet learned)
- **Wormholes**: Teleport network (not yet learned)
- **Treetop abilities**: Swinging, Scan, Noose (assassination from trees)

## Key Game Systems Discovered

### Balance System
- Every action costs "balance" (shown as 'e' in prompt when lost)
- Balance recovery varies: 3.5s (punch), 4.0s (tattoos), 4.6s (garrote)
- Cannot act while off-balance

### Healing
1. **SIP HEALTH**: Uses health elixir vial, has sip cooldown
2. **Boar Tattoo**: Auto-heals passively when activated
3. **GIVE VIAL TO NPC**: Tutorial NPC refilled empty vials

### Navigation
- WALK TO <destination> for auto-pathing (e.g., WALK TO MINIA, WALK TO PYGMIES)
- PORTALS for fast travel to common areas
- Direction commands: N, S, E, W, NE, NW, SE, SW, UP, DOWN

### Commands Discovered
- SCORE / SCORE FULL: Character stats
- SKILLS: Skill tree overview
- AB <skill>: View abilities in a skill
- AB <skill> <ability>: Detailed ability info
- TASKS: Tutorial quest log
- TASK <#>: Quest details
- HINT: Current tutorial guidance
- SETTARGET <name> / ST: Set default attack target
- KILL: Auto-attack with best ability
- INFO HERE: Room inventory with item IDs
- INVENTORY / INV: Personal inventory
- TATTOOS: View tattoo status
- NEWBIE <question>: Ask on newbie help channel

## Tutorial Progression
1. Cell escape (key, unlock door, move)
2. Basic combat (punch/kick/headslam at 3.5s balance)
3. Health elixir (sip health to heal)
4. Boar tattoo (auto-heal system, touch boar to activate)
5. Class ability (learn subterfuge from Maire, wield whip, garrote)
6. Open world (tasks assigned, walk to minia)
7. Miba Village (fight pygmies, confront Beku)
8. Beku boss fight (too strong at level 6, need level 10)

## Issues / Confusing Points
- **"You cannot move at the moment"** -- Tutorial locks movement during dialogue sequences. Saying YES advances, but it's unclear when you're stuck vs when there's a hidden prompt
- **"Equipment is not a valid command"** -- Audit kept suggesting "equipment" but it doesn't exist; use INV instead
- **Bite didn't work on pygmies** -- "You have no venom in your bloodstream" -- need to SECRETE first, and venoms only work on players not NPCs anyway for bite
- **maxHp/maxMana/etc shown as "100" early on** -- Blackboard values were stale/wrong initially, normalized later
- **Beku put me to sleep** -- Couldn't act, had to WAKE. Sleep is a combat mechanic to watch for
- **Old man had no name I could target** -- "look old man" didn't work, NPC had different identifier

## Teammates
- **Theodorus** (Magi class): Uses fire lash attacks, was in Miba Village fighting alongside me
- **Avicennus**: Also in the area, moved through village

## Next Steps
- Grind to level 10 in Miba Village (pygmy guards give 3370 XP, hunters 140 XP)
- Return to confront Beku
- Learn more Subterfuge abilities (need 12 more lessons for Evade)
- Learn Venom abilities for PvP (secrete + bite combo)
- Explore Hypnosis skill (gained at class embrace)
- Complete remaining tutorial tasks (shops, emotes, etc.)
