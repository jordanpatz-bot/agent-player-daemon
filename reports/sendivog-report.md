# Sendivog (Mage/Elementalist) - Playtest Report

## Character Summary
- **Name**: Sendivog
- **Class**: Mage (Elementalist subclass)
- **Level**: 2 (leveled up during play)
- **Session Duration**: ~25 minutes of active play
- **Academy Progress**: 6/7+ tasks completed (Enlist, Basic, Skills, Combat, Health, Equipment; Economy in progress)
- **Kills**: 5 vipers in Forest of Li'Dnesh
- **Gold Earned**: ~7,951 total

---

## Step-by-Step Playthrough

### 1. Initial Orientation (Outside Academy)
- Checked `status.json`, `blackboard.json`, and `output-buffer.txt` -- all working
- Used `look`, `score`, `spells`, `inventory` to orient
- Starting stats: 160 HP, 150 mana, 1 spell (Magic Missile at 50%, costs 25 mana), 12 practices, 9 trains
- Artephius (warrior) and Zosimos (ninja) visible in same room

### 2. Communication Testing
- Sent `tell` to both Artephius and Zosimos -- both confirmed "is catching tells"
- `replay` command successfully showed timestamped tell history
- Zosimos appeared on `[Newbie]` channel -- public channels visible in output
- Zosimos appeared on `(Group)` channel -- group communication working
- **Observation**: Tells work reliably. The "is catching tells" confirmation is useful feedback. `replay` is essential since tells arrive asynchronously between our polling.

### 3. Follow Mechanic Testing
- Used `follow Artephius` -- confirmed "You start to follow Artephius"
- When Artephius moved, I auto-followed through multiple rooms (Courtyard -> Fountain -> Main Entrance)
- **Critical finding**: `follow` OVERRIDES your own movement commands. When I tried `east`, Artephius went `west` and I was pulled west. This is a major pain point for an AI agent -- you lose autonomous navigation control while following.
- Used `follow self` to stop following -- this worked correctly
- **Was never actually grouped** -- `group` showed "You are not currently in a group." Despite following, the formal group mechanic requires the leader to `group Sendivog`.

### 4. Academy Tutorial (Basic Training)
- Enlisted with recruiter via `enlist` -- immediate task completion
- Navigated to Basic Training classroom (west from foyer)
- Started lesson with `start` -- NPC Claire begins timed dialogue
- **Major pain point**: Lesson dialogue is NPC-timed with long delays (30-60+ seconds between lines). The IPC system can't easily "wait for lesson complete."
- Discovered `faster` command (maxed at speed 7 "Extremely fast")
- Discovered `quiz` command to skip lessons entirely -- game says "Skipping classes huh?" and jumps to quiz
- **Quiz interaction**: Questions answered via `tell claire <letter>`. Open-ended questions answered via `tell claire <answer>`.
- Scored 3/3 on Basic Training quiz: Charisma (not a stat), Train (view costs), Exits (visible exits helpfile)
- Reward: 150 XP + 500 gold

### 5. Skills/Spells Training
- Navigated east from foyer
- Skipped to quiz immediately
- Scored 3/3: `spells resist` (filter spells), 45 (fireball spell number), `affects` (see active effects)
- Reward: 150 XP + 1,000 gold
- **Caster-relevant data**: Full spell list showed 100+ spells from level 1 to 201. My current castable: Magic Missile only.

### 6. Combat Training -- The Core Test
- Navigated to Combat Training Room (WNNW from skills)
- Skipped to assignment (no quiz -- this was a field mission)
- Assignment: Kill vipers in Forest of Li'Dnesh, bring back a viper skin
- Used `speedwalks li'dnesh` -- returned "run 2s8e5ne5n3e" from recall
- Used `recall` then `run 2s8e5ne5n3e` -- speedwalk worked perfectly, arrived at forest entrance
- Used `scan` to locate creatures in nearby rooms
- Used `consider viper` -- "should be a fair fight"

#### Combat Details (5 kills):
| Kill | Spell Damage | Melee Damage | Total Rounds | Mana Cost | XP Gained |
|------|-------------|-------------|--------------|-----------|-----------|
| 1    | 6           | 36 (stab)   | 2            | 25        | 139+31    |
| 2    | 7           | 24 (stab)   | 2            | 25        | 133       |
| 3    | 8+8=16      | 0 (spell kill) | 1         | 25        | 144 + LEVEL UP |
| 4    | 7+6=13      | 0 (spell kill) | 1         | 25        | 110       |
| 5    | 5+7=12      | 0 (spell kill) | 1         | 25        | 121 + VIPER SKIN |

- **Spell behavior**: Magic Missile sometimes fires 1 bolt (early kills) and sometimes 2 bolts (later kills). At 50% proficiency, damage ranged 5-8 per bolt.
- **Mana management**: 25 mana per cast. Started at 150 mana, so 6 casts maximum at level 1. After leveling to 2, max mana increased to 173.
- **Proficiency improvement**: After kill 5, Magic Missile improved from 50% to 51% organically through use.
- **Level up**: Gained level 2 on kill 3. Got +14 HP, +23 mana, +15 moves, +4 practices, +3 trains. Unlocked Scrolls skill.
- **Loot**: Viper skin dropped on kill 5 (quest item). Gold dropped from each kill (8-11g). Autoloot/autosac handled corpses.

### 7. Remaining Lessons (Health, Equipment, Economy)
- Health: Skipped with `skip` command. Received 6 potions (2 healing, 2 refresh, 2 black lotus).
- Equipment: Quiz 3/3 after one retry. Learned Keep, Lore, and Hum flag mechanics.
- Economy: Quiz 2/3 (missed auction vs bid distinction). Shopping assignment started but not completed.

---

## What Worked Well

1. **Navigation**: Movement commands (`north`, `south`, etc.) work reliably. `run` speedwalks execute correctly. `recall` returns to city. Room tracking in blackboard is accurate.

2. **Combat casting**: `cast 'magic missile' viper` syntax works perfectly. Spell initiates combat, deals damage, and auto-combat continues. One-shot kills possible with Magic Missile at this level.

3. **Communication**: `tell` commands are reliable. `replay` shows timestamped history. Public channels (Newbie, Group) are visible in output. NPC tells for quizzes work with `tell <npc> <answer>`.

4. **State tracking**: Blackboard accurately tracks HP, mana, maxHP, maxMana, killCount, currentRoom (name, zone, exits), and recentEvents. Combat start and kill events are logged with timestamps.

5. **IPC command batching**: Sending multiple commands in one `ipc-send.js` call works well (e.g., `"north" "look" "score"` all execute sequentially).

6. **Quiz skip mechanic**: Typing `quiz` after `start` skips NPC lessons entirely and jumps to the test. This is essential for AI agents that can't sit through timed dialogue.

---

## What Broke or Was Clunky

### Critical Issues

1. **Timed NPC dialogue is a black hole for AI agents**
   - When Claire starts her lesson, she talks for 3-5 minutes with pauses between lines
   - Our IPC system only sees output when we send a command, so lesson content falls between the cracks
   - The output buffer doesn't capture it all (circular buffer overwrite)
   - **Fix needed**: A "wait for pattern" mechanism that blocks until a specific string appears in output (e.g., `wait:Task Done:120000` to wait up to 2 minutes for task completion). The `wait:` prefix exists in the system but didn't seem to work for this use case.

2. **Follow overrides autonomous movement**
   - When following Artephius, my `east` command was ignored because he went `west`
   - This makes it impossible for a mage to scout independently while grouped
   - **Fix needed**: A way to temporarily suspend following, or a state flag indicating "currently following X" so the AI knows its movement is constrained

3. **Output buffer insufficiency**
   - The output buffer is a circular buffer that overwrites older content
   - Critical NPC dialogue (quiz questions, assignment details) can be lost between polling intervals
   - **Fix needed**: Either a larger buffer, or a structured event log that captures NPC dialogue separately

### Moderate Issues

4. **No mana regeneration tracking**
   - Mana regenerates over time (saw it go from 64 -> 75 -> 86 -> 97 etc. while idle)
   - The blackboard doesn't track regen rate or time-to-full
   - **Useful for casters**: Knowing "I'll have enough mana to cast in X seconds" would enable better combat decisions

5. **Spell proficiency not in blackboard**
   - Magic Missile went from 50% to 51% through use, but this isn't tracked in the blackboard
   - **Useful for casters**: Track current spell proficiencies and alert when they improve

6. **No spell cooldown/lag tracking**
   - After casting a spell, there may be a brief delay before the next action
   - The system doesn't expose this, making it hard to chain spells optimally
   - **Fix needed**: Track spell lag as a blackboard field

7. **Group status not in blackboard**
   - Whether I'm grouped, who the leader is, and party member HP are not tracked
   - This makes coordinated group play difficult for AI agents
   - **Fix needed**: `group` data in blackboard (leader, members, their HP%)

### Minor Issues

8. **Blackboard level field didn't update immediately**
   - After leveling from 1 to 2, the blackboard `level` field still showed "1" for several commands
   - HP and mana updated promptly though

9. **No inventory tracking in blackboard**
   - Items are not tracked (e.g., quest items, potions, equipment)
   - Had to manually check `inventory` to confirm viper skin pickup

10. **Navigation back to academy was manual**
    - After the viper hunt, I had to remember/reconstruct the path back to Commander Dahr
    - Counted rooms wrong on first attempt (ended up at Basic Training instead of Combat)
    - **Fix needed**: A `find combat` equivalent that works from anywhere, or path memory in blackboard

---

## Caster-Specific Tool Improvements Needed

1. **Mana threshold alerts**: Blackboard should flag when mana drops below X% and suggest resting or using potions
2. **Spell damage log**: Track average damage per spell to optimize spell selection at higher levels
3. **Practice recommendations**: With 16 practices available, suggest which spells to practice based on level and usage
4. **Buff tracking**: Track active spell effects (duration remaining) in the blackboard
5. **Target HP estimation**: The combat prompt shows "Enemy: 33%" -- this should be parsed into blackboard for deciding when to cast vs melee
6. **Multi-spell rotation support**: At higher levels with multiple spells, need a way to queue spell rotations (e.g., "cast fireball, then magic missile, then fireball")
7. **Mana potion management**: Track potion inventory and auto-suggest using them when mana is low before combat

---

## Game Design Observations

1. **Tutorial pacing**: The academy tutorial is well-structured with progressive lessons. The "quiz skip" option is genius for repeat players (and AI agents). However, the timed NPC dialogue between quiz unlock is too slow even at max speed.

2. **Combat at level 1**: Magic Missile is satisfying -- low mana cost, reliable damage, can one-shot tutorial mobs. The 25 mana cost with 150 max mana means 6 fights before needing to rest. This creates a natural rhythm of hunt -> rest -> hunt.

3. **Spell proficiency through use**: The organic improvement (50% -> 51% after 5 casts) is a nice touch. It rewards actually using spells in combat rather than just grinding at a trainer.

4. **Quest item drop rate**: The viper skin dropped on kill 5. This feels right for a tutorial -- enough kills to learn combat but not frustratingly many.

5. **XP economy**: With bonus XP from supporters (~100% bonus), leveling was fast. Hit level 2 after 3 viper kills. The donor bonus is extremely generous for new players.

6. **Mage class feel**: Even at level 1, the mage feels distinct from warriors. You're managing mana instead of HP, casting from range (spell initiates combat), and dealing magical damage. The Elementalist subclass promises interesting elemental spells later (Fireball at 38, Lightning Bolt at 52, etc.).

---

## Communication Log with Teammates

### Messages Sent:
- To Artephius: "Sendivog here, your mage. I have Magic Missile ready. Lead the way north when you are ready."
- To Artephius: "I am following you now. Please type 'group Sendivog' to add me to the group."
- To Artephius: "I am heading east to the Skills and Spells classroom."
- To Artephius: "Basic training done! Got 3/3 quiz right. Heading to Skills training now."
- To Artephius: "I have a combat assignment to kill vipers in Forest of LiDnesh. Where are you?"
- To Artephius: "Nice work! I just got my first viper kill but no skin drop yet."
- To Artephius: "Got the viper skin on kill 5! Magic Missile improved to 51 percent through use. Level 2 now."
- To Zosimos: "Sendivog the mage checking in. Let us coordinate through the academy."
- To Zosimos: "I am at the Skills classroom. Need to do Basic Training first."
- To Zosimos: "Heading to Forest of LiDnesh for combat training. Want to come?"
- To Zosimos: "Hey! We are in the same room. Good to see you." (at Combat Training Room)

### Messages Received (via replay):
- From Artephius: "Hey, I'm Artephius the warrior. I'm at the academy entrance. Let's group up."
- From Artephius: "I'm creating a group now. Follow me and I'll add you."
- From Artephius: "Copy that. I'll finish basic training then meet at combat."
- From Artephius: "Basic training complete! Got 150 XP and 500 gold from the quiz."
- From Artephius: "Skills training done. Heading to combat training."
- From Artephius: "Combat assignment: kill vipers in Forest of Li'Dnesh. Speedwalk from recall: run 2s8e5ne5n3e."
- From Artephius: "Got the viper skin! 5 kills total. Heading back to Commander Dahr. Leveled up to 2."
- From Artephius: "I've completed 6 of the academy tasks."
- From Zosimos: "Copy that Sendivog. Ill scout ahead of the group when we need it."
- From Zosimos: "Im in the Academy Courtyard, heading north."
- From Zosimos: "Im already at the forest, just got the viper skin."
- From Zosimos: "How far along are you? Im done with skills, heading to combat now."

### Observations on Communication:
- All three characters progressed independently through the same tutorial at different speeds
- Artephius was fastest (warrior/tank), completing combat first
- Zosimos caught up quickly (thief/ninja)
- I (mage) was slowest, partly due to the long wait on Basic Training lesson before discovering the quiz skip
- **We never actually grouped** despite following working -- the formal group mechanic requires the leader to explicitly add members
- Tell latency is good -- messages arrive before the next polling cycle
- The `replay` command with timestamps is essential for reconstructing conversation flow

---

## Summary of Key Findings

| Category | Rating | Notes |
|----------|--------|-------|
| Navigation | Good | Movement, recall, speedwalks all work. Run command is fast. |
| Combat | Good | Spell casting works. Damage tracking in events log is helpful. |
| Communication | Good | Tells reliable. Replay essential. Public channels visible. |
| Follow/Group | Partial | Follow works but overrides movement. Never got formally grouped. |
| Spell System | Good | Cast syntax works. Proficiency improves through use. Mana costs clear. |
| State Tracking | Adequate | HP/mana/room accurate. Missing: level updates, spell proficiency, group status, inventory. |
| Timed Events | Poor | NPC dialogue is untrackable between polling. Biggest gap for AI agents. |
| Caster Tools | Needs Work | Missing mana regen tracking, spell proficiency tracking, buff tracking, enemy HP parsing. |
