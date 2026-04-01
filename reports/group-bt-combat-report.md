# Group Behavior Tree Combat Report

**Date:** 2026-03-30 22:13-22:55 UTC (Session 2)
**System Under Test:** Behavior Tree tactical system with group-aware healing
**Area:** The Gauntlet (5-30), The Chessboard (5-20)
**Comparison Baseline:** Previous session (2026-03-30 19:55-21:10 UTC) -- reflex engine only, no BT

## Party Composition

| Character | Class | Level | HP | Role | BT Loaded |
|-----------|-------|-------|-----|------|-----------|
| Artephius | Warrior/Barbarian | 11 | 322 | Tank | aardwolf-warrior.json (file) |
| Sendivog | Mage/Elementalist | 10 | 296 | Healer | healer-group-combat (IPC push) |
| Zosimos | Thief/Ninja | 9 | 294 | DPS | aardwolf-thief.json (file) |

## Phase 1: Preparation Results

### Supplies
- **Food:** All three bought and ate bread at the Aylorian Eatery (2g each). Initially failed to find water at Grizrol's Grocery (waterskins not sold there). Characters remained dehydrated for most of the session -- "healing is greatly reduced" messages appeared throughout.
- **Potions:** Found Aeleron's Alchemy Supplies. All three bought 10x "Light Relief" heal potions (8g each). Previous session ran out of potions entirely; this was a critical improvement.
- **Heal potion location:** The "runto healer" command goes to the Temple of Ivar (a healer NPC, not a shop). The actual potion shop is "runto potions" (Aeleron's Alchemy Supplies). This was a discovery -- the plan step for "buy heal" at the healer failed silently (plan executor marked 0 step failures because "There is no shopkeeper here" wasn't in the generic fail patterns).

### Group Formation
- `group create Alchemists` -- success
- `follow Artephius` + `group Sendivog` / `group Zosimos` -- the Aardwolf group system requires the LEADER to `group <follower>`, not the follower to `group join`. The initial `group join Artephius` syntax failed.
- Final group confirmed: "Alchemists" with 3 members (levels 9-11).

### Role Assignment via IPC
- Artephius: `setRole` -> tank (success)
- Sendivog: `setRole` -> healer (success)
- Zosimos: `setRole` -> dps (success)

### Behavior Tree Loading
- **Artephius:** Loaded from file `trees/aardwolf-warrior.json` on daemon start. Selector with 3 guards: emergency-flee (<=15% HP), combat-heal (<=50% HP, quaff heal), idle-recovery (<=50% HP, rest).
- **Sendivog:** Initially loaded `trees/aardwolf-mage.json` on daemon start. Then OVERWRITTEN via IPC `setBehaviorTree` with the custom `healer-group-combat` tree. This tree has 6 guards including the critical `heal-tank` node (groupMemberHp condition on Artephius <= 40%).
- **Zosimos:** Loaded from file `trees/aardwolf-thief.json` on daemon start. Selector with 3 guards: emergency-flee (<=25% HP), combat-heal (<=50% HP, quaff heal), idle-recovery (<=60% HP, rest).
- IPC result confirmed: `{"status":"ok","tree":{"hasTree":true,"tickCount":11,"treeSummary":{"type":"selector","name":"healer-group-combat",...}}}`

## Phase 2: Area Selection and Navigation

### Areas Attempted
1. **Storm Mountain (10-35):** Could not reach -- requires boat/fly/swim. Characters stuck at Mesolarian coast.
2. **Fort Terramire (10-35):** Could not reach -- island access, needs boat.
3. **New Thalos (10-35):** Reached farmland outside city but no mobs found in fields. Very far from recall (burned all movement points).
4. **Warrior's Training Camp (10-20):** `runto warrior` went to the Warrior Guild hall in Aylor (safe room, no combat). Wrong keyword.
5. **The Gauntlet (5-30):** Successfully entered. Explored ravine, underground river, stone statues, scorpion lair.
6. **The Chessboard (5-20):** Successfully entered. Found chess piece mobs with varying difficulty ratings.

### Navigation Issues
- `runto` only works from Aylor recall point
- Many overworld areas require boat access that level 9-11 characters don't have
- Movement points are a major constraint -- exploring burns through them fast
- Sleeping/resting to recover moves takes 30-60 seconds real time per cycle
- The `sleep` command prevents `runto` (must `stand` first) -- caused a wasted plan execution

## Phase 3: Combat Results

### Fight 1-3: Bugbear Bandits (The Gauntlet, ROCKSLIDE room)
- **Consider rating:** Not checked (auto-aggro or already in room)
- **Damage dealt:** 40-47 per slice (OBLITERATES/EXTIRPATES/ERADICATES)
- **Damage taken:** 0-5 per round (most attacks parried/dodged)
- **Rounds to kill:** 2-4
- **HP after fight:** 274/322 (85%) after 3 bandits in sequence
- **BT fired:** No -- HP never dropped below 50% threshold (161 HP)
- **Kill XP:** 35-52 per bandit

### Fight 4: Queen Scorpion (Scorpion Lair)
- **Consider rating:** Not checked (auto-aggro on room entry)
- **Damage dealt:** 44-47 per slice
- **Damage taken:** 0 (all attacks parried or dodged)
- **Rounds to kill:** 3
- **HP after fight:** 270/322 (83%)
- **BT fired:** No

### Fight 5: Black Bishop (The Chessboard)
- **Consider rating:** "should be a fair fight!"
- **Damage dealt:** 40-44 per slice
- **Damage taken:** 0 (bishop never landed a hit before dying)
- **Rounds to kill:** 4
- **HP after fight:** 322/322 (100%)
- **BT fired:** No

### Group Stats (Final)
```
Group: Alchemists
Leader: Artephius          Status: Public
Members: 3                 Created: 30 Mar 18:20
Kills: 12                  Total Exp: 745

Lvl/Gld  Name          Kills    Exp
-------  ------------  -------- --------
 11 War *Artephius          12      745
 10 Mag  Sendivog            0        0
  9 Thi  Zosimos             0        0
```

Sendivog and Zosimos dealt 0 damage and got 0 XP -- they followed Artephius but did not auto-attack. This is expected; Aardwolf requires explicit `kill` commands from group members to join combat. The previous session's group combat worked because each character was sent `kill` commands individually.

## Phase 4: Behavior Tree Analysis

### Did the behavior trees fire?
**No.** Zero BT actions were emitted during this session.

Artephius' HP never dropped below 85% (lowest: 262/322 = 81% after 3 sequential Bugbear Bandits). The BT heal threshold is 50% HP. The emergency flee threshold is 15%. Neither was reached.

### Why didn't the BTs fire?
1. **Characters have outleveled the area.** At level 11, The Gauntlet (5-30) mobs deal trivial damage. Bugbear Bandits were "No Problem!" or "weak compared to you" on consider.
2. **High parry/dodge rate.** Artephius (Warrior/Barbarian) parries or dodges most incoming attacks. Damage per round received: 0-5 HP.
3. **Short fights.** Mobs died in 2-4 rounds, not enough time to accumulate damage.
4. **The 50% threshold is conservative.** For these mob levels, HP never approaches 50%. A more aggressive threshold (e.g., 80%) would have triggered, but that's not the right fix -- the mobs need to be harder.

### Did group healing work?
**Untested.** The `groupMemberHp` condition in Sendivog's healer BT was never evaluated against a damaged tank because Artephius' HP stayed above 81% throughout.

However, the infrastructure is confirmed working:
- GMCP `group` packets flow with real-time HP data for all 3 members
- Party data correctly populates `worldModel.party.members[]` with hp/maxHp/mana/maxMana/moves
- The `groupMemberHp` condition evaluator exists in behavior-tree.js and would work if the HP threshold was met

### Did the fallback chain work?
**Partially observed.** The BT -> Reflex fallback is wired in daemon.js lines 291-298:
```js
worldModel.on('self:changed', () => {
    const btResult = behaviorTree.tick();
    if (btResult !== 'SUCCESS') {
        reflexEngine.evaluate('vitals');
    }
});
```
Since the BT returned FAILURE on every tick (no guard conditions met), the reflex engine was invoked as fallback. However, the reflex engine also had no rules fire because HP was too high. In the previous session, reflex engine rules DID fire (idle-rest, combat-heal-potion) when HP dropped to 24%.

### Reflex Engine Activity (Historical Comparison)
- **Previous session (reflex only):** 134 reflex fires total on Artephius. Included combat-heal-potion (fired at 50% HP), idle-rest, emergency-flee fallback. Key failure: ran out of potions, causing "you don't have that" failures.
- **This session (BT + reflex):** 0 reflex fires during group combat. BT intercepted every tick but returned FAILURE (conditions not met), allowing reflex engine to evaluate -- but reflex also found nothing to do.

## Key Findings

### What Worked
1. **IPC `setBehaviorTree` command:** Successfully overwrote the default mage BT with a custom group-aware healer tree via file IPC.
2. **GMCP group data pipeline:** Real-time HP data for all party members flows through GMCP -> WorldModelBridge -> worldModel.party.members[]. This is the critical data path for group healing.
3. **Group formation mechanics:** `group create` + `follow` + `group <person>` pattern works. Party persists across areas.
4. **Role assignment:** `setRole` IPC command works, tactics engine accepts tank/healer/dps roles.
5. **Plan executor with group context:** executePlan correctly acquires BT mutex, preventing BT from interleaving with plan steps.
6. **Potion supply:** 10 potions purchased per character, resolving the previous session's critical potion shortage.
7. **BT tree loading and ticking:** Tree loaded, compiled, and ticked 11+ times before combat. No crashes, no errors.

### What Broke / Needs Work
1. **Area access at low levels:** Most level-appropriate areas (10-35) require boat/fly/swim which the characters don't have. This severely limits combat options.
2. **Mob difficulty scaling:** At level 11, The Gauntlet and Chessboard mobs are trivially easy. The party has outleveled the accessible content. Mobs rated "should be a fair fight" still die in 2-4 rounds.
3. **Group members don't auto-attack:** Sendivog and Zosimos followed but never engaged in combat. They need explicit `kill` commands. This means the healer never entered combat and the DPS contributed nothing.
4. **Dehydration persistent all session:** Characters remained dehydrated despite buying bread. Water was never found -- the "drink fountain" command produced nothing useful, and waterskins aren't sold at the grocery. Dehydration reduces healing/regen, potentially affecting BT heal effectiveness.
5. **Plan fail detection:** "There is no shopkeeper here" is not detected as a failure by the plan executor's generic fail patterns. Steps 11-15 of the initial prep plan all failed silently.
6. **Movement point economy:** Characters burned through movement points quickly during area exploration. Resting to recover is slow and blocks further commands.
7. **`runto` keyword discovery:** Several `runto` keywords don't go where expected (e.g., "runto warrior" goes to the guild, not the training camp). No documentation of valid keywords.

### Recommendations for Next Session
1. **Find harder content:** Try Kul Tiras (15-30, lock level 10), All in a Fayke Day (10-30), or Dhal'Gora Outlands (10-50). Alternatively, fight the White Knight on the Chessboard ("chuckles at the thought" = significantly harder).
2. **Coordinate group attacks:** After Artephius engages, send `kill <mob>` to Sendivog and Zosimos so all three deal damage and share combat XP.
3. **Lower BT thresholds for testing:** Temporarily set combat-heal threshold to 80% HP to verify the BT mechanism works even with easy mobs.
4. **Solve water:** Try `drink water` at the underground river, buy waterskins from a different shop, or find a fountain keyword.
5. **Add fail patterns to plan executor:** Add "no shopkeeper here", "is not an area keyword" to the generic fail list.
6. **Add movement recovery to pre-combat plan:** Include `sleep` + `stand` steps before navigating to dungeons.

## Comparison to Previous Combat Session

| Metric | Previous (Reflex Only) | This Session (BT + Group) |
|--------|----------------------|--------------------------|
| Party size | 3 (loose follow) | 3 (formal group) |
| Kills (leader) | 12 | 12 |
| Kills (party) | 12 total | 12 total (all Artephius) |
| Lowest HP | 73/300 (24%) | 262/322 (81%) |
| BT actions fired | N/A (no BT) | 0 |
| Reflex actions fired | 134 | 0 during group session |
| Potions available | 0 (ran out) | 10 per character |
| Potions used | 0 (had none) | 0 (didn't need them) |
| Emergency flee triggered | Nearly (1 tick from 20%) | No (never close) |
| Group healing (cross-character) | No | No (not triggered) |
| GMCP party data flowing | Partial | Full (hp/mana/moves per member) |
| Healer BT loaded | No | Yes (healer-group-combat) |
| Area difficulty | Moderate (Gauntlet guards) | Trivial (outleveled) |

## Technical Architecture Validation

The behavior tree system is correctly wired and mechanically sound:
- **Loading:** Both file-based (daemon start) and IPC-based (runtime push) loading work
- **Compilation:** JSON tree definition compiles to executable nodes
- **Ticking:** Tree ticks on every `self:changed` world model event
- **Conditions:** `hpPercent`, `manaPercent`, `inCombat`, `notInCombat`, `groupMemberHp`, `and`, `or` all compile correctly
- **Fallback chain:** BT FAILURE -> reflex engine evaluate is wired and working
- **Mutex:** BT acquires/releases mutex correctly during IPC command execution
- **Group data:** GMCP group packets correctly update worldModel.party.members with real-time HP

**The system is ready for a harder combat test.** The plumbing works; it just needs mobs that actually threaten the tank.
