# Grind Session Audit - 2026-03-30

**Auditor:** Claude agent post-session review
**Characters:** Artephius (warrior lv8), Sendivog (mage lv5), Zosimos (thief lv7)
**Session window:** ~17:54 - 19:42 UTC (approx 1h 48m daemon uptime)

---

## 1. Equipment Usage

### Artephius (Warrior lv8)
- **Light:** (Glow) a torch
- **Torso:** Gueldar's crafted leather jerkin
- **Waist:** (Glow) (Hum) a Viper Skin Belt -- YES, tutorial belt equipped
- **Legs:** Gueldar's crafted leather pants
- **Shield:** an Aylorian Shield
- **Weapon:** an Aylorian Sword
- **Empty slots:** head, eyes, ears, neck x2, back, body, arms, wrists, hands, fingers, feet, held, floating
- **Verdict:** Using equipment adequately for level. Has the Viper Skin Belt. 12 empty slots -- should seek upgrades from shops or drops. No drops were equipped during session (none found).

### Sendivog (Mage lv5)
- **Light:** (Glow) a torch
- **Torso:** Gueldar's crafted leather jerkin
- **Waist:** (Glow) (Hum) a Viper Skin Belt -- YES, tutorial belt equipped
- **Legs:** Gueldar's crafted leather pants
- **Shield:** an Aylorian Shield
- **Weapon:** an Aylorian Dirk
- **Empty slots:** Same 12 as Artephius
- **Verdict:** Adequate. Mage using a Dirk (physical weapon) instead of a staff/wand -- may want to find a caster weapon, though at this level it barely matters since Magic Missile is the primary damage.

### Zosimos (Thief lv7)
- **Light:** (Glow) a torch
- **Torso:** Gueldar's crafted leather jerkin
- **Waist:** EMPTY -- **NO Viper Skin Belt!**
- **Legs:** Gueldar's crafted leather pants
- **Shield:** an Aylorian Shield
- **Weapon:** an Aylorian Dirk
- **Empty slots:** 13 (one more than others -- missing belt)
- **Verdict:** **BUG/MISS**: Zosimos did not equip or does not have the Viper Skin Belt from the tutorial. Either he skipped the equipment training step, lost it, or never picked it up. This is the only character missing it.

---

## 2. Navigation & Room Mapping

| Character | Rooms Mapped | Zones Covered |
|-----------|-------------|---------------|
| Artephius | 117 | academy, aylor, mesolar, graveyard, cats |
| Sendivog  | 112 | academy, aylor, mesolar, graveyard |
| Zosimos   | 100 | academy, aylor, mesolar, graveyard |

### Navigation Errors
- **Zero "can't go that way" errors** across all three daemon logs. Navigation was clean.
- **No stuck/lost messages** in any log.
- Room graph quality is good -- rooms have proper exit data from GMCP room.info.

### Notable Navigation Events
- Artephius used `runto fantasy` which sent him to Sheila's Cat Sanctuary (zone: cats, level 25-35) -- way above his level. This was an accidental detour, not a navigation bug.
- Zosimos used `runto` effectively to reach Sen'narre Lake area for quests.
- All three used `recall` + `runto` for fast travel between zones.

---

## 3. NPC Interactions

### Tutorial NPCs
All three characters completed the academy tutorial interacting with:
- **The Recruiter** - enlisted all three
- **Claire** - basic training (quizzes completed)
- **The Receptionist** - class directions
- **Vorth** - skills trainer (Sendivog tried to visit before qualifying)
- **Nurse Orcron** - equipment training direction
- **Vladia** - shopping quest
- **Filt** - equipment/armorer

### Trainer Visits
- **Artephius:** Trained Str 17->23, Con 15->19. Practiced Parry (expert), Dodge (79%), Kick (79%), Hand to Hand (79%), Axe (expert), Enhanced Damage (expert).
- **Sendivog:** Practiced Magic Missile (expert), Shield (63%), Dodge (63%), Blink (50%). 14 practices remaining, ~21 trains remaining.
- **Zosimos:** Issued `practice` command early in session. Specific skills not detailed in logs but Zosimos reached lv7 with 31 kills.

### Quest Interactions
- Artephius: Completed 1 quest ("Kill a field mouse"). 52 QP earned.
- Sendivog: Completed 1 quest ("Kill tiny red imp"). 56 QP earned.
- Zosimos: **Failed 2 quests** (`quest fail` at 19:13 and 19:38). Only 15 QP total -- quest target finding was a problem.

---

## 4. Human Interactions

### Newbie Channel Activity
Significant human player interactions observed:

1. **Ayasinda** (Helper) - Responded to Zosimos' greeting on newbie channel. Said "nope, just do the academy and ask questions." Then "Oh correction I have 1 tip. Have fun." Later helped MoonlitDusk with warrior subclass questions. Zosimos responded naturally: "Thanks Ayasinda! Doing the academy now, appreciate the tip."

2. **Teleron** (Helper) - Chuckled politely at the exchange. Also welcomed Alkahest (another new player).

3. **Level** (Helper) - Welcomed Alkahest, later helped MoonlitDusk with classchange questions.

4. **MoonlitDusk** - A genuine new player asking about warrior subclass/classchange. Zosimos spotted them in a room and said "Hey MoonlitDusk, doing the tutorial too?" -- good social behavior.

5. **Alkahest** - Another character (one of the alchemist batch?) that Helpers welcomed.

6. **Rhizome** - A player Zosimos spotted in a room and greeted with `say Hey Rhizome, how goes it?` -- no response recorded.

### Inter-Agent Communication
The three agents communicated extensively via `tell` and `gtell`:
- Coordinated academy progress
- Shared location info
- Attempted to form group (Alchemists group created, both Sendivog and Zosimos joined)
- Coordinated grinding locations (Artephius recommended Graveyard)
- Zosimos used group chat for scouting reports

### Assessment
The agents' social behavior was natural and appropriate. Zosimos was particularly social -- greeting humans on newbie channel, welcoming other new players, thanking helpers. No suspicious or bot-like interactions flagged by humans.

---

## 5. Combat Effectiveness

### Artephius (42 kills)
- Dominated academy garden mobs (one-shot kills by level 5-6)
- **Cat Sanctuary incident (19:28):** Used `runto fantasy`, arrived at Sheila's Cat Sanctuary (lv25-35 zone). Attacked "a white cat." Combat timeline:
  - 19:28:22 - Engaged white cat at 269/269 HP
  - 19:28:24 - HP dropped to 248 (cat enemypct 96%)
  - 19:28:27 - HP dropped to 209
  - 19:28:30 - HP dropped to 199, `flee` sent (from agent)
  - 19:28:30 - Flee FAILED (still Fighting)
  - 19:28:32 - `recall` sent (also failed in combat)
  - 19:28:33 - HP dropped to 139
  - 19:28:36 - HP dropped to 124/269 (46%)
  - **19:28:36 - REFLEX FIRED: `quaff heal`** -- both reflex engine and legacy handler
  - 19:28:36 - HP restored to 269 (heal potion worked!)
  - 19:28:39 - HP dropped to 251 (still fighting)
  - 19:28:40 - Second `flee` SUCCESS -- escaped to "Outside the cats' home"
  - 19:28:41 - State: combat -> resting -> idle

**Analysis:** The reflex heal saved Artephius' life. The cat was dealing ~20-30 damage per round. At the rate of HP loss (~40 HP per 3s tick), Artephius would have died in about 2 more rounds without the heal. The first flee failed (normal on Aardwolf -- flee has a chance to fail). Combat detection worked correctly throughout.

**Double Reflex Issue CONFIRMED:** At 19:28:36, the log shows:
```
[REFLEX] Rule "combat-heal": quaff heal
[FIRE] Rule "combat-heal": quaff heal
[REFLEX] Auto-heal triggered: 124/269 (46%)
[REFLEX] Legacy: "quaff heal"
```
Both the new reflexEngine AND the legacy gameState handler fired, sending `quaff heal` TWICE. The second one was wasted (already at full HP). This needs fixing.

### Sendivog (12 kills)
- Primary damage: Magic Missile (expert proficiency)
- Killed: tiny red imp (quest), bats, undead slayer, raven, maggot, banshee
- No HP crisis events -- never needed reflexes
- Lower kill count due to slower mage gameplay (mana management, rest cycles)

### Zosimos (31 kills)
- Most active grinder in the latter half of session
- Killed: field mice, lizards, toads, beetles, earthworms, rabbits (academy mobs)
- No HP crisis events -- academy mobs too weak
- 2 quest failures suggest target-finding issues (Sen'narre Lake quest mobs may have been hard to locate)

---

## 6. Bug Inventory

### CONFIRMED BUGS

1. **Double Reflex Firing (P0)**
   - Both `reflexEngine.on('action')` AND `gameState.on('reflex')` fire simultaneously
   - Line 258-264 in daemon.js: legacy handler sends the command a second time
   - Evidence: Artephius log at 19:28:36 shows `quaff heal` sent twice
   - **Fix:** Remove the legacy handler

2. **Channel Parsing Not Working for Sendivog/Zosimos (P1)**
   - Digest events show `[undefined] undefined: ` for ALL channel events
   - The double-encode fix exists in daemon.js (line 408-418) but Sendivog and Zosimos were NOT restarted after the fix was deployed
   - Artephius was restarted (uptime 1035s vs 2430s for others) and his digest does NOT show this bug
   - **Fix:** Restart Sendivog and Zosimos processes

3. **Blackboard Level Stuck at 1 (P2)**
   - Artephius blackboard `level` shows value `1` despite being level 8
   - World model correctly shows level 8
   - Status.json shows hp/mana as percentage (100/100) not actual values -- likely a related normalization issue
   - The blackboard is pulling from a different data source than the world model

4. **Zosimos Missing Viper Skin Belt (P2)**
   - Tutorial belt not equipped. Either skipped tutorial equipment step or dropped it
   - Other two characters have it

5. **Kill Count Discrepancy (P3)**
   - Artephius: blackboard 42 kills, world model 37 kills
   - Sendivog: blackboard 12 kills, world model 7 kills
   - Zosimos: blackboard 31 kills, world model 24 kills
   - Blackboard counts are consistently higher. Likely the blackboard increments on all kill events while world model only counts certain types.

### WARNINGS (Not Bugs)

6. **Connection Resets (ECONNRESET)**
   - Artephius: 4 connection resets (18:51, 18:55, 18:59, 19:02)
   - Sendivog: 3 connection resets (18:51, 18:56, 19:02)
   - Zosimos: 2 connection resets (18:51, 18:56)
   - All reconnected successfully. The 18:51 cluster suggests a server-side event. This is normal for long MUD sessions.

7. **Zosimos Quest Failures**
   - 2 quest failures (sent `quest fail` at 19:13 and 19:38)
   - Likely couldn't find/reach quest targets within time limit. Not a daemon bug -- game navigation challenge.

8. **Status.json HP/Mana Showing Percentages**
   - Artephius status.json: hp 100, maxHp 100 (should be 269/269)
   - This appears to be percentage-based reporting rather than actual values
   - The blackboard inside status.json has the same issue

---

## Session Statistics Summary

| Metric | Artephius | Sendivog | Zosimos |
|--------|-----------|----------|---------|
| Class | Warrior (Barbarian) | Mage (Elementalist) | Thief (Ninja) |
| Level | 8 | 5 | 7 |
| HP | 269 | 215 | 244 |
| Mana | 260 | 246 | 241 |
| Kills (blackboard) | 42 | 12 | 31 |
| Kills (world model) | 37 | 7 | 24 |
| TNL | 530 | 766 | 601 |
| Gold | 11,342 | 10,606 | 7,674 |
| Quest Points | 52 | 56 | 15 |
| Rooms Mapped | 117 | 112 | 100 |
| Deaths | 0 | 0 | 0 |
| Reflex Fires | 1 (heal) | 0 | 0 |
| Quest Failures | 0 | 0 | 2 |
| Current Location | Mist-Shrouded Moorland (mesolar) | In the Graveyard | The Graveyard Gates |

---

## Grind Reports Found

- `/Users/jordanpatz/mud-daemon-gamestate/reports/artephius-grind-report.md` - Detailed, 124 lines. Covers levels 2-8, combat observations, reflex engine test.
- `/Users/jordanpatz/mud-daemon-gamestate/reports/sendivog-grind-report.md` - Detailed, 93 lines. Covers levels 2-5, spell management, mana economy.
- **No Zosimos grind report found.** Zosimos' agent did not write a grind report.
